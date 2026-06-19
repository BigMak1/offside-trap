// Offside Trap — wiring: input, HUD, game/render loop. Vanilla, mobile-first.
(function () {
  "use strict";

  var CFG = window.OT_CONFIG;
  var RNG = window.OT_RNG;
  var GAME = window.OT_GAME;
  var R = window.OT_RENDER;

  var params = new URLSearchParams(location.search);
  var dayOverride = params.get("day");
  var debugStart = params.get("debug") === "1";

  var el = {
    stage: document.getElementById("stage"),
    canvas: document.getElementById("game"),
    skill: document.getElementById("skill-val"),
    stamina: document.getElementById("stamina-val"),
    staminaBar: document.getElementById("stamina-bar"),
    xpBar: document.getElementById("xp-bar"),
    level: document.getElementById("level-val"),
    seed: document.getElementById("seed-val"),
    banner: document.getElementById("banner"),
    bannerTitle: document.getElementById("banner-title"),
    bannerSub: document.getElementById("banner-sub"),
    popLayer: document.getElementById("pop-layer"),
    btnMark: document.getElementById("btn-mark"),
    btnCrt: document.getElementById("btn-crt"),
    btnDebug: document.getElementById("btn-debug"),
    btnReplay: document.getElementById("btn-replay"),
    btnPractice: document.getElementById("btn-practice"),
    btnBannerAgain: document.getElementById("banner-again"),
  };

  var state, renderer, markMode = false, seedKey;

  function newGame(key) {
    seedKey = key;
    state = GAME.createGame(seedKey, CFG);
    renderer.setState(state);
    renderer.showDebug = debugStart;
    renderer.reveals = {};
    renderer.particles = [];
    var now = performance.now();
    renderer.onEvents(state.initialEvents, now);
    hideBanner();
    updateHUD();
    el.seed.textContent = seedKey.replace("utc:", "").replace("day:", "#");
  }

  function updateHUD() {
    var p = state.player;
    el.skill.textContent = p.skill;
    el.stamina.textContent = p.stamina + " / " + p.maxStamina;
    el.staminaBar.style.width = (100 * p.stamina / p.maxStamina) + "%";
    el.level.textContent = p.level;
    var next = GAME.xpToNext(state);
    if (next === null) {
      el.xpBar.style.width = "100%";
    } else {
      var prev = p.level > 0 ? CFG.xpThresholds[p.level - 1] : 0;
      el.xpBar.style.width = (100 * (p.xp - prev) / (next - prev)) + "%";
    }
  }

  // floating popup text anchored to a board cell
  function popup(idx, text, cls) {
    var r = renderer.cellRect(idx);
    var rect = el.canvas.getBoundingClientRect();
    var stageRect = el.stage.getBoundingClientRect();
    var x = rect.left - stageRect.left + (r.x + R.TILE / 2) * renderer.scale;
    var y = rect.top - stageRect.top + r.y * renderer.scale;
    var d = document.createElement("div");
    d.className = "popup " + (cls || "");
    d.textContent = text;
    d.style.left = x + "px";
    d.style.top = y + "px";
    el.popLayer.appendChild(d);
    setTimeout(function () { d.remove(); }, 900);
  }

  function reactToEvents(events) {
    var now = performance.now();
    renderer.onEvents(events, now);
    events.forEach(function (e) {
      if (e.type === "duel" && e.success) {
        popup(e.idx, "+" + e.rating + " XP", "xp");
        if (e.cost > 0) popup(e.idx, "-" + e.cost, "cost");
      } else if (e.type === "levelup") {
        popup(state.ballIdx, "SKILL +1", "level");
      } else if (e.type === "goal") {
        showBanner("GOAL!", "Ты прорвался к воротам ⚽");
      } else if (e.type === "gameover") {
        showBanner("ПОТЕРЯ ВЛАДЕНИЯ", "Не хватило стамины на подкат");
      }
    });
    updateHUD();
  }

  function tryReveal(idx) {
    if (state.status !== "playing" || idx < 0) return;
    var cell = state.board.cells[idx];
    if (cell.revealed) return;
    if (cell.marked) {            // protected: first tap clears the cone
      reactToEvents(GAME.toggleMark(state, idx));
      return;
    }
    reactToEvents(GAME.revealCell(state, idx, {}));
  }

  function tryMark(idx) {
    if (state.status !== "playing" || idx < 0) return;
    reactToEvents(GAME.toggleMark(state, idx));
  }

  // ── input ──────────────────────────────────────────────────────────────────
  var press = null;
  var LONG_MS = 420, MOVE_TOL = 10;

  el.canvas.addEventListener("pointerdown", function (ev) {
    if (ev.pointerType === "mouse" && ev.button !== 0) return; // right-click handled by contextmenu
    var idx = renderer.cellAtClient(ev.clientX, ev.clientY);
    press = { idx: idx, x: ev.clientX, y: ev.clientY, t: performance.now(), longed: false };
    press.timer = setTimeout(function () {
      if (press) { press.longed = true; tryMark(idx); }
    }, LONG_MS);
  });

  el.canvas.addEventListener("pointermove", function (ev) {
    renderer.hover = renderer.cellAtClient(ev.clientX, ev.clientY);
    if (press && (Math.abs(ev.clientX - press.x) > MOVE_TOL || Math.abs(ev.clientY - press.y) > MOVE_TOL)) {
      clearTimeout(press.timer);
      press = null;
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

  // ── controls ───────────────────────────────────────────────────────────────
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
  el.btnReplay.addEventListener("click", function () { newGame(seedKey); });
  el.btnPractice.addEventListener("click", function () {
    newGame("day:practice-" + Math.floor(Math.random() * 1e9));
  });
  el.btnBannerAgain.addEventListener("click", function () { newGame(seedKey); });

  // ── layout + loop ────────────────────────────────────────────────────────
  var appEl = document.querySelector(".app");
  function resize() {
    var maxW = appEl.clientWidth - 24;           // container width, not the canvas itself
    var maxH = window.innerHeight - el.stage.getBoundingClientRect().top - 70;
    renderer.fitTo(maxW, Math.max(200, maxH));
  }
  window.addEventListener("resize", resize);

  function loop(now) {
    renderer.render(now);
    requestAnimationFrame(loop);
  }

  // Dev hook for automated testing / debugging in the console.
  window.OT_DEBUG = {
    get state() { return state; },
    get renderer() { return renderer; },
    reveal: function (idx) { reactToEvents(GAME.revealCell(state, idx, {})); },
    mark: function (idx) { reactToEvents(GAME.toggleMark(state, idx)); },
  };

  R.loadSprites("assets/").then(function (sprites) {
    renderer = new R.Renderer(el.canvas, sprites, CFG);
    if (debugStart) { renderer.showDebug = true; el.btnDebug.classList.add("active"); }
    newGame(RNG.dailyKey(dayOverride));
    resize();
    requestAnimationFrame(loop);
  }).catch(function (err) {
    var p = document.createElement("p");
    p.style.cssText = "color:#E5484D;padding:1rem;font-family:monospace";
    p.textContent = "Не удалось загрузить спрайты: " + err.message;
    document.body.appendChild(p);
  });
})();
