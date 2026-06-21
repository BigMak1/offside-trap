// Offside Trap — pixel render pipeline (Stage 4: Dragonsweeper model).
// Low-res logical canvas, nearest-neighbour, integer CSS upscale only.
(function (global) {
  "use strict";

  var TILE = 32;            // 32px world (PixelLab sprites are native 32; 16px sprites scale ×2 at draw time)
  var GOAL_BAND = TILE;
  var PAL = { gold: "#FFE14D", white: "#F3F1E2", red: "#E5484D", ink: "#0B1322", green: "#4FBE6C" };

  var SPRITE_NAMES = [
    "tile-hidden", "tile-revealed-empty", "tile-grass-b", "ball", "marker-cone",
    "goal-left", "goal-mid", "goal-right",
    "defender-1", "defender-2", "defender-3", "defender-4", "keeper",
    "artifact-save", "artifact-scout",
    "num-0", "num-1", "num-2", "num-3", "num-4", "num-5", "num-6", "num-7", "num-8", "num-9",
    "particle-spark", "particle-confetti", "particle-ring",
  ];
  var NUM_W = 10, NUM_H = 14, NUM_GAP = 2;   // digit glyphs scale ×2 with the 32px tile

  function loadSprites(basePath) {
    basePath = basePath || "assets/";
    var imgs = {};
    return Promise.all(SPRITE_NAMES.map(function (name) {
      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () { imgs[name] = img; resolve(); };
        img.onerror = function () { reject(new Error("Failed to load " + name)); };
        img.src = basePath + name + ".png?v=20260622";
      });
    })).then(function () { return imgs; });
  }

  function Renderer(canvas, sprites, cfg) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.sprites = sprites;
    this.scale = 1;
    this.hover = -1;
    this.showDebug = false;
    this.reveals = {};
    this.particles = [];
    this.pickups = [];
    this.flash = 0;
    this.goalFlashUntil = 0;
    this.shakeUntil = 0;
    this.ballPos = null;
    this.now = 0;
    this.state = null;
    this.configure(cfg);
  }

  Renderer.prototype.configure = function (cfg) {
    this.cfg = cfg;
    this.W = cfg.cols * TILE;
    this.H = cfg.rows * TILE + GOAL_BAND;
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.ctx.imageSmoothingEnabled = false;
    this.revealAll = false;
  };

  Renderer.prototype.setState = function (state) {
    this.state = state;
    var c = this.cellCenter(state.ballIdx);
    this.ballPos = { x: c.x, y: c.y };
  };

  Renderer.prototype.fitTo = function (maxW, maxH) {
    this.scale = Math.max(1, Math.floor(Math.min(maxW / this.W, maxH / this.H)));
    this.canvas.style.width = this.W * this.scale + "px";
    this.canvas.style.height = this.H * this.scale + "px";
    return this.scale;
  };

  // Force an exact integer scale (desktop: scale by column width, scroll the panel vertically).
  Renderer.prototype.setScale = function (s) {
    this.scale = Math.max(1, s | 0);
    this.canvas.style.width = this.W * this.scale + "px";
    this.canvas.style.height = this.H * this.scale + "px";
    return this.scale;
  };

  Renderer.prototype.cellRect = function (idx) {
    var cols = this.cfg.cols;
    return { x: (idx % cols) * TILE, y: GOAL_BAND + Math.floor(idx / cols) * TILE };
  };
  Renderer.prototype.cellCenter = function (idx) {
    var r = this.cellRect(idx);
    return { x: r.x + TILE / 2, y: r.y + TILE / 2 };
  };

  Renderer.prototype.cellAtClient = function (clientX, clientY) {
    var rect = this.canvas.getBoundingClientRect();
    var lx = (clientX - rect.left) / this.scale, ly = (clientY - rect.top) / this.scale;
    if (ly < GOAL_BAND) return -1;
    var col = Math.floor(lx / TILE), row = Math.floor((ly - GOAL_BAND) / TILE);
    if (col < 0 || col >= this.cfg.cols || row < 0 || row >= this.cfg.rows) return -1;
    return row * this.cfg.cols + col;
  };

  // ── events → juice ──────────────────────────────────────────────────────────
  Renderer.prototype.onEvents = function (events, now) {
    var self = this, order = 0;
    events.forEach(function (e) {
      if (e.type === "reveal" || e.type === "save") {
        self.reveals[e.idx] = { start: now + order * 20, dur: 170 };
        order++;
      }
      if (e.type === "artifact") { self.pickups.push({ sprite: "artifact-" + e.kind, idx: e.idx, born: now, dur: 1100 }); self.spawnBurst(e.idx, e.kind === "save" ? PAL.gold : PAL.green, 20); }
      else if (e.type === "save") { self.shakeUntil = now + 220; self.spawnBurst(e.idx, PAL.gold, 18); }  // glove save — not a hit
      else if (e.type === "duel") { self.shakeUntil = now + 380; self.flash = now; self.spawnBurst(e.idx, PAL.red, 14); }
      else if (e.type === "goal") { self.goalFlashUntil = now + 750; self.shakeUntil = now + 450; self.spawnBurst(e.idx, PAL.gold, 34); }
      else if (e.type === "gameover") { self.revealAll = true; self.flash = now; self.shakeUntil = now + 500; self.spawnBurst(typeof e.idx === "number" ? e.idx : self.state.ballIdx, PAL.red, 22); }
      else if (e.type === "illegal") self.shakeUntil = now + 160;
    });
  };

  Renderer.prototype.spawnBurst = function (idx, color, count) {
    var c = this.cellCenter(idx), parts = ["particle-spark", "particle-confetti", "particle-ring"];
    for (var i = 0; i < count; i++) {
      var ang = Math.random() * Math.PI * 2, spd = 0.4 + Math.random() * 1.4;
      this.particles.push({
        x: c.x, y: c.y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 0.8,
        life: 600 + Math.random() * 500, born: this.now,
        sprite: parts[(Math.random() * parts.length) | 0], tint: color,
      });
    }
  };

  // ── drawing ──────────────────────────────────────────────────────────────────
  // Draw a sprite. With w/h given, scale to that box (nearest-neighbour, since
  // imageSmoothingEnabled=false) — lets 16px sprites fill a 32px tile crisply.
  Renderer.prototype.drawSprite = function (name, x, y, w, h) {
    var img = this.sprites[name];
    if (!img) return;
    if (w) this.ctx.drawImage(img, Math.round(x), Math.round(y), w, h);
    else this.ctx.drawImage(img, Math.round(x), Math.round(y));
  };

  // Composite a multi-digit number in a TILE box at (bx,by), over a backing pill.
  // opts.backing: true (dark pill) | colour string (coloured pill) | falsy (none).
  // opts.anchor === "bottom" pins it to the cell's bottom edge (Dragonsweeper-style HP
  // badge, so the character above stays visible); otherwise it is vertically centred
  // (+ opts.dy nudge) — used for pressure numbers on empty cells.
  Renderer.prototype.drawNumber = function (n, bx, by, opts) {
    opts = opts || {};
    var ctx = this.ctx, s = "" + n;
    var gw = opts.small ? 7 : NUM_W, gh = opts.small ? 9 : NUM_H, gap = opts.small ? 1 : NUM_GAP;
    var w = s.length * gw + (s.length - 1) * gap;
    var x = Math.round(bx + (TILE - w) / 2);
    var y = opts.anchor === "bottom"
      ? by + TILE - gh - 1
      : Math.round(by + (TILE - gh) / 2) + (opts.dy || 0);
    var backing = opts.backing;
    if (backing) {
      ctx.globalAlpha = backing === true ? 0.5 : 0.85;
      ctx.fillStyle = backing === true ? PAL.ink : backing;
      ctx.fillRect(x - 1, y - 1, w + 2, gh + 2);
      ctx.globalAlpha = 1;
    }
    for (var i = 0; i < s.length; i++) {
      this.drawSprite("num-" + s[i], x, y, gw, gh);
      x += gw + gap;
    }
  };

  // Draw an opponent (defender/keeper) centred in the cell with margin. Deduction mode has no
  // HP/stamina, so there is no number label; beaten defenders stay full-colour (not faded).
  Renderer.prototype.drawToken = function (spriteName, r, alpha) {
    var size = Math.round(TILE * 0.78);
    var x = r.x + Math.round((TILE - size) / 2), y = r.y + Math.round((TILE - size) / 2);
    if (alpha != null) this.ctx.globalAlpha = alpha;
    this.drawSprite(spriteName, x, y, size, size);
    if (alpha != null) this.ctx.globalAlpha = 1;
  };

  // Draw an artifact pickup ('save'|'scout') centred in the cell.
  Renderer.prototype.drawArtifact = function (kind, r, alpha) {
    var size = Math.round(TILE * 0.66);
    var x = r.x + Math.round((TILE - size) / 2), y = r.y + Math.round((TILE - size) / 2);
    if (alpha != null && alpha < 1) this.ctx.globalAlpha = alpha;
    this.drawSprite("artifact-" + kind, x, y, size, size);
    this.ctx.globalAlpha = 1;
  };

  // Revealed grass alternates light/dark by column → mown pitch stripes.
  Renderer.prototype.grassName = function (idx) {
    return (idx % this.cfg.cols) % 2 === 0 ? "tile-revealed-empty" : "tile-grass-b";
  };

  Renderer.prototype.drawGoalFrame = function () {
    this.drawSprite("goal-left", 0, 0, TILE, TILE);
    for (var c = 1; c < this.cfg.cols - 1; c++) this.drawSprite("goal-mid", c * TILE, 0, TILE, TILE);
    this.drawSprite("goal-right", (this.cfg.cols - 1) * TILE, 0, TILE, TILE);
  };

  Renderer.prototype.drawCell = function (idx) {
    var ctx = this.ctx, cell = this.state.board.cells[idx], r = this.cellRect(idx);

    // KEEPER — the goal: revealed from the start, trivial (HP 1). Reaching it wins.
    if (cell.kind === "keeper") {
      if (!cell.beaten) {
        this.drawSprite("tile-hidden", r.x, r.y, TILE, TILE);
        this.drawToken("keeper", r);
      } else {
        this.drawSprite(this.grassName(idx), r.x, r.y, TILE, TILE);
        ctx.globalAlpha = 0.3; this.drawSprite("keeper", r.x, r.y, TILE, TILE); ctx.globalAlpha = 1;
      }
      return;
    }

    var anim = this.reveals[idx];
    var revealing = anim && this.now >= anim.start;
    var field = cell.kind === "field" && cell.power > 0;

    if (!cell.revealed || (anim && this.now < anim.start)) {
      this.drawSprite("tile-hidden", r.x, r.y, TILE, TILE);
      if (cell.marked) this.drawSprite("marker-cone", r.x, r.y, TILE, TILE);
      if (field && (this.showDebug || this.revealAll)) {
        this.drawToken("defender-" + cell.power, r);
      } else if (cell.artifact && (this.showDebug || this.revealAll)) {
        this.drawArtifact(cell.artifact, r, 0.7);
      }
      return;
    }

    var h = TILE;
    if (revealing) {
      var t = Math.min(1, (this.now - anim.start) / anim.dur);
      h = Math.max(2, Math.round(TILE * t));
      if (t >= 1) delete this.reveals[idx];
    }
    var top = r.y + Math.floor((TILE - h) / 2);
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, top, TILE, h); ctx.clip();

    this.drawSprite(this.grassName(idx), r.x, r.y, TILE, TILE);
    if (cell.lost) {
      this.drawToken("defender-" + (cell.power || 1), r);
    } else if (field && cell.beaten) {
      this.drawToken("defender-" + cell.power, r);     // beaten defender stays full-colour
    } else if (cell.artifact) {
      this.drawArtifact(cell.artifact, r, 1);
    } else if (cell.pressure > 0) {
      this.drawNumber(cell.pressure, r.x, r.y, { backing: true });
    }
    ctx.restore();

    if (revealing) {
      ctx.fillStyle = PAL.white;
      ctx.globalAlpha = 0.5 * (1 - h / TILE) + 0.1;
      ctx.fillRect(r.x, top, TILE, h);
      ctx.globalAlpha = 1;
    }
  };

  Renderer.prototype.drawGlow = function (idx, color, alpha) {
    var ctx = this.ctx, r = this.cellRect(idx);
    ctx.save();
    ctx.globalAlpha = alpha * 0.5; ctx.fillStyle = color;
    ctx.fillRect(r.x + 1, r.y + 1, TILE - 2, TILE - 2);
    ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, TILE - 1, TILE - 1);
    ctx.restore();
  };

  Renderer.prototype.drawParticles = function () {
    var ctx = this.ctx, now = this.now, keep = [];
    for (var i = 0; i < this.particles.length; i++) {
      var pt = this.particles[i], age = now - pt.born;
      if (age > pt.life) continue;
      var dt = age / 16, px = pt.x + pt.vx * dt, py = pt.y + pt.vy * dt + 0.012 * dt * dt;
      ctx.globalAlpha = Math.max(0, 1 - age / pt.life);
      this.drawSprite(pt.sprite, px - 8, py - 8, 16, 16);
      keep.push(pt);
    }
    ctx.globalAlpha = 1;
    this.particles = keep;
  };

  // Artifact pickup flourish: the item floats up, grows, and fades over ~1.1s (prominent + lasting).
  Renderer.prototype.drawPickups = function () {
    var ctx = this.ctx, now = this.now, keep = [];
    for (var i = 0; i < this.pickups.length; i++) {
      var p = this.pickups[i], t = (now - p.born) / p.dur;
      if (t >= 1) continue;
      var c = this.cellCenter(p.idx);
      var ease = 1 - (1 - t) * (1 - t);                       // easeOut
      var size = Math.round(TILE * (0.7 + 0.95 * ease));       // grow ~0.7 -> 1.65 of a tile
      var rise = Math.round(TILE * 0.7 * ease);                // float upward
      ctx.globalAlpha = t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4);  // hold, then fade
      this.drawSprite(p.sprite, Math.round(c.x - size / 2), Math.round(c.y - size / 2 - rise), size, size);
      ctx.globalAlpha = 1;
      keep.push(p);
    }
    this.pickups = keep;
  };

  Renderer.prototype.render = function (now) {
    this.now = now;
    if (!this.state) return;
    var ctx = this.ctx, st = this.state, G = global.OT_GAME;

    var dx = 0, dy = 0;
    if (now < this.shakeUntil) {
      var m = (this.shakeUntil - now) / 360 * 3;
      dx = Math.round((Math.random() - 0.5) * m * 2);
      dy = Math.round((Math.random() - 0.5) * m * 2);
    }

    ctx.clearRect(0, 0, this.W, this.H);
    ctx.save();
    ctx.translate(dx, dy);
    ctx.fillStyle = "#10331e";
    ctx.fillRect(0, 0, this.W, this.H);

    this.drawGoalFrame();
    for (var i = 0; i < st.board.cells.length; i++) this.drawCell(i);

    // actionable hint (frontier + tackleable keeper) + hover
    if (st.status === "playing") {
      var pulse = 0.18 + 0.12 * Math.sin(now / 260);
      for (var f = 0; f < st.board.cells.length; f++) {
        if (G.isActable(st, f) && !st.board.cells[f].marked) this.drawGlow(f, PAL.gold, pulse);
      }
      if (this.hover >= 0) {
        var hc = st.board.cells[this.hover];
        if (!hc.revealed || (hc.kind === "keeper" && !hc.beaten)) this.drawGlow(this.hover, PAL.white, 0.55);
      }
    }

    // ball — only shown in transit so it never hides the cell it lands on
    var target = this.cellCenter(st.ballIdx);
    if (st.status === "won") target = { x: this.cellCenter(st.ballIdx).x, y: GOAL_BAND / 2 };
    this.ballPos.x += (target.x - this.ballPos.x) * 0.25;
    this.ballPos.y += (target.y - this.ballPos.y) * 0.25;
    var moving = Math.abs(target.x - this.ballPos.x) + Math.abs(target.y - this.ballPos.y) > 1.5;
    if (moving || st.status === "won") {
      this.drawSprite("ball", Math.round(this.ballPos.x - TILE / 2), Math.round(this.ballPos.y - TILE / 2), TILE, TILE);
    } else if (st.status === "playing") {
      this.drawGlow(st.ballIdx, PAL.white, 0.5);   // settled: mark position without covering content
    }

    this.drawParticles();
    this.drawPickups();

    if (now < this.goalFlashUntil) {
      ctx.globalAlpha = Math.max(0, (this.goalFlashUntil - now) / 750) * 0.7;
      ctx.fillStyle = PAL.gold; ctx.fillRect(0, 0, this.W, this.H); ctx.globalAlpha = 1;
    }
    if (now - this.flash < 220) {
      ctx.globalAlpha = Math.max(0, (220 - (now - this.flash)) / 220) * 0.45;
      ctx.fillStyle = PAL.red; ctx.fillRect(0, 0, this.W, this.H); ctx.globalAlpha = 1;
    }
    if (st.status === "lost") {
      ctx.globalAlpha = 0.2; ctx.fillStyle = PAL.red; ctx.fillRect(0, 0, this.W, this.H); ctx.globalAlpha = 1;
    }
    ctx.restore();
  };

  var api = {
    TILE: TILE, GOAL_BAND: GOAL_BAND, PAL: PAL, SPRITE_NAMES: SPRITE_NAMES,
    loadSprites: loadSprites, Renderer: Renderer,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.OT_RENDER = api;
})(typeof window !== "undefined" ? window : globalThis);
