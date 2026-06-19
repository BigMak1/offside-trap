// Offside Trap — pixel render pipeline.
// Draws the whole scene into a low-resolution logical canvas with nearest-neighbour
// sampling; CSS scales that canvas to the viewport by an integer factor only.
(function (global) {
  "use strict";

  var TILE = 16;
  var GOAL_BAND = TILE;            // decorative goal frame above row 0
  // Palette mirror (must match styles.css :root and the sprite palette).
  var PAL = { gold: "#FFE14D", white: "#F3F1E2", red: "#E5484D", ink: "#0B1322" };

  var SPRITE_NAMES = [
    "tile-hidden", "tile-revealed-empty", "ball", "marker-cone",
    "goal-left", "goal-mid", "goal-right",
    "defender-1", "defender-2", "defender-3",
    "digit-0", "digit-1", "digit-2", "digit-3", "digit-4", "digit-5", "digit-6",
    "particle-spark", "particle-confetti", "particle-ring",
  ];

  function loadSprites(basePath) {
    basePath = basePath || "assets/";
    var imgs = {};
    var promises = SPRITE_NAMES.map(function (name) {
      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () { imgs[name] = img; resolve(); };
        img.onerror = function () { reject(new Error("Failed to load " + name)); };
        img.src = basePath + name + ".png";
      });
    });
    return Promise.all(promises).then(function () { return imgs; });
  }

  function Renderer(canvas, sprites, cfg) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.sprites = sprites;
    this.scale = 1;
    this.hover = -1;
    this.showDebug = false;
    this.reveals = {};        // idx -> {start, dur}
    this.particles = [];
    this.flash = 0;           // global white flash alpha source time
    this.goalFlashUntil = 0;
    this.shakeUntil = 0;
    this.ballPos = null;      // {x, y} logical px
    this.now = 0;
    this.state = null;
    this.configure(cfg);
  }

  // (Re)size the logical canvas for the active board (board size is preset-driven).
  Renderer.prototype.configure = function (cfg) {
    this.cfg = cfg;
    this.W = cfg.cols * TILE;
    this.H = cfg.rows * TILE + GOAL_BAND;
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.ctx.imageSmoothingEnabled = false;
  };

  Renderer.prototype.setState = function (state) {
    this.state = state;
    var c = this.cellCenter(state.ballIdx);
    this.ballPos = { x: c.x, y: c.y };
  };

  Renderer.prototype.fitTo = function (maxW, maxH) {
    // Largest integer scale that fits the available box.
    var s = Math.floor(Math.min(maxW / this.W, maxH / this.H));
    this.scale = Math.max(1, s);
    this.canvas.style.width = this.W * this.scale + "px";
    this.canvas.style.height = this.H * this.scale + "px";
    return this.scale;
  };

  Renderer.prototype.cellRect = function (idx) {
    var cols = this.cfg.cols;
    return {
      x: (idx % cols) * TILE,
      y: GOAL_BAND + Math.floor(idx / cols) * TILE,
    };
  };

  Renderer.prototype.cellCenter = function (idx) {
    var r = this.cellRect(idx);
    return { x: r.x + TILE / 2, y: r.y + TILE / 2 };
  };

  // Map a client (CSS px) coordinate to a board cell index, or -1.
  Renderer.prototype.cellAtClient = function (clientX, clientY) {
    var rect = this.canvas.getBoundingClientRect();
    var lx = (clientX - rect.left) / this.scale;
    var ly = (clientY - rect.top) / this.scale;
    if (ly < GOAL_BAND) return -1;
    var col = Math.floor(lx / TILE);
    var row = Math.floor((ly - GOAL_BAND) / TILE);
    if (col < 0 || col >= this.cfg.cols || row < 0 || row >= this.cfg.rows) return -1;
    return row * this.cfg.cols + col;
  };

  // ── event -> animation hooks ───────────────────────────────────────────────
  Renderer.prototype.onEvents = function (events, now) {
    var self = this;
    var order = 0;
    events.forEach(function (e) {
      if (e.type === "reveal" || (e.type === "duel" && e.success)) {
        self.reveals[e.idx] = { start: now + order * 22, dur: 180 };
        order++;
      } else if (e.type === "duel" && !e.success) {
        self.shakeUntil = now + 360;
        self.flash = now;
        self.spawnBurst(e.idx, PAL.red, 14);
      } else if (e.type === "goal") {
        self.goalFlashUntil = now + 700;
        self.shakeUntil = now + 420;
        self.spawnBurst(e.idx, PAL.gold, 30);
      } else if (e.type === "levelup") {
        self.spawnBurst(self.state.ballIdx, PAL.gold, 16);
      } else if (e.type === "illegal") {
        self.shakeUntil = now + 160;
      }
    });
  };

  Renderer.prototype.spawnBurst = function (idx, color, count) {
    var c = this.cellCenter(idx);
    var parts = ["particle-spark", "particle-confetti", "particle-ring"];
    for (var i = 0; i < count; i++) {
      var ang = Math.random() * Math.PI * 2;
      var spd = 0.4 + Math.random() * 1.4;
      this.particles.push({
        x: c.x, y: c.y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 0.8,
        life: 600 + Math.random() * 500,
        born: this.now,
        sprite: parts[(Math.random() * parts.length) | 0],
        tint: color,
      });
    }
  };

  // ── drawing ────────────────────────────────────────────────────────────────
  Renderer.prototype.drawSprite = function (name, x, y) {
    var img = this.sprites[name];
    if (img) this.ctx.drawImage(img, Math.round(x), Math.round(y));
  };

  Renderer.prototype.drawGoalFrame = function () {
    this.drawSprite("goal-left", 0, 0);
    for (var c = 1; c < this.cfg.cols - 1; c++) this.drawSprite("goal-mid", c * TILE, 0);
    this.drawSprite("goal-right", (this.cfg.cols - 1) * TILE, 0);
  };

  Renderer.prototype.drawCell = function (idx) {
    var ctx = this.ctx, cell = this.state.board.cells[idx];
    var r = this.cellRect(idx);
    var anim = this.reveals[idx];
    var revealing = anim && this.now >= anim.start;

    if (!cell.revealed || (anim && this.now < anim.start)) {
      // still hidden (or queued reveal not started yet)
      this.drawSprite("tile-hidden", r.x, r.y);
      if (cell.marked) this.drawSprite("marker-cone", r.x, r.y);
      if (this.showDebug && cell.def > 0) this.drawSprite("defender-" + cell.def, r.x, r.y);
      return;
    }

    // revealed: optional vertical "unfold" clip for juice
    var h = TILE;
    if (revealing) {
      var t = Math.min(1, (this.now - anim.start) / anim.dur);
      h = Math.max(2, Math.round(TILE * t));
      if (t >= 1) delete this.reveals[idx];
    }
    var top = r.y + Math.floor((TILE - h) / 2);
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, top, TILE, h);
    ctx.clip();

    this.drawSprite("tile-revealed-empty", r.x, r.y);
    if (cell.lost) {
      this.drawSprite("defender-" + (cell.def || 3), r.x, r.y);
    } else if (cell.beaten) {
      ctx.globalAlpha = 0.35;                 // ghost of the beaten defender
      this.drawSprite("defender-" + cell.def, r.x, r.y);
      ctx.globalAlpha = 1;
    } else if (cell.pressure > 0) {
      this.drawSprite("digit-" + cell.pressure, r.x, r.y);
    }
    ctx.restore();

    if (revealing) {
      // bright pop flash at the unfolding edge
      ctx.fillStyle = PAL.white;
      ctx.globalAlpha = 0.5 * (1 - h / TILE) + 0.1;
      ctx.fillRect(r.x, top, TILE, h);
      ctx.globalAlpha = 1;
    }
  };

  Renderer.prototype.drawGlow = function (idx, color, alpha) {
    var ctx = this.ctx, r = this.cellRect(idx);
    ctx.save();
    ctx.globalAlpha = alpha * 0.5;
    ctx.fillStyle = color;
    ctx.fillRect(r.x + 1, r.y + 1, TILE - 2, TILE - 2);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, TILE - 1, TILE - 1);
    ctx.restore();
  };

  Renderer.prototype.drawParticles = function () {
    var ctx = this.ctx, now = this.now, keep = [];
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      var age = now - p.born;
      if (age > p.life) continue;
      var dt = age / 16;
      var px = p.x + p.vx * dt;
      var py = p.y + p.vy * dt + 0.012 * dt * dt; // gravity
      ctx.globalAlpha = Math.max(0, 1 - age / p.life);
      this.drawSprite(p.sprite, px - 4, py - 4);
      keep.push(p);
    }
    ctx.globalAlpha = 1;
    this.particles = keep;
  };

  Renderer.prototype.render = function (now) {
    this.now = now;
    if (!this.state) return;
    var ctx = this.ctx, st = this.state, cfg = this.cfg;

    // screen shake (whole canvas), kept to integer pixels
    var dx = 0, dy = 0;
    if (now < this.shakeUntil) {
      var m = (this.shakeUntil - now) / 360 * 3;
      dx = Math.round((Math.random() - 0.5) * m * 2);
      dy = Math.round((Math.random() - 0.5) * m * 2);
    }

    ctx.clearRect(0, 0, this.W, this.H);
    ctx.save();
    ctx.translate(dx, dy);

    // pitch backdrop behind everything
    ctx.fillStyle = "#10331e";
    ctx.fillRect(0, 0, this.W, this.H);

    this.drawGoalFrame();
    for (var i = 0; i < st.board.cells.length; i++) this.drawCell(i);

    // frontier hint (gentle pulse) + hover highlight
    if (st.status === "playing") {
      var pulse = 0.18 + 0.12 * Math.sin(now / 260);
      for (var f = 0; f < st.board.cells.length; f++) {
        if (OT_GAME.isFrontier(st, f) && !st.board.cells[f].marked) {
          this.drawGlow(f, PAL.gold, pulse);
        }
      }
      if (this.hover >= 0 && !st.board.cells[this.hover].revealed) {
        this.drawGlow(this.hover, PAL.white, 0.55);
      }
    }

    // ball — slide toward its target cell, snapped to integer pixels
    var target = this.cellCenter(st.ballIdx);
    if (st.status === "won") target = { x: this.cellCenter(st.ballIdx).x, y: 8 };
    this.ballPos.x += (target.x - this.ballPos.x) * 0.25;
    this.ballPos.y += (target.y - this.ballPos.y) * 0.25;
    this.drawSprite("ball", Math.round(this.ballPos.x - 8), Math.round(this.ballPos.y - 8));

    this.drawParticles();

    // goal flash
    if (now < this.goalFlashUntil) {
      ctx.globalAlpha = Math.max(0, (this.goalFlashUntil - now) / 700) * 0.7;
      ctx.fillStyle = PAL.gold;
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.globalAlpha = 1;
    }
    // duel-fail red flash
    if (now - this.flash < 220) {
      ctx.globalAlpha = Math.max(0, (220 - (now - this.flash)) / 220) * 0.45;
      ctx.fillStyle = PAL.red;
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.globalAlpha = 1;
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
