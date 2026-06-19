// Plain Node test runner (no framework) for the pure game logic.
"use strict";
const assert = require("assert");
const path = require("path");
const CONFIG = require(path.join("..", "js", "config.js"));
const RNG = require(path.join("..", "js", "rng.js"));
const G = require(path.join("..", "js", "game.js"));

// Resolve presets into flat cfg objects (CONFIG is now preset-driven, not flat).
const NORMAL = CONFIG.resolve("normal");
const EASY = CONFIG.resolve("easy");
const HARD = CONFIG.resolve("hard");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { console.error("FAIL  " + name + "\n      " + e.message); process.exitCode = 1; }
}

function countDefenders(board) {
  const c = { 1: 0, 2: 0, 3: 0, total: 0 };
  board.cells.forEach((cell) => { if (cell.def > 0) { c[cell.def]++; c.total++; } });
  return c;
}

// ── config / presets ──────────────────────────────────────────────────────────
test("resolve flattens a preset into the keys game logic reads", () => {
  const cfg = CONFIG.resolve("normal");
  assert.strictEqual(cfg.difficulty, "normal");
  assert.strictEqual(cfg.cols, 10);
  assert.strictEqual(cfg.rows, 8);
  assert.strictEqual(cfg.goalRow, 0);
  assert.strictEqual(cfg.startRow, 7);          // rows - 1
  assert.strictEqual(cfg.startCol, 5);          // floor(cols / 2)
  assert.strictEqual(cfg.tile, 16);
  assert.strictEqual(cfg.maxGenAttempts, 600);
  assert.ok(cfg.defenders && cfg.start && cfg.xpThresholds && cfg.offsideRowChoices);
  assert.strictEqual(cfg.allowSafePath, false);
});

test("resolve falls back to normal for unknown / missing keys", () => {
  const a = CONFIG.resolve("does-not-exist");
  assert.strictEqual(a.cols, 10);               // normal's board
  const b = CONFIG.resolve();
  assert.strictEqual(b.difficulty, "normal");
  assert.strictEqual(b.cols, 10);
});

// ── generation ──────────────────────────────────────────────────────────────
test("board has exactly the configured squad", () => {
  const b = G.generateBoard("day:1", NORMAL);
  const c = countDefenders(b);
  assert.strictEqual(c[1], NORMAL.defenders.r1);
  assert.strictEqual(c[2], NORMAL.defenders.r2);
  assert.strictEqual(c[3], NORMAL.defenders.r3);
  assert.strictEqual(c.total, 14);
});

test("start cell is always safe", () => {
  for (let d = 1; d <= 30; d++) {
    const b = G.generateBoard("day:" + d, NORMAL);
    assert.strictEqual(b.cells[b.startIdx].def, 0, "day " + d);
  }
});

test("every generated board is winnable (Normal)", () => {
  for (let d = 1; d <= 60; d++) {
    const b = G.generateBoard("day:" + d, NORMAL);
    assert.ok(G.isWinnable(b, NORMAL), "day " + d + " not winnable");
  }
});

test("generation is deterministic for the same seed key", () => {
  const a = G.generateBoard("day:7", NORMAL);
  const b = G.generateBoard("day:7", NORMAL);
  assert.deepStrictEqual(
    a.cells.map((c) => c.def),
    b.cells.map((c) => c.def)
  );
  assert.strictEqual(a.offsideRow, b.offsideRow);
  assert.strictEqual(a.attempt, b.attempt);
  assert.strictEqual(a.forcedDuel, b.forcedDuel);
});

test("pressure equals sum (not count) of neighbour ratings", () => {
  const b = G.generateBoard("day:3", NORMAL);
  const cols = b.cols;
  b.cells.forEach((cell, i) => {
    if (cell.def > 0) return;
    let sum = 0;
    G.neighbors(i, b.rows, cols).forEach((n) => { sum += b.cells[n].def; });
    assert.strictEqual(cell.pressure, sum, "cell " + i);
  });
});

