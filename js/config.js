// Offside Trap — single source of balance tuning.
// All numeric gameplay parameters live here so they can be balanced in one place.
// Difficulty is preset-driven: PRESETS holds the per-difficulty knobs; CONFIG.resolve(key)
// flattens a preset into the concrete cfg object the game logic consumes.
(function (global) {
  "use strict";

  var PRESETS = {
    easy: {
      label: "Лёгкий", cols: 8, rows: 7, defenders: { r1: 5, r2: 3, r3: 1 },
      start: { skill: 1, stamina: 6 }, xpThresholds: [3, 7, 12, 18, 25],
      offsideRowChoices: [2, 3], offsideBias: 0.60, allowSafePath: true, forceLine: false,
    },
    normal: {
      label: "Норма", cols: 10, rows: 8, defenders: { r1: 7, r2: 5, r3: 2 },
      start: { skill: 1, stamina: 5 }, xpThresholds: [3, 7, 12, 18, 25],
      offsideRowChoices: [2, 3], offsideBias: 0.65, allowSafePath: false, forceLine: true,
    },
    hard: {
      label: "Сложный", cols: 11, rows: 9, defenders: { r1: 8, r2: 7, r3: 3 },
      start: { skill: 1, stamina: 4 }, xpThresholds: [4, 9, 15, 22, 30],
      offsideRowChoices: [2, 3, 4], offsideBias: 0.70, allowSafePath: false, forceLine: true,
    },
  };

  // Flatten a preset key into the concrete cfg object game logic reads.
  function resolve(key) {
    var preset = PRESETS[key] || PRESETS.normal;
    var rows = preset.rows, cols = preset.cols;
    return Object.assign({}, preset, {
      difficulty: key || "normal",
      goalRow: 0,                    // top = goal
      startRow: rows - 1,            // bottom = kickoff
      startCol: Math.floor(cols / 2),
      tile: 16,                      // render tile size
      maxGenAttempts: 600,
    });
  }

  var CONFIG = {
    difficulty: "normal",           // daily board difficulty
    presets: PRESETS,
    resolve: resolve,
  };

  var api = CONFIG;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.OT_CONFIG = api;
})(typeof window !== "undefined" ? window : globalThis);
