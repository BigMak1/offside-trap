// Offside Trap — i18n. Default English, Russian toggle, persisted in localStorage.
// Static text: elements with data-i18n / data-i18n-title. Dynamic text: OT_I18N.t(key, vars).
(function (global) {
  "use strict";

  var DICT = {
    en: {
      // title / nav
      menu_play: "▶ PLAY",
      menu_difficulty: "DIFFICULTY",
      menu_guide: "DOSSIER",
      tagline: "daily challenge · football minesweeper",
      diff_title: "DIFFICULTY",
      back: "◄ BACK",
      to_menu_title: "Menu",
      board_label: "board",
      // hud
      hud_skill: "Skill",
      hud_stamina: "Stamina",
      hud_level: "Level / XP",
      btn_level: "+ LEVEL UP",
      // controls
      ctrl_mark: "🚩 CONE",
      ctrl_replay: "↻ RESET",
      ctrl_guide: "? DOSSIER",
      ctrl_crt: "📺 CRT",
      ctrl_debug: "👁 DEBUG",
      hint: "Dribble the ball up to the goal, opening cells next to it. A number is the sum of the surrounding defenders' power (the keeper counts too). Long-press / right-click drops a cone.",
      // banner buttons
      banner_again: "↻ AGAIN",
      banner_menu: "☰ MENU",
      // difficulty cards
      diff_easy: "Easy", diff_normal: "Normal", diff_hard: "Hard",
      badge_daily: "daily",
      card_meta: "field {cols}×{rows} · {n} defenders · keeper {kp} · stamina {st}",
      seed_practice: "practice",
      // popups / banners
      pop_skill: "SKILL +1",
      banner_goal_t: "GOAL!",
      banner_goal_s: "You beat the keeper ⚽",
      banner_lost_t: "POSSESSION LOST",
      lost_stranded: "Dead end: no moves you can afford (stamina {st}).",
      lost_tackle: "Power {p} defender: the tackle needs {c} stamina, you had {st}.",
      err_sprites: "Failed to load sprites: {msg}",
      // guide / dossier
      guide_title: "DOSSIER",
      guide_ok: "GOT IT ▶",
      guide_tab_rules: "HOW TO PLAY",
      guide_tab_squad: "THE OPPOSITION",
      rule_goal_t: "Goal", rule_goal_d: " — dribble the ball up to the net and beat the keeper.",
      rule_move_t: "Move", rule_move_d: " — open a cell next to the ball; you carry it from the bottom upward.",
      rule_number_t: "Number", rule_number_d: " — sum of the POWER of defenders in the 8 neighbouring cells (the keeper counts). A 0 opens a cascade.",
      rule_def_t: "Defender", rule_def_d: " — passing one costs (power − skill) stamina. Not enough stamina → you lose the ball. Each pass grants +XP.",
      rule_keeper_t: "Keeper (boss)", rule_keeper_d: " — stands at the goal, shown from the start with his power. Beat him = GOAL. He's strong — level up on others first.",
      rule_medkit_t: "Medkit", rule_medkit_d: " — restores stamina (a breather on a long run).",
      rule_level_t: "Level up", rule_level_d: " — once you have the XP, tap «+ LEVEL UP»: skill +1, stamina to full. Heals are scarce — pick your moment.",
      rule_lose_t: "Defeat", rule_lose_d: " — out of stamina for a tackle, or no moves left: you lose possession.",
      squad_intro: "Defenders are colour-coded by power. The number on a cell is the total power around it — read the board before you commit.",
      squad_def: "Defender · power {p}", squad_def_cost: "tackle: power − your skill",
      squad_keeper: "Keeper · boss", squad_keeper_d: "guards the goal; beat him to win",
    },
    ru: {
      menu_play: "▶ ИГРАТЬ",
      menu_difficulty: "СЛОЖНОСТЬ",
      menu_guide: "ДОСЬЕ",
      tagline: "ежедневный челлендж · футбольный сапёр",
      diff_title: "СЛОЖНОСТЬ",
      back: "◄ НАЗАД",
      to_menu_title: "В меню",
      board_label: "доска",
      hud_skill: "Навык",
      hud_stamina: "Стамина",
      hud_level: "Уровень / XP",
      btn_level: "+ УРОВЕНЬ",
      ctrl_mark: "🚩 КОНУС",
      ctrl_replay: "↻ ЗАНОВО",
      ctrl_guide: "? ДОСЬЕ",
      ctrl_crt: "📺 CRT",
      ctrl_debug: "👁 DEBUG",
      hint: "Веди мяч к воротам наверху, вскрывая соседние клетки. Число — сумма сил защитников вокруг (вратарь тоже). Долгий тап / правый клик ставит конус.",
      banner_again: "↻ СНОВА",
      banner_menu: "☰ МЕНЮ",
      diff_easy: "Лёгкий", diff_normal: "Норма", diff_hard: "Сложный",
      badge_daily: "ежедневный",
      card_meta: "поле {cols}×{rows} · {n} защитников · вратарь {kp} · стамина {st}",
      seed_practice: "практика",
      pop_skill: "НАВЫК +1",
      banner_goal_t: "ГОЛ!",
      banner_goal_s: "Ты обыграл вратаря ⚽",
      banner_lost_t: "ПОТЕРЯ ВЛАДЕНИЯ",
      lost_stranded: "Тупик: ходов по карману не осталось (стамина {st}).",
      lost_tackle: "Защитник силы {p}: на проход нужно {c} стамины, было {st}.",
      err_sprites: "Не удалось загрузить спрайты: {msg}",
      guide_title: "ДОСЬЕ",
      guide_ok: "ПОНЯТНО ▶",
      guide_tab_rules: "КАК ИГРАТЬ",
      guide_tab_squad: "СОПЕРНИК",
      rule_goal_t: "Цель", rule_goal_d: " — провести мяч к воротам наверху и обыграть вратаря.",
      rule_move_t: "Ход", rule_move_d: " — вскрывай клетку рядом с мячом: ведёшь его снизу вверх.",
      rule_number_t: "Число", rule_number_d: " — сумма СИЛ защитников в 8 соседних клетках (вратарь тоже). 0 раскрывает каскад.",
      rule_def_t: "Защитник", rule_def_d: " — пройти стоит (сила − навык) стамины. Не хватило → потеря владения. За проход +XP.",
      rule_keeper_t: "Вратарь (босс)", rule_keeper_d: " — стоит у ворот и виден сразу, с его силой. Обыграть = ГОЛ. Силён — сначала качайся.",
      rule_medkit_t: "Медкит", rule_medkit_d: " — восстанавливает стамину (передышка).",
      rule_level_t: "Уровень", rule_level_d: " — набрал XP → жми «+ УРОВЕНЬ»: навык +1, стамина до полной. Лечений мало.",
      rule_lose_t: "Поражение", rule_lose_d: " — нет стамины на проход или не осталось ходов: потеря владения.",
      squad_intro: "Защитники различаются цветом по силе. Число на клетке — сумма сил вокруг. Читай доску до хода.",
      squad_def: "Защитник · сила {p}", squad_def_cost: "проход: сила − твой навык",
      squad_keeper: "Вратарь · босс", squad_keeper_d: "стоит у ворот; обыграй, чтобы победить",
    },
  };

  var lang = localStorage.getItem("ot_lang");
  if (!DICT[lang]) lang = "en";
  var onChange = null;

  function t(key, vars) {
    var s = (DICT[lang] && DICT[lang][key]);
    if (s == null) s = DICT.en[key];
    if (s == null) return key;
    if (vars) for (var k in vars) s = s.split("{" + k + "}").join(vars[k]);
    return s;
  }

  function apply() {
    document.documentElement.lang = lang;
    var nodes = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = t(nodes[i].getAttribute("data-i18n"));
    var tnodes = document.querySelectorAll("[data-i18n-title]");
    for (var j = 0; j < tnodes.length; j++) tnodes[j].title = t(tnodes[j].getAttribute("data-i18n-title"));
    var other = lang === "en" ? "RU" : "EN";
    var toggles = document.querySelectorAll(".lang-toggle");
    for (var m = 0; m < toggles.length; m++) toggles[m].textContent = other;
  }

  function setLang(l) {
    if (!DICT[l] || l === lang) return;
    lang = l;
    try { localStorage.setItem("ot_lang", l); } catch (e) {}
    apply();
    if (onChange) onChange();
  }
  function toggle() { setLang(lang === "en" ? "ru" : "en"); }

  var api = {
    t: t, apply: apply, setLang: setLang, toggle: toggle,
    get lang() { return lang; },
    set onChange(fn) { onChange = fn; },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.OT_I18N = api;
})(typeof window !== "undefined" ? window : globalThis);
