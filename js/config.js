// Offside Trap — single source of balance tuning (Stage 4: Dragonsweeper redesign).
// All numeric gameplay parameters live here so they can be balanced in one place.
// Difficulty is preset-driven: PRESETS holds the per-difficulty knobs; CONFIG.resolve(key)
// flattens a preset into the concrete cfg object the game logic consumes.
//
// Stage 4 model (Dragonsweeper football):
//   - stamina = HP (the resource you risk), skill = attack.
//   - Beating a defender of power P costs max(0, P - skill) stamina and grants +P XP.
//   - The KEEPER (boss) sits at the goal (top-centre), revealed from the start; beating it WINS.
//   - Level-up is MANUAL and FULL-HEAL: tap it when you choose -> skill+1, maxStamina+2, full heal.
//   - Medkit cells restore +MEDKIT_RESTORE stamina (capped at maxStamina) when revealed.
(function (global) {
  "use strict";

  // Stamina restored by picking up a medkit (safe cell). Capped at the player's maxStamina.
  var MEDKIT_RESTORE = 3;

  // The keeper-boss is the SAME on every difficulty (like Dragonsweeper's dragon). Difficulty
  // scales through the field: bigger pitch + more defenders + more high-level ones — NOT a tougher
  // keeper. NOTE: the winnability validator uses a 32-bit mask, so keep
  // (total field defenders + 1 keeper) <= 31 — i.e. field defenders <= ~30.
  var KEEPER_POWER = 13;

  var PRESETS = {
    easy: {
      label: "Лёгкий", cols: 8, rows: 12,
      defenders: { p1: 9, p2: 6, p3: 3, p4: 1 },   // 19 field defenders
      keeperPower: KEEPER_POWER,
      start: { skill: 1, stamina: 8 },
      maxStaminaStart: 8,
      xpThresholds: [4, 9, 15, 22, 30, 40],
      medkits: 3,
      allowSafePath: false,
    },
    normal: {
      label: "Норма", cols: 9, rows: 14,
      defenders: { p1: 9, p2: 8, p3: 6, p4: 3 },   // 26 field defenders
      keeperPower: KEEPER_POWER,
      start: { skill: 1, stamina: 7 },
      maxStaminaStart: 7,
      xpThresholds: [4, 9, 15, 22, 30, 40, 52],
      medkits: 2,
      allowSafePath: false,
    },
    hard: {
      label: "Сложный", cols: 10, rows: 15,
      defenders: { p1: 6, p2: 8, p3: 9, p4: 6 },   // 29 field defenders, weighted to high tiers
      keeperPower: KEEPER_POWER,
      start: { skill: 1, stamina: 6 },
      maxStaminaStart: 6,
      xpThresholds: [5, 11, 18, 26, 35, 45, 57, 70],
      medkits: 1,
      allowSafePath: false,
    },
  };

  // Flatten a preset key into the concrete cfg object game logic reads.
  function resolve(key) {
    var difficulty = (key && PRESETS[key]) ? key : "normal";
    var preset = PRESETS[difficulty];
    var rows = preset.rows, cols = preset.cols;
    return Object.assign({}, preset, {
      difficulty: difficulty,
      goalRow: 0,                    // top = goal
      startRow: rows - 1,            // bottom = kickoff
      startCol: Math.floor(cols / 2),
      keeperCol: Math.floor(cols / 2),
      tile: 32,                      // render tile size (32px world)
      medkitRestore: MEDKIT_RESTORE,
      maxGenAttempts: 600,
    });
  }

  var CONFIG = {
    difficulty: "normal",           // daily board difficulty
    presets: PRESETS,
    MEDKIT_RESTORE: MEDKIT_RESTORE,
    resolve: resolve,
  };

  var api = CONFIG;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.OT_CONFIG = api;
})(typeof window !== "undefined" ? window : globalThis);
