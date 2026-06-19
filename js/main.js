// Offside Trap — wiring: screens, input, HUD, scouting, loop. (Deduction redesign)
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
    saves: document.getElementById("saves-val"),
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
  };

  var renderer, state, markMode = false;
  var difficulty = "normal", seedKey, activeCfg = CFG.resolve("normal");
  var lastBanner = null;   // {tk, sk, vars} so an open banner can re-localize on language switch

  var MENU_MUSIC = "assets/audio/menu-music.mp3", CROWD = "assets/audio/stadium-ambience.mp3";

  function showScreen(name) {
    Object.keys(el.screens).forEach(function (k) { el.screens[k].classList.toggle("active", k === name); });
    if (window.OT_SFX) OT_SFX.music(name === "game" ? CROWD : MENU_MUSIC);
    if (name === "game") requestAnimationFrame(resize);
  }
  function showRules(on) { el.rulesOverlay.classList.toggle("show", on); }
  function diffLabel(key) { return t("diff_" + key); }

  // ── difficulty cards (from CONFIG.presets) ──────────────────────────────────
  function buildDifficultyCards() {
    el.diffCards.textContent = "";
    Object.keys(CFG.presets).forEach(function (key) {
      var pr = CFG.presets[key];
      var card = document.createElement("button");
      card.className = "card";
      var defs = document.createElement("div"); defs.className = "card-defs";
      [1, 2, 3, 4].forEach(function (rk) { var img = document.createElement("img"); img.src = "assets/defender-" + rk + ".png"; img.alt = ""; defs.appendChild(img); });
      var g = document.createElement("img"); g.src = "assets/artifact-save.png"; g.alt = ""; defs.appendChild(g);

      var body = document.createElement("div"); body.className = "card-body";
      var name = document.createElement("div"); name.className = "card-name " + key; name.textContent = diffLabel(key);
      if (key === "normal") { var b = document.createElement("span"); b.className = "card-badge"; b.textContent = t("badge_daily"); name.appendChild(b); }
      var meta = document.createElement("div"); meta.className = "card-meta";
      meta.textContent = t("card_meta", {
        cols: pr.cols, rows: pr.rows,
        dens: Math.round(pr.density * 100),
        saves: pr.startSaves,
        art: pr.artifacts.save + pr.artifacts.scout,
      });
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
      ["digit-3", "rule_number_t", "rule_number_d", ""],
      ["defender-2", "rule_def_t", "rule_def_d", "lose"],
      ["artifact-save", "rule_save_t", "rule_save_d", ""],
      ["artifact-scout", "rule_scout_t", "rule_scout_d", ""],
      ["marker-cone", "rule_mark_t", "rule_mark_d", ""],
      ["keeper", "rule_keeper_t", "rule_keeper_d", "win"],
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

  // ── DOSSIER: the opposition + artifacts tab ─────────────────────────────────
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
      row("defender-" + pw, t("squad_def", { p: pw }), t("squad_def_sub"), "sq" + pw);
    });
    row("artifact-save", t("squad_save"), t("squad_save_sub"), "art");
    row("artifact-scout", t("squad_scout"), t("squad_scout_sub"), "art");
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
    renderer.reveals = {}; renderer.particles = []; renderer.pickups = [];
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
    el.saves.textContent = state.saves;
    el.saves.parentNode.classList.toggle("stat--empty", state.saves <= 0);
    updateScout();
  }

  function updateScout() {
    var s = GAME.scout(state);
    el.scout.textContent = "";
    // keeper chip (the goal)
    var kchip = document.createElement("div"); kchip.className = "chip chip--keeper " + (s.keeperBeaten ? "beaten" : "ok");
    var ki = document.createElement("img"); ki.src = "assets/keeper.png"; ki.alt = "";
    var kt = document.createElement("span"); kt.textContent = s.keeperBeaten ? "✓" : "★";
    kchip.appendChild(ki); kchip.appendChild(kt); el.scout.appendChild(kchip);
    // defenders remaining (mines left to avoid)
    chip("defender-4", "×" + s.defendersRemaining);
    // artifacts still on the board
    if (s.artifactsLeft > 0) chip("artifact-scout", "×" + s.artifactsLeft);
    function chip(sprite, text) {
      var c = document.createElement("div"); c.className = "chip";
      var im = document.createElement("img"); im.src = "assets/" + sprite + ".png"; im.alt = "";
      var tx = document.createElement("span"); tx.textContent = text;
      c.appendChild(im); c.appendChild(tx); el.scout.appendChild(c);
    }
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
    var has = {};
    for (var i = 0; i < events.length; i++) has[events[i].type] = true;
    if (has.goal) OT_SFX.play("goal");
    else if (has.gameover) OT_SFX.play("lose");
    else if (has.save) OT_SFX.play("tackle");
    else if (has.artifact) OT_SFX.play("medkit");
    else if (has.mark) OT_SFX.play("mark");
    else if (has.reveal) OT_SFX.play("reveal");
    else if (has.illegal || has.blocked) OT_SFX.play("deny");
  }

  function reactToEvents(events) {
    sfxForEvents(events);
    renderer.onEvents(events, performance.now());
    events.forEach(function (e) {
      if (e.type === "artifact") {
        if (e.kind === "save") popup(e.idx, "+🧤", "heal");
        else popup(e.idx, "👁", "level");
      } else if (e.type === "save") {
        popup(e.idx, t("pop_save"), "save");
      } else if (e.type === "goal") {
        showBanner("banner_goal_t", "banner_goal_s", {});
      } else if (e.type === "gameover") {
        showBanner("banner_lost_t", "lost_caught", { p: e.power });
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
      case "sound": toggleMute(); break;
    }
  });
  el.guideTabs.addEventListener("click", function (ev) {
    var tb = ev.target.closest(".guide-tab"); if (tb) showGuideTab(tb.getAttribute("data-tab"));
  });
  el.btnMark.addEventListener("click", function () { markMode = !markMode; el.btnMark.classList.toggle("active", markMode); el.btnMark.setAttribute("aria-pressed", markMode); });
  el.btnCrt.addEventListener("click", function () { var on = el.stage.classList.toggle("crt"); el.btnCrt.classList.toggle("active", on); el.btnCrt.setAttribute("aria-pressed", on); });
  el.btnDebug.addEventListener("click", function () { renderer.showDebug = !renderer.showDebug; el.btnDebug.classList.toggle("active", renderer.showDebug); el.btnDebug.setAttribute("aria-pressed", renderer.showDebug); });
  el.btnReplay.addEventListener("click", function () { newGame(difficulty, seedKey); });
  el.bannerAgain.addEventListener("click", function () { newGame(difficulty, seedKey); });

  // ── audio: menu music vs crowd ambience (gap-less loop via OT_SFX / Web Audio). One mute for all.
  // Music starts on the first user gesture (autoplay policy). On the game screen the context is
  // already unlocked (you clicked PLAY), so the crowd plays immediately — no cell tap required.
  var muted = localStorage.getItem("ot_muted") === "1";
  if (window.OT_SFX) OT_SFX.setMuted(muted);
  function unlockAudio() { if (window.OT_SFX) OT_SFX.ensure(); }
  ["pointerdown", "keydown", "touchstart"].forEach(function (ev) { document.addEventListener(ev, unlockAudio, { passive: true }); });
  function refreshSoundBtn() {
    var btns = document.querySelectorAll(".sound-toggle");
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      b.classList.toggle("active", !muted);
      b.setAttribute("aria-pressed", String(!muted));
      b.textContent = (muted ? "🔇" : "🔊") + (b.classList.contains("sound-compact") ? "" : " " + t("ctrl_sound"));
    }
  }
  function toggleMute() {
    muted = !muted;
    try { localStorage.setItem("ot_muted", muted ? "1" : "0"); } catch (e) {}
    if (window.OT_SFX) OT_SFX.setMuted(muted);
    refreshSoundBtn();
  }

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
    newGame: newGame,
  };

  R.loadSprites("assets/").then(function (sprites) {
    renderer = new R.Renderer(el.canvas, sprites, activeCfg);
    I.apply(); buildDifficultyCards(); buildRules(); buildSquad(); showGuideTab("rules"); refreshSoundBtn();
    if (debugStart) el.btnDebug.classList.add("active");
    requestAnimationFrame(loop);
    if (debugStart || diffParam || dayOverride) startDaily(); else showScreen("title");
    if (window.OT_SFX) OT_SFX.ensure();   // attempt to start music on load (plays where autoplay is allowed)
  }).catch(function (err) {
    var p = document.createElement("p"); p.style.cssText = "color:#E5484D;padding:1rem;font-family:monospace";
    p.textContent = t("err_sprites", { msg: err.message }); document.body.appendChild(p);
  });
})();
