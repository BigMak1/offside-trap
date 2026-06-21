// Offside Trap — single source of balance tuning (Deduction redesign).
// All numeric gameplay parameters live here so they can be balanced in one place.
// Difficulty is preset-driven: PRESETS holds the per-difficulty knobs; CONFIG.resolve(key)
// flattens a preset into the concrete cfg object the game logic consumes.
//
// Deduction model (classic-minesweeper football):
//   - The KEEPER sits at the goal (top-centre, row 0), kind 'keeper', power 1, revealed from the
//     start — it is the GOAL. Reaching/acting on it (once it borders the safe region) WINS.
//   - Field DEFENDERS are MINES, all power 1 (classic minesweeper). A safe cell's NUMBER (pressure)
//     = COUNT of adjacent defenders (the keeper is the goal and is NOT counted). Read the numbers
//     to deduce where the defenders are and find the safe path.
//   - There is a guaranteed connected SAFE path from the kickoff up to the keeper.
//   - SAVES absorb a defender hit (consume one, the run continues). With no saves left, revealing
//     a defender is a loss.
//   - ARTIFACTS on the safe path: 'save' (+1 save) and 'scout' (free safe hint).
(function (global) {
  "use strict";

  var PRESETS = {
    easy: {
      label: "Лёгкий",
      cols: 10, rows: 15,
      density: 0.30,
      startSaves: 3,
      artifacts: { save: 3, scout: 3 },
      pathWiggle: 0.35,
    },
    normal: {
      label: "Норма",
      cols: 10, rows: 15,
      density: 0.42,
      startSaves: 2,
      artifacts: { save: 2, scout: 2 },
      pathWiggle: 0.5,
    },
    hard: {
      label: "Сложный",
      cols: 10, rows: 15,
      density: 0.55,
      startSaves: 1,
      artifacts: { save: 1, scout: 2 },
      pathWiggle: 0.6,
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
      maxGenAttempts: 200,
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