// ── safe-path constraint per difficulty ───────────────────────────────────────
// OFFSIDE LINE: Normal/Hard place a FULL-WIDTH wall of defenders across `offsideRow`.
// With king (8-dir) movement a fully-occupied row is an exact 8-connectivity cut, so there
// is provably NO safe path across it — hasSafePath(board) === false and forcedDuel === true
// are now guaranteed (not merely attempted), while every board stays winnable.
test("Normal AND Hard force a duel: no safe path, forcedDuel true, still winnable", () => {
  [NORMAL, HARD].forEach((cfg) => {
    for (let d = 1; d <= 30; d++) {
      const b = G.generateBoard("day:" + d, cfg);
      assert.ok(b && b.cells, cfg.difficulty + " day " + d + " produced no board");
      assert.ok(G.isWinnable(b, cfg), cfg.difficulty + " day " + d + " not winnable");
      assert.strictEqual(G.hasSafePath(b), false,
        cfg.difficulty + " day " + d + " unexpectedly has a safe path");
      assert.strictEqual(b.forcedDuel, true,
        cfg.difficulty + " day " + d + " forcedDuel should be true");
    }
  });
});

test("Normal/Hard offside wall is complete: every column of offsideRow is a defender", () => {
  [NORMAL, HARD].forEach((cfg) => {
    for (let d = 1; d <= 30; d++) {
      const b = G.generateBoard("day:" + d, cfg);
      for (let c = 0; c < b.cols; c++) {
        const idx = G.index(b.offsideRow, c, b.cols);
        assert.ok(b.cells[idx].def > 0,
          cfg.difficulty + " day " + d + " column " + c + " of offsideRow is not a defender");
      }
    }
  });
});

test("start cell is never a defender on Normal/Hard (wall guards the start)", () => {
  [NORMAL, HARD].forEach((cfg) => {
    for (let d = 1; d <= 30; d++) {
      const b = G.generateBoard("day:" + d, cfg);
      assert.strictEqual(b.cells[b.startIdx].def, 0,
        cfg.difficulty + " day " + d + " start cell is a defender");
    }
  });
});

test("forcedDuel flag always matches !hasSafePath for the chosen board", () => {
  [EASY, NORMAL, HARD].forEach((cfg) => {
    for (let d = 1; d <= 30; d++) {
      const b = G.generateBoard("day:" + d, cfg);
      assert.strictEqual(b.forcedDuel, !G.hasSafePath(b),
        cfg.difficulty + " day " + d + " forcedDuel inconsistent");
    }
  });
});

test("Easy boards keep a fully-safe path (allowSafePath) and forcedDuel is false", () => {
  for (let d = 1; d <= 30; d++) {
    const b = G.generateBoard("day:" + d, EASY);
    assert.ok(G.hasSafePath(b), "easy day " + d + " has no safe path");
    assert.strictEqual(b.forcedDuel, false, "easy day " + d + " forcedDuel flag wrong");
  }
});

test("isSolvable remains an alias of hasSafePath (back-compat)", () => {
  const b = G.generateBoard("day:5", EASY);
  assert.strictEqual(G.isSolvable(b), G.hasSafePath(b));
});

test("every preset generates winnable boards across several seeds", () => {
  [EASY, NORMAL, HARD].forEach((cfg) => {
    for (let d = 1; d <= 15; d++) {
      const b = G.generateBoard("day:" + d, cfg);
      assert.ok(G.isWinnable(b, cfg), cfg.difficulty + " day " + d + " not winnable");
    }
  });
});

// ── isWinnable: crafted boards ────────────────────────────────────────────────
// Build a bare board: all-safe grid, single defender row config we control.
function craftBoard(rows, cols, startCol, defs) {
  const n = rows * cols;
  const cells = new Array(n);
  for (let i = 0; i < n; i++) {
    cells[i] = { def: 0, pressure: 0, revealed: false, marked: false, beaten: false, lost: false };
  }
  const startIdx = (rows - 1) * cols + startCol;
  defs.forEach(({ r, c, def }) => { cells[r * cols + c].def = def; });
  return { cells, startIdx, offsideRow: 2, rows, cols };
}

test("isWinnable: clearly-winnable board returns true", () => {
  // 4x3, start bottom-centre, completely open -> reach row 0 with zero duels.
  const b = craftBoard(4, 3, 1, []);
  assert.ok(G.isWinnable(b, NORMAL));
});

test("isWinnable: winnable through one affordable duel", () => {
  // 4x3 with a single rating-2 defender blocking, skill 1 + plenty of stamina => affordable.
  const cfg = CONFIG.resolve("normal");
  const b = craftBoard(4, 3, 1, [
    { r: 1, c: 0, def: 2 }, { r: 1, c: 1, def: 2 }, { r: 1, c: 2, def: 2 },
  ]);
  // Wall across row 1 (8-dir) but each costs 1 with skill 1, stamina 5 => beatable.
  assert.ok(G.isWinnable(b, cfg));
});

