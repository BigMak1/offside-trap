// Offside Trap — wiring: screens, input, HUD, scouting, manual level-up, loop. (Stage 4)
(function () {
  "use strict";

  var CFG = window.OT_CONFIG, RNG = window.OT_RNG, GAME = window.OT_GAME, R = window.OT_RENDER;
  var I = window.OT_I18N, t = I.t;

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
    squadList: document.getElementById("squad-list"),
    guideTabs: document.getElementById("guide-tabs"),
    canvas: document.getElementById("game"),
    stage: document.getElementById("stage"),
    boardWrap: document.getElementById("board-wrap"),
    scout: document.getElementById("scout"),
    btnLevel: document.getElementById("btn-level"),
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
    btnSound: document.getElementById("btn-sound"),
  };

  var renderer, state, markMode = false;
  var difficulty = "normal", seedKey, activeCfg = CFG.resolve("normal");
  var lastBanner = null;   // {tk, sk, vars} so an open banner can re-localize on language switch

  function showScreen(name) {
    Object.keys(el.screens).forEach(function (k) { el.screens[k].classList.toggle("active", k === name); });
    if (name === "game") requestAnimationFrame(resize);
  }
  function showRules(on) { el.rulesOverlay.classList.toggle("show", on); }
  function diffLabel(key) { return t("diff_" + key); }

  // ── difficulty cards (from CONFIG.presets) ──────────────────────────────────
  function buildDifficultyCards() {
    el.diffCards.textContent = "";
    Object.keys(CFG.presets).forEach(function (key) {
      var pr = CFG.presets[key], d = pr.defenders;
      var total = d.p1 + d.p2 + d.p3 + d.p4;
      var ranks = [1, 2, 3]; if (d.p4 > 0) ranks.push(4);

      var card = document.createElement("button");
      card.className = "card";
      var defs = document.createElement("div"); defs.className = "card-defs";
      ranks.forEach(function (rk) { var img = document.createElement("img"); img.src = "assets/defender-" + rk + ".png"; img.alt = ""; defs.appendChild(img); });
      var k = document.createElement("img"); k.src = "assets/keeper.png"; k.alt = ""; defs.appendChild(k);

      var body = document.createElement("div"); body.className = "card-body";
      var name = document.createElement("div"); name.className = "card-name " + key; name.textContent = diffLabel(key);
      if (key === "normal") { var b = document.createElement("span"); b.className = "card-badge"; b.textContent = t("badge_daily"); name.appendChild(b); }
      var meta = document.createElement("div"); meta.className = "card-meta";
      meta.textContent = t("card_meta", { cols: pr.cols, rows: pr.rows, n: total, kp: pr.keeperPower, st: pr.start.stamina });
      body.appendChild(name); body.appendChild(meta);
      card.appendChild(defs); card.appendChild(body);
      card.addEventListener("click", function () { startPractice(key); });
      el.diffCards.appendChild(card);
    });
  }

  // ── DOSSIER: rules tab (illustrated) ────────────────────────────────────────
  function buildRules() {
    var rows = [
      ["ball", "rule_goal_t", "rule_goal_d", ""],
      ["tile-hidden", "rule_move_t", "rule_move_d", ""],
      ["digit-3", "rule_number_t", "rule_number_d", ""],
      ["defender-2", "rule_def_t", "rule_def_d", ""],
      ["keeper", "rule_keeper_t", "rule_keeper_d", "win"],
      ["medkit", "rule_medkit_t", "rule_medkit_d", ""],
      ["icon-skill", "rule_level_t", "rule_level_d", ""],
      ["icon-stamina", "rule_lose_t", "rule_lose_d", "lose"],
    ];
    el.rulesList.textContent = "";
    rows.forEach(function (r) {
      var li = document.createElement("li"); if (r[3]) li.className = r[3];
      var img = document.createElement("img"); img.className = "ico"; img.src = "assets/" + r[0] + ".png"; img.alt = "";
      var span = document.createElement("span");
      var b = document.createElement("b"); b.textContent = t(r[1]);
      span.appendChild(b); span.appendChild(document.createTextNode(t(r[2])));
      li.appendChild(img); li.appendChild(span); el.rulesList.appendChild(li);
    });
  }

  // ── DOSSIER: the opposition tab (defender classification + keeper) ──────────
  function buildSquad() {
    el.squadList.textContent = "";
    var intro = document.createElement("p"); intro.className = "squad-intro"; intro.textContent = t("squad_intro");
    el.squadList.appendChild(intro);
    function row(sprite, title, sub, cls) {
      var r = document.createElement("div"); r.className = "squad-row" + (cls ? " " + cls : "");
      var img = document.createElement("img"); img.src = "assets/" + sprite + ".png"; img.alt = "";
      var txt = document.createElement("div"); txt.className = "squad-txt";
      var b = document.createElement("b"); b.textContent = title;
      var s = document.createElement("span"); s.textContent = sub;
      txt.appendChild(b); txt.appendChild(s); r.appendChild(img); r.appendChild(txt);
      el.squadList.appendChild(r);
    }
    [1, 2, 3, 4].forEach(function (pw) {
      row("defender-" + pw, t("squad_def", { p: pw }), t("squad_def_cost"), "sq" + pw);
    });
    row("keeper", t("squad_keeper"), t("squad_keeper_d"), "keeper");
  }

  function showGuideTab(tab) {
    var tabs = el.guideTabs.querySelectorAll(".guide-tab");
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle("active", tabs[i].getAttribute("data-tab") === tab);
    el.rulesList.hidden = tab !== "rules";
    el.squadList.hidden = tab !== "squad";
  }

  // ── game lifecycle ──────────────────────────────────────────────────────────
  function newGame(diffKey, key) {
    difficulty = diffKey; activeCfg = CFG.resolve(diffKey); seedKey = key;
    renderer.configure(activeCfg);
    state = GAME.createGame(seedKey, activeCfg);
    renderer.setState(state);
    renderer.showDebug = debugStart;
    renderer.reveals = {}; renderer.particles = [];
    renderer.onEvents(state.initialEvents, performance.now());
    lastBanner = null; hideBanner(); updateHUD();
    el.seed.textContent = seedLabel() + " · " + diffLabel(difficulty);
    showScreen("game");
    // Desktop board panel may scroll; start showing the kickoff (bottom, where the ball is).
    requestAnimationFrame(function () { if (el.boardWrap) el.boardWrap.scrollTop = el.boardWrap.scrollHeight; });
  }
  function startDaily() { newGame(diffParam || "normal", RNG.dailyKey(dayOverride)); }
  function startPractice(key) {
    var seed = dayOverride ? RNG.dailyKey(dayOverride) : "practice:" + key + ":" + Math.floor(Math.random() * 1e9);
    newGame(key, seed);
  }
  function seedLabel() {
    if (seedKey.indexOf("utc:") === 0) return seedKey.slice(4);
    if (seedKey.indexOf("day:") === 0) return "#" + seedKey.slice(4);
    return t("seed_practice");
  }

  function updateHUD() {
    var p = state.player;
    el.skill.textContent = p.skill;
    el.stamina.textContent = p.stamina + " / " + p.maxStamina;
    el.staminaBar.style.width = (100 * p.stamina / Math.max(1, p.maxStamina)) + "%";
    el.level.textContent = p.level;
    var next = GAME.xpToNext(state);
    if (next === null) { el.xpBar.style.width = "100%"; }
    else {
      var prev = p.level > 0 ? activeCfg.xpThresholds[p.level - 1] : 0;
      el.xpBar.style.width = (100 * (p.xp - prev) / (next - prev)) + "%";
    }
    refreshLevelBtn();
    updateScout();
  }

  function refreshLevelBtn() {
    var can = GAME.canLevelUp(state);
    el.btnLevel.disabled = !can;
    el.btnLevel.classList.toggle("ready", can);
    var pend = state.pendingLevels || 0;
    el.btnLevel.textContent = t("btn_level") + (pend > 1 ? " (" + pend + ")" : "");
  }

  function updateScout() {
    var s = GAME.scout(state), p = state.player;
    el.scout.textContent = "";
    // keeper chip
    var kchip = document.createElement("div"); kchip.className = "chip chip--keeper";
    var ki = document.createElement("img"); ki.src = "assets/keeper.png"; ki.alt = "";
    var kt = document.createElement("span");
    if (s.keeperBeaten) { kchip.classList.add("beaten"); kt.textContent = "✓"; }
    else {
      kt.textContent = s.keeperPower;
      var cost = s.keeperPower - p.skill;
      kchip.classList.add(cost <= p.stamina ? "ok" : "danger");
    }
    kchip.appendChild(ki); kchip.appendChild(kt); el.scout.appendChild(kchip);
    // remaining defenders by power
    [1, 2, 3, 4].forEach(function (pw) {
      var n = s.remaining[pw] || 0; if (!n) return;
      var c = document.createElement("div"); c.className = "chip";
      var im = document.createElement("img"); im.src = "assets/defender-" + pw + ".png"; im.alt = "";
      var tx = document.createElement("span"); tx.textContent = "×" + n;
      c.appendChild(im); c.appendChild(tx); el.scout.appendChild(c);
    });
  }

  function popup(idx, text, cls) {
    var r = renderer.cellRect(idx), rect = el.canvas.getBoundingClientRect(), sr = el.stage.getBoundingClientRect();
    var d = document.createElement("div"); d.className = "popup " + (cls || ""); d.textContent = text;
    d.style.left = (rect.left - sr.left + (r.x + R.TILE / 2) * renderer.scale) + "px";
    d.style.top = (rect.top - sr.top + r.y * renderer.scale) + "px";
    el.popLayer.appendChild(d); setTimeout(function () { d.remove(); }, 900);
  }

  // Pick ONE chiptune cue per event batch (priority order) so cascades don't spam sound.
  function sfxForEvents(events) {
    if (!window.OT_SFX) return;
    var has = {}, duelWin = false;
    for (var i = 0; i < events.length; i++) {
      has[events[i].type] = true;
      if (events[i].type === "duel" && events[i].success) duelWin = true;
    }
    if (has.goal) OT_SFX.play("goal");
    else if (has.gameover) OT_SFX.play("lose");
    else if (has.levelup) OT_SFX.play("levelup");
    else if (has.medkit) OT_SFX.play("medkit");
    else if (duelWin) OT_SFX.play("tackle");
    else if (has.mark) OT_SFX.play("mark");
    else if (has.reveal) OT_SFX.play("reveal");
    else if (has.illegal || has.blocked) OT_SFX.play("deny");
  }

  function reactToEvents(events) {
    sfxForEvents(events);
    renderer.onEvents(events, performance.now());
    events.forEach(function (e) {
      if (e.type === "duel" && e.success) {
        popup(e.idx, "+" + e.power + " XP", "xp");
        if (e.cost > 0) popup(e.idx, "-" + e.cost, "cost");
      } else if (e.type === "medkit") {
        popup(e.idx, "+" + e.restored, "heal");
      } else if (e.type === "levelup") {
        popup(state.ballIdx, t("pop_skill"), "level");
      } else if (e.type === "goal") {
        showBanner("banner_goal_t", "banner_goal_s", {});
      } else if (e.type === "gameover") {
        if (e.reason === "stranded") showBanner("banner_lost_t", "lost_stranded", { st: e.stamina });
        else showBanner("banner_lost_t", "lost_tackle", { p: e.power, c: e.cost, st: e.stamina });
      }
    });
    updateHUD();
  }

  function tryReveal(idx) {
    if (!state || state.status !== "playing" || idx < 0) return;
    var cell = state.board.cells[idx];
    var keeperTackle = cell.kind === "keeper" && cell.revealed && !cell.beaten;
    if (cell.revealed && !keeperTackle) return;
    if (cell.marked) { reactToEvents(GAME.toggleMark(state, idx)); return; }
    reactToEvents(GAME.revealCell(state, idx, {}));
  }
  function tryMark(idx) {
    if (!state || state.status !== "playing" || idx < 0) return;
    reactToEvents(GAME.toggleMark(state, idx));
  }

  // ── input ──────────────────────────────────────────────────────────────────
  var press = null, LONG_MS = 420, MOVE_TOL = 10;
  el.canvas.addEventListener("pointerdown", function (ev) {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    var idx = renderer.cellAtClient(ev.clientX, ev.clientY);
    press = { idx: idx, x: ev.clientX, y: ev.clientY, longed: false };
    press.timer = setTimeout(function () { if (press) { press.longed = true; tryMark(idx); } }, LONG_MS);
  });
  el.canvas.addEventListener("pointermove", function (ev) {
    renderer.hover = renderer.cellAtClient(ev.clientX, ev.clientY);
    if (press && (Math.abs(ev.clientX - press.x) > MOVE_TOL || Math.abs(ev.clientY - press.y) > MOVE_TOL)) { clearTimeout(press.timer); press = null; }
  });
  el.canvas.addEventListener("pointerleave", function () { renderer.hover = -1; });
  el.canvas.addEventListener("pointerup", function (ev) {
    if (!press) return; clearTimeout(press.timer);
    var idx = renderer.cellAtClient(ev.clientX, ev.clientY);
    if (!press.longed && idx === press.idx && idx >= 0) { if (markMode) tryMark(idx); else tryReveal(idx); }
    press = null;
  });
  el.canvas.addEventListener("contextmenu", function (ev) { ev.preventDefault(); tryMark(renderer.cellAtClient(ev.clientX, ev.clientY)); });

  // ── banners ──────────────────────────────────────────────────────────────
  function showBanner(tk, sk, vars) {
    lastBanner = { tk: tk, sk: sk, vars: vars || {} };
    el.bannerTitle.textContent = t(tk, vars);
    el.bannerSub.textContent = t(sk, vars);
    el.banner.classList.remove("won", "lost");
    el.banner.classList.add("show", state.status === "won" ? "won" : "lost");
  }
  function hideBanner() { el.banner.classList.remove("show"); }

  // ── controls + navigation ──────────────────────────────────────────────────
  document.addEventListener("click", function (ev) {
    var t2 = ev.target.closest("[data-act]"); if (!t2) return;
    switch (t2.getAttribute("data-act")) {
      case "play": startDaily(); break;
      case "difficulty": showScreen("difficulty"); break;
      case "rules": showGuideTab("rules"); showRules(true); break;
      case "close-rules": showRules(false); break;
      case "to-title": hideBanner(); showScreen("title"); break;
      case "lang": I.toggle(); break;
    }
  });
  el.guideTabs.addEventListener("click", function (ev) {
    var tb = ev.target.closest(".guide-tab"); if (tb) showGuideTab(tb.getAttribute("data-tab"));
  });
  el.btnLevel.addEventListener("click", function () { if (GAME.canLevelUp(state)) reactToEvents(GAME.levelUp(state)); });
  el.btnMark.addEventListener("click", function () { markMode = !markMode; el.btnMark.classList.toggle("active", markMode); el.btnMark.setAttribute("aria-pressed", markMode); });
  el.btnCrt.addEventListener("click", function () { var on = el.stage.classList.toggle("crt"); el.btnCrt.classList.toggle("active", on); el.btnCrt.setAttribute("aria-pressed", on); });
  el.btnDebug.addEventListener("click", function () { renderer.showDebug = !renderer.showDebug; el.btnDebug.classList.toggle("active", renderer.showDebug); el.btnDebug.setAttribute("aria-pressed", renderer.showDebug); });
  el.btnReplay.addEventListener("click", function () { newGame(difficulty, seedKey); });
  el.bannerAgain.addEventListener("click", function () { newGame(difficulty, seedKey); });

  // ── stadium ambience: starts on first user gesture (autoplay policy); mute persists ──
  var muted = localStorage.getItem("ot_muted") === "1";
  if (window.OT_SFX) OT_SFX.setMuted(muted);
  var ambience = new Audio("assets/audio/stadium-ambience.mp3");
  ambience.loop = true; ambience.volume = 0.35; ambience.preload = "auto";
  var audioStarted = false;
  function startAudio() {
    if (window.OT_SFX) OT_SFX.ensure();
    if (audioStarted || muted) return;
    audioStarted = true;
    var p = ambience.play();
    if (p && p.catch) p.catch(function () { audioStarted = false; });
  }
  document.addEventListener("pointerdown", startAudio);
  function refreshSoundBtn() {
    el.btnSound.classList.toggle("active", !muted);
    el.btnSound.setAttribute("aria-pressed", String(!muted));
    el.btnSound.textContent = (muted ? "🔇 " : "🔊 ") + t("ctrl_sound");
  }
  el.btnSound.addEventListener("click", function () {
    muted = !muted;
    try { localStorage.setItem("ot_muted", muted ? "1" : "0"); } catch (e) {}
    if (window.OT_SFX) OT_SFX.setMuted(muted);
    if (muted) ambience.pause(); else { audioStarted = false; startAudio(); }
    refreshSoundBtn();
  });

  // ── i18n: re-render dynamic strings when the language changes ────────────────
  function relocalize() {
    buildDifficultyCards(); buildRules(); buildSquad(); refreshSoundBtn();
    if (state) {
      updateHUD();
      el.seed.textContent = seedLabel() + " · " + diffLabel(difficulty);
      if (lastBanner && el.banner.classList.contains("show")) {
        el.bannerTitle.textContent = t(lastBanner.tk, lastBanner.vars);
        el.bannerSub.textContent = t(lastBanner.sk, lastBanner.vars);
      }
    }
  }
  I.onChange = relocalize;

  // ── layout + loop ────────────────────────────────────────────────────────
  function resize() {
    if (!renderer) return;
    if (window.innerWidth >= 900) {
      // Desktop: scale the board up to its column width (integer, crisp); the board panel
      // scrolls vertically when the tall pitch exceeds the viewport. Capped at ×3.
      var availW = (el.boardWrap ? el.boardWrap.clientWidth : el.app.clientWidth) - 4;
      renderer.setScale(Math.max(1, Math.min(3, Math.floor(availW / renderer.W))));
    } else {
      // Mobile: fit the whole board on screen (width + height), no scroll.
      var maxW = el.app.clientWidth - 24;
      var maxH = window.innerHeight - el.stage.getBoundingClientRect().top - 70;
      renderer.fitTo(maxW, Math.max(220, maxH));
    }
  }
  window.addEventListener("resize", resize);
  function loop(now) { if (renderer) renderer.render(now); requestAnimationFrame(loop); }

  window.OT_DEBUG = {
    get state() { return state; }, get renderer() { return renderer; },
    reveal: function (idx) { reactToEvents(GAME.revealCell(state, idx, {})); },
    mark: function (idx) { reactToEvents(GAME.toggleMark(state, idx)); },
    levelUp: function () { reactToEvents(GAME.levelUp(state)); },
    newGame: newGame,
  };

  R.loadSprites("assets/").then(function (sprites) {
    renderer = new R.Renderer(el.canvas, sprites, activeCfg);
    I.apply(); buildDifficultyCards(); buildRules(); buildSquad(); showGuideTab("rules"); refreshSoundBtn();
    if (debugStart) el.btnDebug.classList.add("active");
    requestAnimationFrame(loop);
    if (debugStart || diffParam || dayOverride) startDaily(); else showScreen("title");
  }).catch(function (err) {
    var p = document.createElement("p"); p.style.cssText = "color:#E5484D;padding:1rem;font-family:monospace";
    p.textContent = t("err_sprites", { msg: err.message }); document.body.appendChild(p);
  });
})();
