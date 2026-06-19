// Offside Trap — single source of balance tuning.
// All numeric gameplay parameters live here so they can be balanced in one place.
(function (global) {
  "use strict";

  var CONFIG = {
    // Board
    cols: 10,
    rows: 8,
    goalRow: 0,            // top = goal
    startRow: 7,           // bottom = kickoff
    startCol: 4,

    // Defender squad (analogous to mines). Total = 14.
    defenders: { r1: 7, r2: 5, r3: 2 },

    // Player start
    start: { skill: 1, stamina: 5 },

    // Cumulative XP needed to reach level 1, 2, 3, ...
    xpThresholds: [3, 7, 12, 18, 25],

    // Hidden offside line used as a placement tell (not a rule).
    offsideRowChoices: [2, 3],
    // Probability a "last line" defender (rating >= 2) is placed near offsideRow +/- 1.
    offsideBias: 0.65,

    // Generation
    maxGenAttempts: 400,

    // Render
    tile: 16,
  };

  var api = CONFIG;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.OT_CONFIG = api;
})(typeof window !== "undefined" ? window : globalThis);
