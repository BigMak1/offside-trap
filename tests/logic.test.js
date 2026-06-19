// Plain Node test runner (no framework) for the pure game logic.
"use strict";
const assert = require("assert");
const path = require("path");
const CONFIG = require(path.join("..", "js", "config.js"));
const RNG = require(path.join("..", "js", "rng.js"));
const G = require(path.join("..", "js", "game.js"));

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

// ── generation ──────────────────────────────────────────────────────────────
test("board has exactly the configured squad", () => {
  const b = G.generateBoard("day:1", CONFIG);
  const c = countDefenders(b);
  assert.strictEqual(c[1], CONFIG.defenders.r1);
  assert.strictEqual(c[2], CONFIG.defenders.r2);
  assert.strictEqual(c[3], CONFIG.defenders.r3);
  assert.strictEqual(c.total, 14);
});

test("start cell is always safe", () => {
  for (let d = 1; d <= 30; d++) {
    const b = G.generateBoard("day:" + d, CONFIG);
    assert.strictEqual(b.cells[b.startIdx].def, 0, "day " + d);
  }
});

test("every generated board is solvable (safe path start -> goal row)", () => {
  for (let d = 1; d <= 60; d++) {
    const b = G.generateBoard("day:" + d, CONFIG);
    assert.ok(G.isSolvable(b), "day " + d + " not solvable");
  }
});

test("generation is deterministic for the same seed key", () => {
  const a = G.generateBoard("day:7", CONFIG);
  const b = G.generateBoard("day:7", CONFIG);
  assert.deepStrictEqual(
    a.cells.map((c) => c.def),
    b.cells.map((c) => c.def)
  );
  assert.strictEqual(a.offsideRow, b.offsideRow);
});

test("pressure equals sum (not count) of neighbour ratings", () => {
  const b = G.generateBoard("day:3", CONFIG);
  const cols = b.cols;
  b.cells.forEach((cell, i) => {
    if (cell.def > 0) return;
    let sum = 0;
    G.neighbors(i, b.rows, cols).forEach((n) => { sum += b.cells[n].def; });
    assert.strictEqual(cell.pressure, sum, "cell " + i);
  });
});

// ── opening move ─────────────────────────────────────────────────────────────
test("opening move reveals the start cell and is free", () => {
  const s = G.createGame("day:5", CONFIG);
  assert.ok(s.board.cells[s.board.startIdx].revealed);
  assert.strictEqual(s.player.stamina, CONFIG.start.stamina);
  assert.strictEqual(s.status, "playing");
});

test("a zero-pressure start cascades to several cells", () => {
  // Find a day whose start pressure is 0 so a cascade happens.
  let cascaded = false;
  for (let d = 1; d <= 40 && !cascaded; d++) {
    const s = G.createGame("day:" + d, CONFIG);
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
  const s = G.createGame("day:5", CONFIG);
  // top-left corner is far from the bottom-centre start; should be illegal at first.
  const far = G.index(0, 0, s.board.cols);
  if (!s.board.cells[far].revealed) {
    const ev = G.revealCell(s, far, {});
    assert.ok(ev.some((e) => e.type === "illegal"), "expected illegal move");
    assert.strictEqual(s.board.cells[far].revealed, false);
  }
});

// ── duel mechanics ───────────────────────────────────────────────────────────
function injectDuel(seed, rating) {
  // Fresh game; force a defender of the given rating adjacent to the ball.
  const s = G.createGame(seed, CONFIG);
  const target = G.neighbors(s.ballIdx, s.board.rows, s.board.cols)
    .find((n) => !s.board.cells[n].revealed);
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
  assert.strictEqual(duel.cost, 2 - CONFIG.start.skill);
  assert.ok(!ev.some((e) => e.type === "levelup"), "should not level up yet");
  assert.strictEqual(s.player.stamina, beforeStamina - duel.cost);
  assert.strictEqual(s.player.xp, 2);
});

test("losing a duel (cost > stamina) ends the game", () => {
  const s = G.createGame("day:9", CONFIG);
  s.player.stamina = 0;
  s.player.skill = 1;
  const ball = s.ballIdx;
  const target = G.neighbors(ball, s.board.rows, s.board.cols)
    .find((n) => !s.board.cells[n].revealed);
  s.board.cells[target].def = 3; // cost = 2 > 0 stamina
  const ev = G.revealCell(s, target, {});
  assert.ok(ev.some((e) => e.type === "gameover"));
  assert.strictEqual(s.status, "lost");
});

// ── leveling ─────────────────────────────────────────────────────────────────
test("crossing an XP threshold raises skill, refills + grows stamina", () => {
  const s = G.createGame("day:9", CONFIG);
  const beforeSkill = s.player.skill;
  const beforeMax = s.player.maxStamina;
  s.player.stamina = 0;
  s.player.xp = CONFIG.xpThresholds[0] - 3; // one rating-3 win will cross it
  const ball = s.ballIdx;
  const target = G.neighbors(ball, s.board.rows, s.board.cols)
    .find((n) => !s.board.cells[n].revealed);
  s.board.cells[target].def = 3;
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
  const s = G.createGame("day:5", CONFIG);
  const ball = s.ballIdx;
  const target = G.neighbors(ball, s.board.rows, s.board.cols)
    .find((n) => !s.board.cells[n].revealed && s.board.cells[n].def === 0);
  G.toggleMark(s, target);
  assert.ok(s.board.cells[target].marked);
  const ev = G.revealCell(s, target, {});
  assert.ok(ev.some((e) => e.type === "blocked"));
  assert.strictEqual(s.board.cells[target].revealed, false);
});

// ── win condition ────────────────────────────────────────────────────────────
test("revealing/occupying a goal-row cell wins", () => {
  // Walk the guaranteed safe path greedily upward to confirm a goal is reachable.
  const s = G.createGame("day:11", CONFIG);
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
