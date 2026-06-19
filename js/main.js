// Offside Trap — wiring: screens, input, HUD, game/render loop. Vanilla, mobile-first.
(function () {
  "use strict";

  var CFG = window.OT_CONFIG;
  var RNG = window.OT_RNG;
  var GAME = window.OT_GAME;
  var R = window.OT_RENDER;

  var params = new URLSearchParams(location.search);
  var dayOverride = params.get("day");
  var diffParam = params.get("diff");
  var debugStart = params.get("debug") === "1";

  var el = {
    app: document.getElementById("app"),
    screens: {
      title: document.getElementById("screen-title"),
      difficulty: document.getElementById("screen-difficulty"),
      game: document.getElementById("screen-game"),
    },
    diffCards: document.getElementById("diff-cards"),
    rulesOverlay: document.getElementById("overlay-rules"),
    rulesList: document.getElementById("rules-list"),
    canvas: document.getElementById("game"),
    stage: document.getElementById("stage"),
    skill: document.getElementById("skill-val"),
    stamina: document.getElementById("stamina-val"),
    staminaBar: document.getElementById("stamina-bar"),
    xpBar: document.getElementById("xp-bar"),
    level: document.getElementById("level-val"),
    seed: document.getElementById("seed-val"),
    banner: document.getElementById("banner"),
    bannerTitle: document.getElementById("banner-title"),
    bannerSub: document.getElementById("banner-sub"),
    bannerAgain: document.getElementById("banner-again"),
    popLayer: document.getElementById("pop-layer"),
    btnMark: document.getElementById("btn-mark"),
    btnReplay: document.getElementById("btn-replay"),
    btnCrt: document.getElementById("btn-crt"),
    btnDebug: document.getElementById("btn-debug"),
    hint: document.getElementById("hint"),
  };

  var renderer, state, markMode = false;
  var difficulty = "normal", seedKey, activeCfg = CFG.resolve("normal");

  // ── screen navigation ──────────────────────────────────────────────────────
  function showScreen(name) {
    Object.keys(el.screens).forEach(function (k) {
      el.screens[k].classList.toggle("active", k === name);
    });
    if (name === "game") requestAnimationFrame(resize);
  }
  function showRules(on) { el.rulesOverlay.classList.toggle("show", on); }

  // ── difficulty cards (built from CONFIG.presets → stays flexible) ───────────
  function buildDifficultyCards() {
    el.diffCards.textContent = "";
    Object.keys(CFG.presets).forEach(function (key) {
      var p = CFG.presets[key];
      var total = p.defenders.r1 + p.defenders.r2 + p.defenders.r3;
      var ranks = key === "easy" ? [1] : key === "normal" ? [1, 2] : [1, 2, 3];

      var card = document.createElement("button");
      card.className = "card";
      card.setAttribute("data-diff", key);

      var defs = document.createElement("div");
      defs.className = "card-defs";
      ranks.forEach(function (r) {
        var img = document.createElement("img");
        img.src = "assets/defender-" + r + ".png";
        img.alt = "";
        defs.appendChild(img);
      });

      var body = document.createElement("div");
      body.className = "card-body";
      var name = document.createElement("div");
      name.className = "card-name " + key;
      name.textContent = p.label;
      if (key === "normal") {
        var badge = document.createElement("span");
        badge.className = "card-badge";
        badge.textContent = "ежедневный";
        name.appendChild(badge);
      }
      var meta = document.createElement("div");
      meta.className = "card-meta";
      meta.textContent = "поле " + p.cols + "×" + p.rows + " · " + total +
        " защитников · стамина " + p.start.stamina +
        (p.forceLine ? " · офсайдная линия" : "");
      body.appendChild(name);
      body.appendChild(meta);

      card.appendChild(defs);
      card.appendChild(body);
      card.addEventListener("click", function () { startPractice(key); });
      el.diffCards.appendChild(card);
    });
  }

  // ── rules overlay (illustrated with the actual sprites) ─────────────────────
  function buildRules() {
    var rows = [
      ["ball", "Цель", " — довести мяч до ворот в верхнем ряду.", ""],
      ["tile-hidden", "Ход", " — вскрывай клетку рядом с уже открытой: ведёшь мяч дриблингом снизу вверх.", ""],
      ["digit-3", "Число", " — сумма рейтингов защитников в 8 соседних клетках (не количество!). 0 раскрывает соседей каскадом.", ""],
      ["defender-2", "Защитник", " — обыграть стоит (рейтинг − навык) стамины; ≤ навыка — бесплатно. Обыграл → +XP, копишь — растёт навык.", ""],
      ["defender-3", "Офсайдная линия", " — целый ряд защитников, его надо прорвать. Выше линии чаще безопасно — это и есть подсказка.", ""],
      ["marker-cone", "Маркер", " — долгий тап / правый клик / режим «Маркер» ставит конус на подозрительную клетку.", ""],
      ["goal-mid", "Победа", " — добрался до ворот. ГОЛ!", "win"],
      ["icon-stamina", "Поражение", " — не хватило стамины на подкат ИЛИ не осталось ходов по карману: потеря владения.", "lose"],
    ];
    el.rulesList.textContent = "";
    rows.forEach(function (r) {
      var li = document.createElement("li");
      if (r[3]) li.className = r[3];
      var img = document.createElement("img");
      img.className = "ico";
      img.src = "assets/" + r[0] + ".png";
      img.alt = "";
      var span = document.createElement("span");
      var b = document.createElement("b");
      b.textContent = r[1];
      span.appendChild(b);
      span.appendChild(document.createTextNode(r[2]));
      li.appendChild(img);
      li.appendChild(span);
      el.rulesList.appendChild(li);
    });
  }

  // ── game lifecycle ──────────────────────────────────────────────────────────
  function newGame(diffKey, key) {
    difficulty = diffKey;
    activeCfg = CFG.resolve(diffKey);
    seedKey = key;
    renderer.configure(activeCfg);
    state = GAME.createGame(seedKey, activeCfg);
    renderer.setState(state);
    renderer.showDebug = debugStart;
    renderer.reveals = {};
    renderer.particles = [];
    renderer.onEvents(state.initialEvents, performance.now());
    hideBanner();
    updateHUD();
    el.seed.textContent = seedLabel() + " · " + activeCfg.label;
    showScreen("game");
  }
  function startDaily() { newGame(diffParam || "normal", RNG.dailyKey(dayOverride)); }
  function startPractice(key) {
    var seed = dayOverride ? RNG.dailyKey(dayOverride)
      : "practice:" + key + ":" + Math.floor(Math.random() * 1e9);
    newGame(key, seed);
  }
  function seedLabel() {
    if (seedKey.indexOf("utc:") === 0) return seedKey.slice(4);
    if (seedKey.indexOf("day:") === 0) return "#" + seedKey.slice(4);
    return "практика";
  }

  function updateHUD() {
    var p = state.player;
    el.skill.textContent = p.skill;
    el.stamina.textContent = p.stamina + " / " + p.maxStamina;
    el.staminaBar.style.width = (100 * p.stamina / p.maxStamina) + "%";
    el.level.textContent = p.level;
    var next = GAME.xpToNext(state);
    if (next === null) { el.xpBar.style.width = "100%"; return; }
    var prev = p.level > 0 ? activeCfg.xpThresholds[p.level - 1] : 0;
    el.xpBar.style.width = (100 * (p.xp - prev) / (next - prev)) + "%";
  }

  function popup(idx, text, cls) {
    var r = renderer.cellRect(idx);
    var rect = el.canvas.getBoundingClientRect();
    var sr = el.stage.getBoundingClientRect();
    var d = document.createElement("div");
    d.className = "popup " + (cls || "");
    d.textContent = text;
    d.style.left = (rect.left - sr.left + (r.x + R.TILE / 2) * renderer.scale) + "px";
    d.style.top = (rect.top - sr.top + r.y * renderer.scale) + "px";
    el.popLayer.appendChild(d);
    setTimeout(function () { d.remove(); }, 900);
  }

  function reactToEvents(events) {
    renderer.onEvents(events, performance.now());
    events.forEach(function (e) {
      if (e.type === "duel" && e.success) {
        popup(e.idx, "+" + e.rating + " XP", "xp");
        if (e.cost > 0) popup(e.idx, "-" + e.cost, "cost");
      } else if (e.type === "levelup") {
        popup(state.ballIdx, "НАВЫК +1", "level");
      } else if (e.type === "goal") {
        showBanner("GOAL!", "Ты прорвался к воротам ⚽");
      } else if (e.type === "gameover") {
        var sub = e.reason === "stranded"
          ? "Тупик: ходов по карману не осталось (стамина " + e.stamina + "). Мяч потерян."
          : "Защитник рейтинга " + e.rating + ": на подкат нужно " + e.cost +
            " стамины, а было только " + e.stamina + ".";
        showBanner("ПОТЕРЯ ВЛАДЕНИЯ", sub);
      }
    });
    updateHUD();
  }

  function tryReveal(idx) {
    if (!state || state.status !== "playing" || idx < 0) return;
    var cell = state.board.cells[idx];
    if (cell.revealed) return;
    if (cell.marked) { reactToEvents(GAME.toggleMark(state, idx)); return; } // protected: clear cone first
    reactToEvents(GAME.revealCell(state, idx, {}));
  }
  function tryMark(idx) {
    if (!state || state.status !== "playing" || idx < 0) return;
    reactToEvents(GAME.toggleMark(state, idx));
  }

  // ── input ──────────────────────────────────────────────────────────────────
  var press = null, LONG_MS = 420, MOVE_TOL = 10;
  el.canvas.addEventListener("pointerdown", function (ev) {
    if (ev.pointerType === "mouse" && ev.button !== 0) return; // right-click → contextmenu
    var idx = renderer.cellAtClient(ev.clientX, ev.clientY);
    press = { idx: idx, x: ev.clientX, y: ev.clientY, longed: false };
    press.timer = setTimeout(function () {
      if (press) { press.longed = true; tryMark(idx); }
    }, LONG_MS);
  });
  el.canvas.addEventListener("pointermove", function (ev) {
    renderer.hover = renderer.cellAtClient(ev.clientX, ev.clientY);
    if (press && (Math.abs(ev.clientX - press.x) > MOVE_TOL || Math.abs(ev.clientY - press.y) > MOVE_TOL)) {
      clearTimeout(press.timer); press = null;
    }
  });
  el.canvas.addEventListener("pointerleave", function () { renderer.hover = -1; });
  el.canvas.addEventListener("pointerup", function (ev) {
    if (!press) return;
    clearTimeout(press.timer);
    var idx = renderer.cellAtClient(ev.clientX, ev.clientY);
    if (!press.longed && idx === press.idx && idx >= 0) {
      if (markMode) tryMark(idx); else tryReveal(idx);
    }
    press = null;
  });
  el.canvas.addEventListener("contextmenu", function (ev) {
    ev.preventDefault();
    tryMark(renderer.cellAtClient(ev.clientX, ev.clientY));
  });

  // ── banners ──────────────────────────────────────────────────────────────
  function showBanner(title, sub) {
    el.bannerTitle.textContent = title;
    el.bannerSub.textContent = sub;
    el.banner.classList.remove("won", "lost");
    el.banner.classList.add("show", state.status === "won" ? "won" : "lost");
  }
  function hideBanner() { el.banner.classList.remove("show"); }

  // ── controls + global navigation (event delegation for data-act) ───────────
  document.addEventListener("click", function (ev) {
    var t = ev.target.closest("[data-act]");
    if (!t) return;
    switch (t.getAttribute("data-act")) {
      case "play": startDaily(); break;
      case "difficulty": showScreen("difficulty"); break;
      case "rules": showRules(true); break;
      case "close-rules": showRules(false); break;
      case "to-title": hideBanner(); showScreen("title"); break;
    }
  });
  el.btnMark.addEventListener("click", function () {
    markMode = !markMode;
    el.btnMark.classList.toggle("active", markMode);
    el.btnMark.setAttribute("aria-pressed", markMode);
  });
  el.btnCrt.addEventListener("click", function () {
    var on = el.stage.classList.toggle("crt");
    el.btnCrt.classList.toggle("active", on);
    el.btnCrt.setAttribute("aria-pressed", on);
  });
  el.btnDebug.addEventListener("click", function () {
    renderer.showDebug = !renderer.showDebug;
    el.btnDebug.classList.toggle("active", renderer.showDebug);
    el.btnDebug.setAttribute("aria-pressed", renderer.showDebug);
  });
  el.btnReplay.addEventListener("click", function () { newGame(difficulty, seedKey); });
  el.bannerAgain.addEventListener("click", function () { newGame(difficulty, seedKey); });

  // ── layout + loop ────────────────────────────────────────────────────────
  function resize() {
    if (!renderer) return;
    var maxW = el.app.clientWidth - 24;
    var maxH = window.innerHeight - el.stage.getBoundingClientRect().top - 70;
    renderer.fitTo(maxW, Math.max(200, maxH));
  }
  window.addEventListener("resize", resize);
  function loop(now) { if (renderer) renderer.render(now); requestAnimationFrame(loop); }

  // ── dev hook ────────────────────────────────────────────────────────────────
  window.OT_DEBUG = {
    get state() { return state; },
    get renderer() { return renderer; },
    reveal: function (idx) { reactToEvents(GAME.revealCell(state, idx, {})); },
    mark: function (idx) { reactToEvents(GAME.toggleMark(state, idx)); },
    newGame: newGame,
  };

  R.loadSprites("assets/").then(function (sprites) {
    renderer = new R.Renderer(el.canvas, sprites, activeCfg);
    buildDifficultyCards();
    buildRules();
    if (debugStart) el.btnDebug.classList.add("active");
    requestAnimationFrame(loop);
    // Deep-link straight into a game when dev params are present; else show the title.
    if (debugStart || diffParam || dayOverride) startDaily();
    else showScreen("title");
  }).catch(function (err) {
    var p = document.createElement("p");
    p.style.cssText = "color:#E5484D;padding:1rem;font-family:monospace";
    p.textContent = "Не удалось загрузить спрайты: " + err.message;
    document.body.appendChild(p);
  });
})();
