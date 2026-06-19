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
  assert.strictEqual(cfg.levelRefill, 2);       // partial refill carried through resolve()
});

test("presets expose the hardcore balance numbers (start stamina, counts, levelRefill)", () => {
  // Easy: generous start + effectively-full refill.
  assert.strictEqual(EASY.start.stamina, 6);
  assert.strictEqual(EASY.start.skill, 1);
  assert.strictEqual(EASY.levelRefill, 99);
  assert.deepStrictEqual(EASY.defenders, { r1: 5, r2: 3, r3: 1 });
  // Normal: tight start, partial refill, wall-sized rating>=2 pool (r2 + r3 === cols).
  assert.strictEqual(NORMAL.start.stamina, 3);
  assert.strictEqual(NORMAL.levelRefill, 2);
  assert.deepStrictEqual(NORMAL.defenders, { r1: 4, r2: 7, r3: 3 });
  assert.strictEqual(NORMAL.defenders.r2 + NORMAL.defenders.r3, NORMAL.cols); // 7 + 3 === 10
  // Hard: tightest start, smallest refill, rating>=2 pool >= cols.
  assert.strictEqual(HARD.start.stamina, 2);
  assert.strictEqual(HARD.levelRefill, 1);
  assert.deepStrictEqual(HARD.defenders, { r1: 4, r2: 9, r3: 5 });
  assert.ok(HARD.defenders.r2 + HARD.defenders.r3 >= HARD.cols); // 9 + 5 >= 11
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

test("Normal/Hard offside wall is entirely rating>=2: no free crossing (cheapest cost >=1 at skill 1)", () => {
  [NORMAL, HARD].forEach((cfg) => {
    let cheapest = Infinity;
    for (let d = 1; d <= 40; d++) {
      const b = G.generateBoard("day:" + d, cfg);
      let minWallRating = Infinity;
      for (let c = 0; c < b.cols; c++) {
        const idx = G.index(b.offsideRow, c, b.cols);
        const def = b.cells[idx].def;
        assert.ok(def >= 2,
          cfg.difficulty + " day " + d + " wall column " + c + " rating " + def + " < 2 (free crossing)");
        if (def < minWallRating) minWallRating = def;
      }
      // Cheapest crossing at skill 1 is max(0, minWallRating - 1) >= 1 since minWallRating >= 2.
      const cost = Math.max(0, minWallRating - cfg.start.skill);
      assert.ok(cost >= 1,
        cfg.difficulty + " day " + d + " cheapest wall crossing cost " + cost + " < 1");
      if (cost < cheapest) cheapest = cost;
    }
    // Report the cheapest observed crossing for the difficulty (always >= 1).
    assert.ok(cheapest >= 1, cfg.difficulty + " somehow had a free wall crossing");
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

// ── isWinnable soundness cross-check ──────────────────────────────────────────
// Independently verify that isWinnable's "true" verdict is consistent with the board ACTUALLY
// being beatable by the real engine. We drive createGame/revealCell through a depth-first search
// over duel choices (safe frontier cells are always taken first — free progress), backtracking
// by re-running from the seed and replaying a chosen duel sequence. If isWinnable says true but
// no play reaches the goal, the validator and engine disagree (would accept unwinnable boards).
function enginePlayable(seedKey, cfg) {
  // Snapshot helper: deep-clone the mutable parts of a game state so we can branch on duels.
  function clone(s) {
    return {
      cfg: s.cfg,
      board: {
        cells: s.board.cells.map((c) => ({ ...c })),
        startIdx: s.board.startIdx, offsideRow: s.board.offsideRow,
        rows: s.board.rows, cols: s.board.cols,
      },
      player: { ...s.player },
      status: s.status, ballIdx: s.ballIdx, events: [],
    };
  }
  const root = G.createGame(seedKey, cfg);
  let nodes = 0;
  const CAP = 200000;
  // DFS over states. At each state: flood all safe frontier cells first (free, deterministic),
  // then branch on each affordable frontier defender.
  function solve(state) {
    if (++nodes > CAP) return false;
    if (state.status === "won") return true;
    if (state.status === "lost") return false;
    // 1) Take every safe frontier reveal (free). Each may win or open more region.
    let progressed = true;
    while (progressed && state.status === "playing") {
      progressed = false;
      for (let i = 0; i < state.board.cells.length; i++) {
        if (G.isFrontier(state, i) && state.board.cells[i].def === 0) {
          G.revealCell(state, i, {});
          progressed = true;
          if (state.status === "won") return true;
          if (state.status === "lost") return false;
        }
      }
    }
    if (state.status === "won") return true;
    if (state.status !== "playing") return false;
    // 2) Branch on each affordable frontier defender.
    for (let i = 0; i < state.board.cells.length; i++) {
      if (!G.isFrontier(state, i)) continue;
      const cell = state.board.cells[i];
      if (cell.def === 0) continue;
      const cost = Math.max(0, cell.def - state.player.skill);
      if (cost > state.player.stamina) continue;
      const branch = clone(state);
      G.revealCell(branch, i, {});
      if (solve(branch)) return true;
    }
    return false;
  }
  return solve(root);
}

test("isWinnable soundness: a 'true' verdict is actually beatable by the real engine", () => {
  [EASY, NORMAL, HARD].forEach((cfg) => {
    for (let d = 1; d <= 12; d++) {
      const seed = "day:" + d;
      const b = G.generateBoard(seed, cfg);
      if (!G.isWinnable(b, cfg)) continue; // only cross-check the boards the validator accepts
      assert.ok(enginePlayable(seed, cfg),
        cfg.difficulty + " " + seed + ": isWinnable=true but engine could not beat it");
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
  assert.strictEqual(s.player.maxStamina, NORMAL.start.stamina); // 3 under the hardcore economy
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

test("losing a duel (cost > stamina) ends the game with a 'tackle' gameover", () => {
  const s = G.createGame("day:9", NORMAL);
  s.player.stamina = 0;
  s.player.skill = 1;
  const target = firstFrontier(s);
  assert.ok(target >= 0, "no frontier cell found");
  s.board.cells[target].def = 3; // cost = 2 > 0 stamina
  s.board.cells[target].pressure = 0;
  const ev = G.revealCell(s, target, {});
  const over = ev.find((e) => e.type === "gameover");
  assert.ok(over, "expected a gameover event");
  assert.strictEqual(over.reason, "tackle");
  assert.strictEqual(over.idx, target);
  assert.strictEqual(over.rating, 3);
  assert.strictEqual(over.cost, 2);
  assert.strictEqual(over.stamina, 0); // what the player HAD (< cost)
  assert.strictEqual(s.status, "lost");
});

// ── leveling ─────────────────────────────────────────────────────────────────
test("crossing an XP threshold raises skill, grows max, and PARTIALLY refills stamina", () => {
  // Normal: levelRefill = 2 (NOT a full refill). Craft a single affordable rating-3 duel that
  // crosses exactly one threshold, then verify stamina = min(newMax, prevStamina - cost + 2).
  const s = G.createGame("day:9", NORMAL);
  const beforeSkill = s.player.skill;     // 1
  const beforeMax = s.player.maxStamina;  // 3
  s.player.xp = NORMAL.xpThresholds[0] - 3; // one rating-3 win (+3 xp) crosses the first tier
  const target = firstFrontier(s);
  assert.ok(target >= 0, "no frontier cell found");
  s.board.cells[target].def = 3;
  s.board.cells[target].pressure = 0;
  // skill 1 vs rating 3 => cost 2; give enough to afford it with a known remainder.
  s.player.stamina = 3;
  const ev = G.revealCell(s, target, {});
  assert.ok(ev.some((e) => e.type === "levelup"), "should level up");
  assert.strictEqual(s.player.skill, beforeSkill + 1);
  assert.strictEqual(s.player.maxStamina, beforeMax + 1); // 4
  // After paying cost 2 from 3 => 1 stamina; +levelRefill(2) = 3, capped at new max 4 => 3.
  const expected = Math.min(beforeMax + 1, (3 - 2) + NORMAL.levelRefill);
  assert.strictEqual(s.player.stamina, expected);          // 3, NOT a full refill to 4
  assert.ok(s.player.stamina < s.player.maxStamina, "partial refill did not top up to max");
});

test("Hard level-up refills only levelRefill(1) stamina, not to full", () => {
  const s = G.createGame("day:9", HARD);
  s.player.xp = HARD.xpThresholds[0] - 3; // one rating-3 win crosses the first tier
  const target = firstFrontier(s);
  assert.ok(target >= 0, "no frontier cell found");
  s.board.cells[target].def = 3;          // cost 2 at skill 1
  s.board.cells[target].pressure = 0;
  s.player.stamina = 4;
  const beforeMax = s.player.maxStamina;
  const ev = G.revealCell(s, target, {});
  assert.ok(ev.some((e) => e.type === "levelup"));
  // 4 - 2 = 2, + levelRefill(1) = 3, capped at new max (beforeMax + 1).
  const expected = Math.min(beforeMax + 1, (4 - 2) + HARD.levelRefill);
  assert.strictEqual(s.player.stamina, expected);
});

// ── stranded loss (soft-lock closed) ──────────────────────────────────────────
test("isStranded: every frontier is an unaffordable defender => move triggers a 'stranded' loss", () => {
  // Craft a small grid: an open row 2 (approach) flooded from the start, then a wall of
  // rating-3 defenders on row 1 that the player can never afford (skill 1, 0 stamina => cost 2).
  // After revealing a safe approach cell (which doesn't win), the engine must detect the lock.
  const cols = 3, rows = 4;
  const cells = [];
  for (let i = 0; i < rows * cols; i++) {
    cells.push({ def: 0, pressure: 0, revealed: false, marked: false, beaten: false, lost: false });
  }
  // Wall row 1 entirely with rating-3 defenders.
  for (let c = 0; c < cols; c++) cells[1 * cols + c].def = 3;
  const startIdx = (rows - 1) * cols + 1; // bottom-centre
  const board = { cells, startIdx, offsideRow: 1, rows, cols };
  // Build a state by hand so we control the player economy precisely.
  const state = {
    cfg: NORMAL, board,
    player: { skill: 1, stamina: 0, maxStamina: 3, xp: 0, level: 0 },
    status: "playing", ballIdx: startIdx, events: [],
  };
  // Reveal the start (initial: never strands) — floods the open approach (rows 2 & 3).
  G.revealCell(state, startIdx, { initial: true, force: true });
  assert.strictEqual(state.status, "playing", "opening reveal must not strand");
  // Sanity: every frontier cell is now a rating-3 defender (the wall), all unaffordable.
  let frontierDefenders = 0;
  for (let i = 0; i < cells.length; i++) {
    if (G.isFrontier(state, i)) { assert.strictEqual(cells[i].def, 3); frontierDefenders++; }
  }
  assert.ok(frontierDefenders > 0, "expected wall defenders on the frontier");
  assert.strictEqual(G.isStranded(state), true, "should report stranded");
  // A subsequent non-initial reveal of an already-safe frontier-adjacent cell... but all
  // frontier cells are walls. Instead, re-reveal via a safe move on the approach to trigger the
  // post-action stranded check. Reveal a still-hidden safe approach cell adjacent to the ball.
  // Simpler: drive any non-initial action and assert the loss. Find a hidden safe cell to mark/
  // unmark then reveal — but cleanest is to call revealCell on a safe frontier-adjacent... none.
  // So directly exercise the check via a no-win safe reveal: pick a hidden safe cell and reveal.
  // Here the whole approach is already revealed, so use the public path: a duel attempt that the
  // player cannot win is a 'tackle' loss, not stranded. To test the STRANDED path specifically,
  // reveal a safe cell that does not win. We force one hidden safe cell at row 2 then reveal it.
  cells[2 * cols + 0].revealed = false; // re-hide a safe approach cell
  const ev = G.revealCell(state, 2 * cols + 0, {});
  const over = ev.find((e) => e.type === "gameover");
  assert.ok(over, "expected a gameover event after the stranded move");
  assert.strictEqual(over.reason, "stranded");
  assert.strictEqual(over.stamina, 0);
  assert.strictEqual(over.idx, state.ballIdx);
  assert.strictEqual(state.status, "lost");
});

test("gameover events carry a reason ('tackle' on unaffordable duel, 'stranded' otherwise)", () => {
  // tackle
  const s1 = G.createGame("day:9", NORMAL);
  s1.player.stamina = 0;
  const t1 = firstFrontier(s1);
  s1.board.cells[t1].def = 3; s1.board.cells[t1].pressure = 0;
  const ev1 = G.revealCell(s1, t1, {});
  assert.strictEqual(ev1.find((e) => e.type === "gameover").reason, "tackle");

  // stranded: build a hand-state whose only frontier options are unaffordable, then reveal a
  // safe (non-winning) cell to trip the post-action check.
  const cols = 3, rows = 4;
  const cells = [];
  for (let i = 0; i < rows * cols; i++) {
    cells.push({ def: 0, pressure: 0, revealed: false, marked: false, beaten: false, lost: false });
  }
  for (let c = 0; c < cols; c++) cells[1 * cols + c].def = 3;
  const startIdx = (rows - 1) * cols + 1;
  const board = { cells, startIdx, offsideRow: 1, rows, cols };
  const s2 = {
    cfg: NORMAL, board,
    player: { skill: 1, stamina: 0, maxStamina: 3, xp: 0, level: 0 },
    status: "playing", ballIdx: startIdx, events: [],
  };
  G.revealCell(s2, startIdx, { initial: true, force: true });
  cells[2 * cols + 2].revealed = false; // re-hide a safe cell to reveal as a non-winning move
  const ev2 = G.revealCell(s2, 2 * cols + 2, {});
  assert.strictEqual(ev2.find((e) => e.type === "gameover").reason, "stranded");
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