test("isWinnable: hopeless board (unaffordable wall, 0 stamina) returns false", () => {
  // Goal row reachable only through a solid row of rating-3 defenders. With skill 1 and
  // 0 stamina every duel costs 2 > 0 => cannot be attempted => not winnable.
  const cfg = Object.assign({}, CONFIG.resolve("normal"), {
    start: { skill: 1, stamina: 0 },
    xpThresholds: [999, 999, 999, 999, 999], // never level up
  });
  // 3x3 grid: wall the entire middle row so the open start cannot flood to row 0.
  const b = craftBoard(3, 3, 1, [
    { r: 1, c: 0, def: 3 }, { r: 1, c: 1, def: 3 }, { r: 1, c: 2, def: 3 },
  ]);
  assert.strictEqual(G.isWinnable(b, cfg), false);
});

test("isWinnable: hopeless board where goal row is fully walled by rating-3s", () => {
  // The goal row (row 0) is itself all defenders rated 3, unaffordable with 0 stamina.
  const cfg = Object.assign({}, CONFIG.resolve("normal"), {
    start: { skill: 1, stamina: 0 },
    xpThresholds: [999, 999, 999, 999, 999],
  });
  const b = craftBoard(3, 4, 1, [
    { r: 0, c: 0, def: 3 }, { r: 0, c: 1, def: 3 }, { r: 0, c: 2, def: 3 }, { r: 0, c: 3, def: 3 },
  ]);
  assert.strictEqual(G.isWinnable(b, cfg), false);
});

// ── opening move ─────────────────────────────────────────────────────────────
test("opening move reveals the start cell and is free", () => {
  const s = G.createGame("day:5", NORMAL);
  assert.ok(s.board.cells[s.board.startIdx].revealed);
  assert.strictEqual(s.player.stamina, NORMAL.start.stamina);
  assert.strictEqual(s.status, "playing");
});

test("createGame defaults to the daily (normal) preset when no cfg passed", () => {
  const s = G.createGame("day:5");
  assert.strictEqual(s.board.cols, 10);
  assert.strictEqual(s.player.maxStamina, 5);
});

test("a zero-pressure start cascades to several cells", () => {
  // Find a day whose start pressure is 0 so a cascade happens.
  let cascaded = false;
  for (let d = 1; d <= 40 && !cascaded; d++) {
    const s = G.createGame("day:" + d, NORMAL);
    const revealed = s.board.cells.filter((c) => c.revealed).length;
    if (s.board.cells[s.board.startIdx].pressure === 0) {
      assert.ok(revealed > 1, "expected cascade on day " + d);
      cascaded = true;
    }
  }
  assert.ok(cascaded, "no zero-pressure start found in 40 days (unexpected)");
});

// ── dribbling adjacency ──────────────────────────────────────────────────────
test("cannot reveal a non-adjacent cell (dribbling rule)", () => {
  const s = G.createGame("day:5", NORMAL);
  // top-left corner is far from the bottom-centre start; should be illegal at first.
  const far = G.index(0, 0, s.board.cols);
  if (!s.board.cells[far].revealed) {
    const ev = G.revealCell(s, far, {});
    assert.ok(ev.some((e) => e.type === "illegal"), "expected illegal move");
    assert.strictEqual(s.board.cells[far].revealed, false);
  }
});

// ── duel mechanics ───────────────────────────────────────────────────────────
// A reveal-able target must be a *frontier* cell (hidden + adjacent to a revealed passable
// cell). On Normal the opening cascade floods the whole defender-free approach region, so the
// ball's own neighbours may already be revealed — find any frontier cell instead of relying
// on an unrevealed neighbour of the ball.
function firstFrontier(s, pred) {
  for (let i = 0; i < s.board.cells.length; i++) {
    if (G.isFrontier(s, i) && (!pred || pred(i))) return i;
  }
  return -1;
}

function injectDuel(seed, rating) {
  // Fresh game; force a defender of the given rating on a frontier cell next to the ball.
  const s = G.createGame(seed, NORMAL);
  const target = firstFrontier(s);
  assert.ok(target >= 0, "no frontier cell found for " + seed);
  s.board.cells[target].def = rating;
  s.board.cells[target].pressure = 0;
  return { s, target };
}

