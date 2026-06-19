// Offside Trap — chiptune SFX, synthesised live via Web Audio (no audio files, authentic 8-bit).
// One AudioContext, created/resumed on the first user gesture (autoplay policy). Each cue is a
// few oscillator blips + the odd noise burst with fast envelopes. Shares the mute state with the
// stadium ambience (main.js calls OT_SFX.setMuted).
(function (global) {
  "use strict";

  var ctx = null, muted = false;

  function ensure() {
    if (!ctx) {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
    }
    if (ctx.state === "suspended") { try { ctx.resume(); } catch (e) {} }
    return ctx;
  }

  // A single tone with an exponential decay envelope; optional pitch slide.
  function blip(freq, dur, type, vol, slideTo, delay) {
    var c = ctx; if (!c) return;
    var t = c.currentTime + (delay || 0);
    var osc = c.createOscillator(), g = c.createGain();
    osc.type = type || "square";
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(c.destination);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  // A quick arpeggio: notes played in sequence.
  function arp(freqs, step, type, vol) {
    for (var i = 0; i < freqs.length; i++) blip(freqs[i], step * 1.6, type, vol, null, i * step);
  }

  // A short filtered-ish noise burst (decaying), for impact/tackle.
  function noise(dur, vol, delay) {
    var c = ctx; if (!c) return;
    var t = c.currentTime + (delay || 0);
    var n = Math.floor(c.sampleRate * dur);
    var buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = c.createBufferSource(); src.buffer = buf;
    var g = c.createGain(); g.gain.setValueAtTime(vol || 0.1, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(g); g.connect(c.destination);
    src.start(t); src.stop(t + dur);
  }

  var CUES = {
    reveal:  function () { blip(880, 0.05, "square", 0.05); },
    mark:    function () { blip(360, 0.05, "square", 0.10); },
    tackle:  function () { blip(220, 0.10, "square", 0.16, 110); noise(0.07, 0.10); },
    medkit:  function () { arp([523, 784], 0.08, "triangle", 0.13); },
    levelup: function () { arp([392, 523, 659, 880], 0.075, "square", 0.15); },
    goal:    function () { arp([523, 659, 784, 1047, 1319], 0.09, "square", 0.18); noise(0.05, 0.06); },
    lose:    function () { arp([392, 311, 262, 196], 0.14, "sawtooth", 0.16); },
    deny:    function () { blip(140, 0.12, "square", 0.12); },
  };

  function play(name) {
    if (muted) return;
    if (!ensure()) return;
    var fn = CUES[name];
    if (fn) try { fn(); } catch (e) {}
  }

  var api = {
    ensure: ensure, play: play,
    setMuted: function (m) { muted = !!m; },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.OT_SFX = api;
})(typeof window !== "undefined" ? window : globalThis);
