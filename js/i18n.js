// Offside Trap — i18n. Default English, Russian toggle, persisted in localStorage.
// Static text: elements with data-i18n / data-i18n-title. Dynamic text: OT_I18N.t(key, vars).
(function (global) {
  "use strict";

  var DICT = {
    en: {
      // title / nav
      menu_play: "▶ PLAY",
      menu_difficulty: "DIFFICULTY",
      menu_guide: "PLAYBOOK",
      tagline: "daily challenge · football minesweeper",
      diff_title: "DIFFICULTY",
      back: "◄ BACK",
      to_menu_title: "Menu",
      board_label: "board",
      // hud
      hud_saves: "Saves",
      // controls
      ctrl_mark: "🚩 CONE",
      ctrl_replay: "↻ RESET",
      ctrl_guide: "? PLAYBOOK",
      ctrl_crt: "📺 CRT",
      ctrl_debug: "👁 DEBUG",
      ctrl_sound: "SOUND",
      hint: "Open cells next to the ball and read the numbers to find the safe path up to the keeper. A defender = caught. Long-press / right-click drops a cone.",
      // banner buttons
      banner_again: "↻ AGAIN",
      banner_menu: "☰ MENU",
      // difficulty cards
      diff_easy: "Easy", diff_normal: "Normal", diff_hard: "Hard",
      badge_daily: "daily",
      card_meta: "{cols}×{rows} · {dens}% defenders · {saves} saves · {art} artifacts",
      seed_practice: "practice",
      // popups / banners
      pop_save: "SAVE!",
      banner_goal_t: "GOAL!",
      banner_goal_s: "You reached the keeper ⚽",
      banner_lost_t: "CAUGHT!",
      lost_caught: "You ran into a power-{p} defender. Read the numbers!",
      err_sprites: "Failed to load sprites: {msg}",
      // guide / dossier
      guide_title: "PLAYBOOK",
      guide_ok: "GOT IT ▶",
      guide_tab_rules: "HOW TO PLAY",
      guide_tab_squad: "THE PITCH",
      rule_goal_t: "Goal", rule_goal_d: " — dribble the ball up to the keeper at the top; reach him to score.",
      rule_number_t: "Number", rule_number_d: " — sum of the power of defenders in the 8 neighbouring cells. Read it to tell safe cells from defenders. A 0 opens a cascade.",
      rule_def_t: "Defender", rule_def_d: " — a mine. Open one and you're caught — game over. Deduce where they are and go around.",
      rule_save_t: "Save (gloves)", rule_save_d: " — a banked save absorbs one wrong reveal so the run continues. Pick them up along the path.",
      rule_scout_t: "Scout (binoculars)", rule_scout_d: " — on pickup, reveals one safe cell for free — a hint along the way.",
      rule_mark_t: "Cone", rule_mark_d: " — long-press / right-click to flag a cell you suspect hides a defender.",
      rule_keeper_t: "Keeper (goal)", rule_keeper_d: " — stands at the goal, shown from the start. Reach him (he's only 1) to WIN.",
      squad_intro: "Defenders are mines — opening one loses the run. The number on a safe cell is the total defender power around it; read the board to find the safe path.",
      squad_def: "Defender · power {p}", squad_def_sub: "a mine — avoid it",
      squad_save: "Save · gloves", squad_save_sub: "absorbs one wrong reveal",
      squad_scout: "Scout · binoculars", squad_scout_sub: "reveals a safe cell",
      squad_keeper: "Keeper · goal", squad_keeper_d: "reach him to win (HP 1)",
    },
    ru: {
      menu_play: "▶ ИГРАТЬ",
      menu_difficulty: "СЛОЖНОСТЬ",
      menu_guide: "ТАКТИКА",
      tagline: "ежедневный челлендж · футбольный сапёр",
      diff_title: "СЛОЖНОСТЬ",
      back: "◄ НАЗАД",
      to_menu_title: "В меню",
      board_label: "доска",
      hud_saves: "Сейвы",
      ctrl_mark: "🚩 КОНУС",
      ctrl_replay: "↻ ЗАНОВО",
      ctrl_guide: "? ТАКТИКА",
      ctrl_crt: "📺 CRT",
      ctrl_debug: "👁 DEBUG",
      ctrl_sound: "ЗВУК",
      hint: "Вскрывай клетки рядом с мячом и читай числа, чтобы найти безопасный путь к вратарю. Защитник = пойман. Долгий тап / правый клик ставит конус.",
      banner_again: "↻ СНОВА",
      banner_menu: "☰ МЕНЮ",
      diff_easy: "Лёгкий", diff_normal: "Норма", diff_hard: "Сложный",
      badge_daily: "ежедневный",
      card_meta: "{cols}×{rows} · {dens}% защитников · {saves} сейва · {art} артефакта",
      seed_practice: "практика",
      pop_save: "СЕЙВ!",
      banner_goal_t: "ГОЛ!",
      banner_goal_s: "Ты добрался до вратаря ⚽",
      banner_lost_t: "ПОЙМАН!",
      lost_caught: "Налетел на защитника силы {p}. Читай числа!",
      err_sprites: "Не удалось загрузить спрайты: {msg}",
      guide_title: "ТАКТИКА",
      guide_ok: "ПОНЯТНО ▶",
      guide_tab_rules: "КАК ИГРАТЬ",
      guide_tab_squad: "ПОЛЕ",
      rule_goal_t: "Цель", rule_goal_d: " — веди мяч к вратарю наверху; добрался до него — гол.",
      rule_number_t: "Число", rule_number_d: " — сумма сил защитников в 8 соседних клетках. По нему отличаешь безопасные клетки от защитников. 0 раскрывает каскад.",
      rule_def_t: "Защитник", rule_def_d: " — мина. Вскрыл — пойман, игра окончена. Вычисляй, где они, и обходи.",
      rule_save_t: "Сейв (перчатки)", rule_save_d: " — запасной сейв гасит одно ошибочное вскрытие, забег продолжается. Собирай их по пути.",
      rule_scout_t: "Скаут (бинокль)", rule_scout_d: " — при подборе бесплатно раскрывает одну безопасную клетку — подсказка.",
      rule_mark_t: "Конус", rule_mark_d: " — долгий тап / правый клик помечает клетку, где подозреваешь защитника.",
      rule_keeper_t: "Вратарь (цель)", rule_keeper_d: " — стоит у ворот, виден сразу. Доберись до него (он всего 1) и ПОБЕДА.",
      squad_intro: "Защитники — мины: вскрыл одного и забег проигран. Число на безопасной клетке — сумма сил защитников вокруг; читай доску, чтобы найти безопасный путь.",
      squad_def: "Защитник · сила {p}", squad_def_sub: "мина — обходи",
      squad_save: "Сейв · перчатки", squad_save_sub: "гасит одно ошибочное вскрытие",
      squad_scout: "Скаут · бинокль", squad_scout_sub: "раскрывает безопасную клетку",
      squad_keeper: "Вратарь · цель", squad_keeper_d: "доберись и победи (HP 1)",
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