test("duel within skill is free (cost 0) and still grants XP = rating", () => {
  const { s, target } = injectDuel("day:9", 1); // rating 1 <= skill 1 => free
  const beforeStamina = s.player.stamina;
  const ev = G.revealCell(s, target, {});
  const duel = ev.find((e) => e.type === "duel");
  assert.strictEqual(duel.cost, 0);
  assert.strictEqual(s.player.stamina, beforeStamina); // no stamina spent
  assert.strictEqual(s.player.xp, 1);
  assert.ok(s.board.cells[target].beaten);
});

test("duel above skill costs stamina = rating - skill", () => {
  const { s, target } = injectDuel("day:9", 2); // rating 2 > skill 1 => cost 1, xp 2 < threshold
  const beforeStamina = s.player.stamina;
  const ev = G.revealCell(s, target, {});
  const duel = ev.find((e) => e.type === "duel");
  assert.strictEqual(duel.cost, 2 - NORMAL.start.skill);
  assert.ok(!ev.some((e) => e.type === "levelup"), "should not level up yet");
  assert.strictEqual(s.player.stamina, beforeStamina - duel.cost);
  assert.strictEqual(s.player.xp, 2);
});

test("losing a duel (cost > stamina) ends the game", () => {
  const s = G.createGame("day:9", NORMAL);
  s.player.stamina = 0;
  s.player.skill = 1;
  const target = firstFrontier(s);
  assert.ok(target >= 0, "no frontier cell found");
  s.board.cells[target].def = 3; // cost = 2 > 0 stamina
  s.board.cells[target].pressure = 0;
  const ev = G.revealCell(s, target, {});
  assert.ok(ev.some((e) => e.type === "gameover"));
  assert.strictEqual(s.status, "lost");
});

// ── leveling ─────────────────────────────────────────────────────────────────
test("crossing an XP threshold raises skill, refills + grows stamina", () => {
  const s = G.createGame("day:9", NORMAL);
  const beforeSkill = s.player.skill;
  const beforeMax = s.player.maxStamina;
  s.player.stamina = 0;
  s.player.xp = NORMAL.xpThresholds[0] - 3; // one rating-3 win will cross it
  const target = firstFrontier(s);
  assert.ok(target >= 0, "no frontier cell found");
  s.board.cells[target].def = 3;
  s.board.cells[target].pressure = 0;
  // make sure we can afford: skill 1 vs rating 3 => cost 2, give stamina
  s.player.stamina = 5;
  const ev = G.revealCell(s, target, {});
  assert.ok(ev.some((e) => e.type === "levelup"));
  assert.strictEqual(s.player.skill, beforeSkill + 1);
  assert.strictEqual(s.player.maxStamina, beforeMax + 1);
  assert.strictEqual(s.player.stamina, s.player.maxStamina); // refilled
});

// ── marking ──────────────────────────────────────────────────────────────────
test("marking toggles and a marked cell is blocked from reveal", () => {
  const s = G.createGame("day:5", NORMAL);
  // Any hidden safe cell will do: toggleMark/blocked don't require frontier adjacency.
  let target = -1;
  for (let i = 0; i < s.board.cells.length; i++) {
    if (!s.board.cells[i].revealed && s.board.cells[i].def === 0) { target = i; break; }
  }
  assert.ok(target >= 0, "no hidden safe cell found");
  G.toggleMark(s, target);
  assert.ok(s.board.cells[target].marked);
  const ev = G.revealCell(s, target, {});
  assert.ok(ev.some((e) => e.type === "blocked"));
  assert.strictEqual(s.board.cells[target].revealed, false);
});

// ── win condition ────────────────────────────────────────────────────────────
test("revealing/occupying a goal-row cell wins (Easy, guaranteed safe path)", () => {
  // Easy guarantees a fully-safe path; walk it greedily upward to confirm a goal is reachable.
  const s = G.createGame("day:11", EASY);
  let guard = 0;
  while (s.status === "playing" && guard++ < 500) {
    // collect frontier safe cells, prefer the one with the smallest row (closest to goal)
    let best = -1, bestRow = 99;
    for (let i = 0; i < s.board.cells.length; i++) {
      if (G.isFrontier(s, i) && s.board.cells[i].def === 0) {
        const r = G.rowOf(i, s.board.cols);
        if (r < bestRow) { bestRow = r; best = i; }
      }
    }
    if (best < 0) break;
    G.revealCell(s, best, {});
  }
  assert.strictEqual(s.status, "won", "greedy safe walk should reach the goal");
});

console.log("\n" + passed + " checks passed.");
