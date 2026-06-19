// Offside Trap — deterministic seeded RNG helpers.
(function (global) {
  "use strict";

  // FNV-1a string hash -> uint32 seed.
  function hashStr(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // mulberry32 PRNG: returns a function yielding floats in [0, 1).
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick(arr, rnd) {
    return arr[Math.floor(rnd() * arr.length)];
  }

  // Stable key for the daily board (or a dev override day=N).
  function dailyKey(day) {
    if (day !== undefined && day !== null && day !== "") return "day:" + day;
    var d = new Date();
    var k = d.getUTCFullYear() + "-" + (d.getUTCMonth() + 1) + "-" + d.getUTCDate();
    return "utc:" + k;
  }

  var api = { hashStr: hashStr, mulberry32: mulberry32, pick: pick, dailyKey: dailyKey };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.OT_RNG = api;
})(typeof window !== "undefined" ? window : globalThis);
