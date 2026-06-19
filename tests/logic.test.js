// Plain Node test runner (no framework) for the pure game logic (Stage 4: Dragonsweeper football).
"use strict";
const assert = require("assert");
const path = require("path");
const CONFIG = require(path.join("..", "js", "config.js"));
const RNG = require(path.join("..", "js", "rng.js"));
const G = require(path.join("..", "js", "game.js"));

// Resolve presets into flat cfg objects (CONFIG is preset-driven, not flat).
const EASY = CONFIG.resolve("easy");
const NORMAL = CONFIG.resolve("normal");
const HARD = CONFIG.resolve("hard");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { console.error("FAIL  " + name + "\n      " + (e.stack || e.message)); process.exitCode = 1; }
}

// Count UNBEATEN field defenders by power (keeper excluded).
function countFieldDefenders(board) {
  const c = { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 };
  board.cells.forEach((cell) => {
    if (cell.kind === "field" && cell.power > 0) { c[cell.power]++; c.total++; }
  });
  return c;
}
function countMedkits(board) {
  return board.cells.filter((c) => c.kind === "medkit").length;
}

// ── config / presets ──────────────────────────────────────────────────────────
test("resolve flattens a preset into the keys game logic reads", () => {
  const cfg = CONFIG.resolve("normal");
  assert.strictEqual(cfg.difficulty, "normal");
  assert.strictEqual(cfg.cols, 8);
  assert.strictEqual(cfg.rows, 12);
  assert.strictEqual(cfg.goalRow, 0);
  assert.strictEqual(cfg.startRow, 11);          // rows - 1
  assert.strictEqual(cfg.startCol, 4);           // floor(cols / 2)
  assert.strictEqual(cfg.keeperCol, 4);          // floor(cols / 2)
  assert.strictEqual(cfg.tile, 16);
  assert.strictEqual(cfg.keeperPower, 13);
  assert.strictEqual(cfg.medkits, 2);
  assert.strictEqual(cfg.medkitRestore, 3);
  assert.strictEqual(cfg.allowSafePath, false);
  assert.ok(cfg.defenders && cfg.start && cfg.xpThresholds);
});

test("presets expose the Stage-4 balance numbers", () => {
  // Easy: 7x10, generous start, keeper 9, 3 medkits.
  assert.strictEqual(EASY.cols, 7);
  assert.strictEqual(EASY.rows, 10);
  assert.deepStrictEqual(EASY.defenders, { p1: 6, p2: 4, p3: 2, p4: 0 });
  assert.strictEqual(EASY.keeperPower, 9);
  assert.strictEqual(EASY.start.skill, 1);
  assert.strictEqual(EASY.start.stamina, 7);
  assert.strictEqual(EASY.medkits, 3);
  assert.deepStrictEqual(EASY.xpThresholds, [4, 9, 15, 22, 30]);
  // Normal: 8x12, keeper 13, 2 medkits.
  assert.strictEqual(NORMAL.cols, 8);
  assert.strictEqual(NORMAL.rows, 12);
  assert.deepStrictEqual(NORMAL.defenders, { p1: 8, p2: 6, p3: 4, p4: 2 });
  assert.strictEqual(NORMAL.keeperPower, 13);
  assert.strictEqual(NORMAL.start.stamina, 6);
  assert.strictEqual(NORMAL.medkits, 2);
  assert.deepStrictEqual(NORMAL.xpThresholds, [4, 9, 15, 22, 30, 40, 52]);
  // Hard: 8x14, keeper 17, 1 medkit.
  assert.strictEqual(HARD.cols, 8);
  assert.strictEqual(HARD.rows, 14);
  assert.deepStrictEqual(HARD.defenders, { p1: 9, p2: 8, p3: 6, p4: 3 });
  assert.strictEqual(HARD.keeperPower, 17);
  assert.strictEqual(HARD.start.stamina, 5);
  assert.strictEqual(HARD.medkits, 1);
  assert.deepStrictEqual(HARD.xpThresholds, [5, 11, 18, 26, 35, 45, 57]);
});

test("resolve falls back to normal for unknown / missing keys", () => {
  const a = CONFIG.resolve("does-not-exist");
  assert.strictEqual(a.difficulty, "normal");
  assert.strictEqual(a.cols, 8);
  const b = CONFIG.resolve();
  assert.strictEqual(b.difficulty, "normal");
  assert.strictEqual(b.cols, 8);
});

// ── generation ──────────────────────────────────────────────────────────────
test("keeper is placed at the goal (row 0, keeperCol), revealed from start, correct power", () => {
  [EASY, NORMAL, HARD].forEach((cfg) => {
    const b = G.generateBoard("day:1", cfg);
    const keeperIdx = G.index(cfg.goalRow, cfg.keeperCol, cfg.cols);
    assert.strictEqual(b.keeperIdx, keeperIdx, cfg.difficulty + " keeperIdx");
    const k = b.cells[keeperIdx];
    assert.strictEqual(k.kind, "keeper", cfg.difficulty + " kind");
    assert.strictEqual(k.power, cfg.keeperPower, cfg.difficulty + " power");
    assert.strictEqual(k.revealed, true, cfg.difficulty + " keeper revealed from start");
    assert.strictEqual(k.beaten, false, cfg.difficulty + " keeper not beaten yet");
    assert.strictEqual(G.rowOf(keeperIdx, cfg.cols), 0, cfg.difficulty + " keeper at goal row");
  });
});

test("board has exactly the configured field-defender squad per power", () => {
  [EASY, NORMAL, HARD].forEach((cfg) => {
    const b = G.generateBoard("day:2", cfg);
    const c = countFieldDefenders(b);
    assert.strictEqual(c[1], cfg.defenders.p1, cfg.difficulty + " p1");
    assert.strictEqual(c[2], cfg.defenders.p2, cfg.difficulty + " p2");
    assert.strictEqual(c[3], cfg.defenders.p3, cfg.difficulty + " p3");
    assert.strictEqual(c[4], cfg.defenders.p4, cfg.difficulty + " p4");
    const expected = cfg.defenders.p1 + cfg.defenders.p2 + cfg.defenders.p3 + cfg.defenders.p4;
    assert.strictEqual(c.total, expected, cfg.difficulty + " total field defenders");
  });
});

test("board places the configured number of medkits on safe cells (not start/keeper)", () => {
  [EASY, NORMAL, HARD].forEach((cfg) => {
    const b = G.generateBoard("day:3", cfg);
    assert.strictEqual(countMedkits(b), cfg.medkits, cfg.difficulty + " medkit count");
    b.cells.forEach((cell, i) => {
      if (cell.kind === "medkit") {
        assert.strictEqual(cell.power, 0, cfg.difficulty + " medkit power 0");
        assert.notStrictEqual(i, b.startIdx, cfg.difficulty + " medkit not on start");
        assert.notStrictEqual(i, b.keeperIdx, cfg.difficulty + " medkit not on keeper");
      }
    });
  });
});

test("start cell is always safe (not a defender, not the keeper, not a medkit)", () => {
  [EASY, NORMAL, HARD].forEach((cfg) => {
    for (let d = 1; d <= 20; d++) {
      const b = G.generateBoard("day:" + d, cfg);
      const s = b.cells[b.startIdx];
      assert.strictEqual(s.power, 0, cfg.difficulty + " day " + d + " start power");
      assert.strictEqual(s.kind, "field", cfg.difficulty + " day " + d + " start kind");
    }
  });
});

test("pressure equals SUM of adjacent defender powers INCLUDING the keeper", () => {
  const b = G.generateBoard("day:5", NORMAL);
  const cols = b.cols;
  let sawKeeperContribution = false;
  b.cells.forEach((cell, i) => {
    const isDefender = (cell.kind === "field" || cell.kind === "keeper") && cell.power > 0;
    if (isDefender) return; // pressure only meaningful on safe cells
    let sum = 0;
    G.neighbors(i, b.rows, cols).forEach((nIdx) => {
      const nb = b.cells[nIdx];
      if ((nb.kind === "field" || nb.kind === "keeper") && nb.power > 0) {
        sum += nb.power;
        if (nb.kind === "keeper") sawKeeperContribution = true;
      }
    });
    assert.strictEqual(cell.pressure, sum, "cell " + i + " pressure should be sum incl. keeper");
  });
  assert.ok(sawKeeperContribution, "keeper should contribute to some neighbour's pressure");
});

test("generation is deterministic for the same seed key", () => {
  const a = G.generateBoard("day:7", NORMAL);
  const b = G.generateBoard("day:7", NORMAL);
  assert.deepStrictEqual(
    a.cells.map((c) => c.power + ":" + c.kind),
    b.cells.map((c) => c.power + ":" + c.kind)
  );
  assert.strictEqual(a.keeperIdx, b.keeperIdx);
  assert.strictEqual(a.attempt, b.attempt);
  assert.strictEqual(a.forcedDuel, b.forcedDuel);
});

test("forcedDuel is always true (you must beat the keeper to win)", () => {
  [EASY, NORMAL, HARD].forEach((cfg) => {
    const b = G.generateBoard("day:9", cfg);
    assert.strictEqual(b.forcedDuel, true, cfg.difficulty);
  });
});

// ── opening move ─────────────────────────────────────────────────────────────
test("opening move reveals the start cell, is free, and keeper is already revealed", () => {
  const s = G.createGame("day:5", NORMAL);
  assert.ok(s.board.cells[s.board.startIdx].revealed, "start revealed");
  assert.strictEqual(s.player.stamina, NORMAL.start.stamina, "no stamina spent on opening");
  assert.strictEqual(s.player.maxStamina, NORMAL.maxStaminaStart, "maxStamina from preset");
  assert.strictEqual(s.status, "playing");
  assert.ok(s.board.cells[s.board.keeperIdx].revealed, "keeper revealed from start");
  assert.strictEqual(s.keeperIdx, s.board.keeperIdx);
});

test("createGame defaults to the daily (normal) preset when no cfg passed", () => {
  const s = G.createGame("day:5");
  assert.strictEqual(s.board.cols, 8);
  assert.strictEqual(s.player.maxStamina, NORMAL.maxStaminaStart);
});

test("opening move never strands (board starts hidden)", () => {
  for (let d = 1; d <= 30; d++) {
    const s = G.createGame("day:" + d, NORMAL);
    assert.strictEqual(s.status, "playing", "day " + d + " stranded on opening");
  }
});

// ── dribbling adjacency ──────────────────────────────────────────────────────
test("cannot reveal a non-adjacent cell (dribbling rule)", () => {
  const s = G.createGame("day:5", NORMAL);
  // A corner far from the bottom-centre start should be illegal at first (if still hidden).
  const far = G.index(0, 0, s.board.cols);
  if (!s.board.cells[far].revealed) {
    const ev = G.revealCell(s, far, {});
    assert.ok(ev.some((e) => e.type === "illegal"), "expected illegal move");
    assert.strictEqual(s.board.cells[far].revealed, false);
  }
});

test("the keeper is revealed but NOT passable/frontier until beaten", () => {
  const s = G.createGame("day:5", NORMAL);
  const k = s.board.keeperIdx;
  assert.strictEqual(G.isPassable(s.board.cells[k]), false, "keeper not passable while unbeaten");
  assert.strictEqual(G.isFrontier(s, k), false, "revealed keeper is not a frontier cell");
});

// ── combat / duels ───────────────────────────────────────────────────────────
function firstFrontier(s, pred) {
  for (let i = 0; i < s.board.cells.length; i++) {
    if (G.isFrontier(s, i) && (!pred || pred(i))) return i;
  }
  return -1;
}

// Force a field defender of the given power on a frontier cell next to the ball.
function injectDuel(seed, power, cfg) {
  cfg = cfg || NORMAL;
  const s = G.createGame(seed, cfg);
  const target = firstFrontier(s, (i) => i !== s.board.keeperIdx);
  assert.ok(target >= 0, "no frontier cell found for " + seed);
  s.board.cells[target].power = power;
  s.board.cells[target].kind = "field";
  s.board.cells[target].pressure = 0;
  return { s, target };
}

test("duel within skill is free (cost 0) and still grants XP = power", () => {
  const { s, target } = injectDuel("day:9", 1); // power 1 <= skill 1 => free
  const beforeStamina = s.player.stamina;
  const ev = G.revealCell(s, target, {});
  const duel = ev.find((e) => e.type === "duel");
  assert.strictEqual(duel.success, true);
  assert.strictEqual(duel.cost, 0);
  assert.strictEqual(duel.power, 1);
  assert.strictEqual(s.player.stamina, beforeStamina); // no stamina spent
  assert.strictEqual(s.player.xp, 1);
  assert.ok(s.board.cells[target].beaten);
});

test("duel above skill costs stamina = power - skill and grants +power XP", () => {
  const { s, target } = injectDuel("day:9", 3); // power 3 > skill 1 => cost 2
  const beforeStamina = s.player.stamina;
  const ev = G.revealCell(s, target, {});
  const duel = ev.find((e) => e.type === "duel");
  assert.strictEqual(duel.cost, 3 - NORMAL.start.skill); // 2
  assert.strictEqual(s.player.stamina, beforeStamina - duel.cost);
  assert.strictEqual(s.player.xp, 3);
  assert.ok(!ev.some((e) => e.type === "levelup"), "duels must NOT auto-level");
});

test("unaffordable tackle (cost > stamina) ends the game with a 'tackle' gameover", () => {
  const s = G.createGame("day:9", NORMAL);
  s.player.stamina = 1;
  s.player.skill = 1;
  const target = firstFrontier(s, (i) => i !== s.board.keeperIdx);
  assert.ok(target >= 0, "no frontier cell found");
  s.board.cells[target].power = 4; s.board.cells[target].kind = "field"; // cost = 3 > 1 stamina
  s.board.cells[target].pressure = 0;
  const ev = G.revealCell(s, target, {});
  const duel = ev.find((e) => e.type === "duel");
  assert.strictEqual(duel.success, false);
  const over = ev.find((e) => e.type === "gameover");
  assert.ok(over, "expected a gameover event");
  assert.strictEqual(over.reason, "tackle");
  assert.strictEqual(over.idx, target);
  assert.strictEqual(over.power, 4);
  assert.strictEqual(over.cost, 3);
  assert.strictEqual(over.stamina, 1); // what the player HAD (< cost)
  assert.strictEqual(s.status, "lost");
});

test("beating the keeper WINS (goal event, status 'won')", () => {
  const s = G.createGame("day:5", NORMAL);
  // Make the keeper reachable + affordable, then tackle it directly.
  const k = s.board.keeperIdx;
  s.player.skill = 1; s.player.stamina = 99;
  // Force a passable beaten defender adjacent to the keeper so touchesRegion() is true.
  const nb = G.neighbors(k, s.board.rows, s.board.cols).find((j) => j !== s.board.startIdx);
  s.board.cells[nb].kind = "field"; s.board.cells[nb].power = 1;
  s.board.cells[nb].revealed = true; s.board.cells[nb].beaten = true;
  assert.ok(G.touchesRegion ? G.isActable(s, k) : true, "keeper should be actionable");
  const ev = G.revealCell(s, k, {});
  const duel = ev.find((e) => e.type === "duel");
  assert.ok(duel && duel.success, "keeper duel should succeed");
  assert.strictEqual(duel.power, NORMAL.keeperPower);
  assert.ok(ev.some((e) => e.type === "goal" && e.idx === k), "goal event on keeper beaten");
  assert.strictEqual(s.status, "won");
  assert.ok(s.board.cells[k].beaten);
});

// ── medkit ───────────────────────────────────────────────────────────────────
test("medkit restores stamina (capped at maxStamina) and emits a medkit event", () => {
  const s = G.createGame("day:5", NORMAL);
  // Put a medkit on a frontier safe cell, drop stamina so a restore is visible.
  const target = firstFrontier(s, (i) => i !== s.board.keeperIdx);
  assert.ok(target >= 0);
  s.board.cells[target].kind = "medkit";
  s.board.cells[target].power = 0;
  s.board.cells[target].pressure = 5; // non-zero so it doesn't cascade further
  s.player.stamina = 1; s.player.maxStamina = 10;
  const ev = G.revealCell(s, target, {});
  const med = ev.find((e) => e.type === "medkit");
  assert.ok(med, "expected a medkit event");
  assert.strictEqual(med.restored, NORMAL.medkitRestore); // +3
  assert.strictEqual(s.player.stamina, 4);
  assert.strictEqual(med.stamina, 4);
  assert.ok(s.board.cells[target].revealed);
});

test("medkit restore is capped at maxStamina (no overheal)", () => {
  const s = G.createGame("day:5", NORMAL);
  const target = firstFrontier(s, (i) => i !== s.board.keeperIdx);
  s.board.cells[target].kind = "medkit";
  s.board.cells[target].power = 0;
  s.board.cells[target].pressure = 5;
  s.player.maxStamina = 5; s.player.stamina = 4; // +3 would be 7, capped to 5
  const ev = G.revealCell(s, target, {});
  const med = ev.find((e) => e.type === "medkit");
  assert.strictEqual(s.player.stamina, 5);
  assert.strictEqual(med.restored, 1); // only 1 actually restored
});

test("a medkit revealed by the flood cascade auto-applies its restore", () => {
  // Build a tiny all-safe board with a medkit reachable by a zero-pressure cascade.
  const cols = 3, rows = 3;
  const cells = [];
  for (let i = 0; i < rows * cols; i++) {
    cells.push({ power: 0, kind: "field", pressure: 0, revealed: false, marked: false, beaten: false, lost: false });
  }
  cells[0].kind = "medkit"; // top-left medkit, all pressures 0 -> cascade reaches it
  const startIdx = (rows - 1) * cols + 1;
  const board = { cells, startIdx, keeperIdx: 1, rows, cols };
  const state = {
    cfg: NORMAL, board,
    player: { skill: 1, stamina: 2, maxStamina: 10, xp: 0, level: 0 },
    status: "playing", ballIdx: startIdx, keeperIdx: 1, pendingLevels: 0, events: [],
  };
  const ev = G.revealCell(state, startIdx, { initial: true, force: true });
  assert.ok(ev.some((e) => e.type === "medkit"), "cascade should auto-apply the medkit");
  assert.strictEqual(state.player.stamina, 5); // 2 + 3
});

// ── manual level-up ────────────────────────────────────────────────────────────
test("canLevelUp is false below threshold, true at/above it; levelUp heals + skill+1 + maxStamina+2", () => {
  const s = G.createGame("day:9", NORMAL);
  s.player.xp = NORMAL.xpThresholds[0] - 1; // just below first tier
  assert.strictEqual(G.canLevelUp(s), false, "below threshold");
  assert.deepStrictEqual(G.levelUp(s), [], "levelUp is a no-op below threshold");

  s.player.xp = NORMAL.xpThresholds[0]; // exactly at first tier
  assert.strictEqual(G.canLevelUp(s), true, "at threshold");
  const beforeSkill = s.player.skill, beforeMax = s.player.maxStamina;
  s.player.stamina = 1; // ensure heal is visible
  const ev = G.levelUp(s);
  assert.strictEqual(ev.length, 1);
  assert.strictEqual(ev[0].type, "levelup");
  assert.strictEqual(s.player.level, 1);
  assert.strictEqual(s.player.skill, beforeSkill + 1);          // skill +1
  assert.strictEqual(s.player.maxStamina, beforeMax + 2);        // maxStamina +2
  assert.strictEqual(s.player.stamina, s.player.maxStamina);     // FULL heal
  assert.strictEqual(ev[0].skill, s.player.skill);
  assert.strictEqual(ev[0].maxStamina, s.player.maxStamina);
  assert.strictEqual(ev[0].stamina, s.player.stamina);
});

test("level-up is MANUAL: a duel that crosses a threshold does NOT auto-level", () => {
  const { s, target } = injectDuel("day:9", 4); // +4 xp
  s.player.xp = NORMAL.xpThresholds[0] - 4 + 4; // arrange so beating crosses tier 0... set below:
  s.player.xp = 0;
  // First threshold is 4; a single +4 win crosses it.
  s.player.stamina = 9; s.player.skill = 1;
  const ev = G.revealCell(s, target, {});
  assert.ok(ev.some((e) => e.type === "duel" && e.success));
  assert.ok(!ev.some((e) => e.type === "levelup"), "no auto-level inside the duel");
  assert.strictEqual(s.player.level, 0, "level unchanged by the duel");
  assert.strictEqual(s.player.xp, 4);
  assert.strictEqual(G.canLevelUp(s), true, "but the level-up is now bankable");
  assert.strictEqual(s.pendingLevels, 1, "pendingLevels reflects the bankable level");
});

test("pendingLevels tracks how many bankable level-ups exist", () => {
  const s = G.createGame("day:9", NORMAL);
  s.player.xp = NORMAL.xpThresholds[1]; // crosses tiers 0 and 1
  // recompute via a no-op reveal is not available; pendingLevels is set on duels/levelUp.
  // Use levelUp to bank one and check the residual count.
  assert.strictEqual(G.canLevelUp(s), true);
  G.levelUp(s); // level 1
  assert.strictEqual(s.pendingLevels, 1, "still one more bankable (tier 1 crossed)");
  G.levelUp(s); // level 2
  assert.strictEqual(s.pendingLevels, 0, "no more bankable");
  assert.strictEqual(G.canLevelUp(s), false);
});

// ── stranded loss ───────────────────────────────────────────────────────────
test("isStranded => a non-winning move triggers a 'stranded' gameover", () => {
  // 3x4 grid: open approach (rows 2 & 3) flooded from the start, a wall of power-4 defenders on
  // row 1 the player can never afford (skill 1, 0 stamina => cost 3), keeper at row 0.
  const cols = 3, rows = 4;
  const cells = [];
  for (let i = 0; i < rows * cols; i++) {
    cells.push({ power: 0, kind: "field", pressure: 0, revealed: false, marked: false, beaten: false, lost: false });
  }
  for (let c = 0; c < cols; c++) { cells[1 * cols + c].power = 4; cells[1 * cols + c].kind = "field"; }
  const keeperIdx = 0 * cols + 1;
  cells[keeperIdx].kind = "keeper"; cells[keeperIdx].power = 13; cells[keeperIdx].revealed = true;
  const startIdx = (rows - 1) * cols + 1;
  const board = { cells, startIdx, keeperIdx, rows, cols };
  const state = {
    cfg: NORMAL, board,
    player: { skill: 1, stamina: 0, maxStamina: 6, xp: 0, level: 0 },
    status: "playing", ballIdx: startIdx, keeperIdx, pendingLevels: 0, events: [],
  };
  G.revealCell(state, startIdx, { initial: true, force: true }); // floods rows 2 & 3
  assert.strictEqual(state.status, "playing", "opening reveal must not strand");
  assert.strictEqual(G.isStranded(state), true, "should report stranded (wall unaffordable)");
  // Re-hide a safe approach cell, then reveal it as a non-winning move to trip the check.
  cells[2 * cols + 0].revealed = false;
  const ev = G.revealCell(state, 2 * cols + 0, {});
  const over = ev.find((e) => e.type === "gameover");
  assert.ok(over, "expected a gameover after the stranded move");
  assert.strictEqual(over.reason, "stranded");
  assert.strictEqual(over.stamina, 0);
  assert.strictEqual(state.status, "lost");
});

test("not stranded when an affordable defender borders the region", () => {
  const cols = 3, rows = 4;
  const cells = [];
  for (let i = 0; i < rows * cols; i++) {
    cells.push({ power: 0, kind: "field", pressure: 0, revealed: false, marked: false, beaten: false, lost: false });
  }
  for (let c = 0; c < cols; c++) { cells[1 * cols + c].power = 2; cells[1 * cols + c].kind = "field"; }
  const keeperIdx = 1;
  cells[keeperIdx].kind = "keeper"; cells[keeperIdx].power = 13; cells[keeperIdx].revealed = true;
  const startIdx = (rows - 1) * cols + 1;
  const board = { cells, startIdx, keeperIdx, rows, cols };
  const state = {
    cfg: NORMAL, board,
    player: { skill: 1, stamina: 2, maxStamina: 6, xp: 0, level: 0 },
    status: "playing", ballIdx: startIdx, keeperIdx, pendingLevels: 0, events: [],
  };
  G.revealCell(state, startIdx, { initial: true, force: true });
  assert.strictEqual(G.isStranded(state), false, "a power-2 wall is affordable at skill 1, stamina 2");
});

// ── scouting ───────────────────────────────────────────────────────────────
test("scout returns remaining counts per power + keeper info + skillNeededForKeeper", () => {
  const s = G.createGame("day:2", NORMAL);
  const sc = G.scout(s);
  // Initially no field defenders beaten -> counts match the preset squad.
  assert.strictEqual(sc.remaining[1], NORMAL.defenders.p1);
  assert.strictEqual(sc.remaining[2], NORMAL.defenders.p2);
  assert.strictEqual(sc.remaining[3], NORMAL.defenders.p3);
  assert.strictEqual(sc.remaining[4], NORMAL.defenders.p4);
  assert.strictEqual(sc.keeperPower, NORMAL.keeperPower);
  assert.strictEqual(sc.keeperBeaten, false);
  // smallest skill s.t. keeperPower - skill <= maxStamina  => keeperPower - maxStamina.
  assert.strictEqual(sc.skillNeededForKeeper, Math.max(0, NORMAL.keeperPower - s.player.maxStamina));
});

test("scout decrements a power count when that defender is beaten, is a pure read", () => {
  const { s, target } = injectDuel("day:9", 2);
  const before = G.scout(s).remaining[2];
  const snapshotXp = s.player.xp;
  G.revealCell(s, target, {}); // beat the injected power-2 defender
  const after = G.scout(s).remaining[2];
  assert.strictEqual(after, before - 1, "beaten power-2 defender removed from remaining");
  // scout must not mutate state.
  const a = G.scout(s), b = G.scout(s);
  assert.deepStrictEqual(a, b);
  assert.strictEqual(s.player.xp, snapshotXp + 2); // only the duel changed xp, not scout()
});

test("skillNeededForKeeper falls as maxStamina grows (level-ups make the keeper reachable)", () => {
  const s = G.createGame("day:2", HARD);
  const need0 = G.scout(s).skillNeededForKeeper; // keeper 17, maxStamina 5 => 12
  assert.strictEqual(need0, Math.max(0, HARD.keeperPower - HARD.maxStaminaStart));
  s.player.maxStamina += 4; // simulate two level-ups (+2 each)
  const need1 = G.scout(s).skillNeededForKeeper;
  assert.ok(need1 < need0, "more maxStamina => lower skill needed for the keeper");
});

// ── marking ──────────────────────────────────────────────────────────────────
test("marking toggles and a marked cell is blocked from reveal", () => {
  const s = G.createGame("day:5", NORMAL);
  let target = -1;
  for (let i = 0; i < s.board.cells.length; i++) {
    const c = s.board.cells[i];
    if (!c.revealed && c.kind === "field" && c.power === 0) { target = i; break; }
  }
  assert.ok(target >= 0, "no hidden safe cell found");
  G.toggleMark(s, target);
  assert.ok(s.board.cells[target].marked);
  const ev = G.revealCell(s, target, {});
  assert.ok(ev.some((e) => e.type === "blocked"));
  assert.strictEqual(s.board.cells[target].revealed, false);
});

// ── winnability ───────────────────────────────────────────────────────────────
test("every preset generates winnable boards across several seeds (and fast)", () => {
  const t0 = Date.now();
  [EASY, NORMAL, HARD].forEach((cfg) => {
    for (let d = 1; d <= 25; d++) {
      const b = G.generateBoard("day:" + d, cfg);
      assert.ok(G.isWinnable(b, cfg), cfg.difficulty + " day " + d + " not winnable");
    }
  });
  const ms = Date.now() - t0;
  assert.ok(ms < 3000, "generation/winnability across 75 boards too slow: " + ms + "ms");
});

test("isWinnable: crafted clearly-winnable board (keeper reachable + affordable)", () => {
  // 3x3, open, keeper power 1 at the centre-top -> trivially beatable.
  const cols = 3, rows = 3;
  const cells = [];
  for (let i = 0; i < rows * cols; i++) {
    cells.push({ power: 0, kind: "field", pressure: 0, revealed: false, marked: false, beaten: false, lost: false });
  }
  const keeperIdx = 1;
  cells[keeperIdx].kind = "keeper"; cells[keeperIdx].power = 1; cells[keeperIdx].revealed = true;
  const startIdx = (rows - 1) * cols + 1;
  const board = { cells, startIdx, keeperIdx, rows, cols };
  const cfg = Object.assign({}, NORMAL, { keeperPower: 1 });
  assert.strictEqual(G.isWinnable(board, cfg), true);
});

test("isWinnable: hopeless board (keeper walled off, 0 stamina, no XP) returns false", () => {
  // Keeper at row 0; a solid wall of power-4 defenders on row 1; start with 0 stamina + no leveling.
  const cols = 3, rows = 4;
  const cells = [];
  for (let i = 0; i < rows * cols; i++) {
    cells.push({ power: 0, kind: "field", pressure: 0, revealed: false, marked: false, beaten: false, lost: false });
  }
  for (let c = 0; c < cols; c++) { cells[1 * cols + c].power = 4; cells[1 * cols + c].kind = "field"; }
  const keeperIdx = 1;
  cells[keeperIdx].kind = "keeper"; cells[keeperIdx].power = 13; cells[keeperIdx].revealed = true;
  const startIdx = (rows - 1) * cols + 1;
  const board = { cells, startIdx, keeperIdx, rows, cols };
  const cfg = Object.assign({}, NORMAL, {
    start: { skill: 1, stamina: 0 }, maxStaminaStart: 0,
    xpThresholds: [999, 999, 999], keeperPower: 13,
  });
  assert.strictEqual(G.isWinnable(board, cfg), false);
});

test("isWinnable: a board with no keeper is never winnable", () => {
  const cols = 3, rows = 3;
  const cells = [];
  for (let i = 0; i < rows * cols; i++) {
    cells.push({ power: 0, kind: "field", pressure: 0, revealed: false, marked: false, beaten: false, lost: false });
  }
  const startIdx = (rows - 1) * cols + 1;
  const board = { cells, startIdx, keeperIdx: -1, rows, cols };
  assert.strictEqual(G.isWinnable(board, NORMAL), false);
});

// ── isWinnable soundness cross-check (independent engine playthrough) ──────────
// Drive the REAL engine (createGame/revealCell/levelUp) with a greedy/DFS solver and confirm
// that boards isWinnable accepts are actually beatable to the keeper. The solver:
//   - reveals all safe/medkit frontier cells first (free progress + restores),
//   - levels up whenever it can AND stamina is low or it cannot otherwise progress,
//   - branches over affordable frontier defenders (cheapest first), incl. the actionable keeper.
function clone(s) {
  return {
    cfg: s.cfg,
    board: {
      cells: s.board.cells.map((c) => ({ ...c })),
      startIdx: s.board.startIdx, keeperIdx: s.board.keeperIdx,
      rows: s.board.rows, cols: s.board.cols,
    },
    player: { ...s.player },
    status: s.status, ballIdx: s.ballIdx, keeperIdx: s.keeperIdx, pendingLevels: s.pendingLevels,
    events: [],
  };
}

function enginePlayable(seedKey, cfg) {
  const root = G.createGame(seedKey, cfg);
  let nodes = 0;
  const CAP = 300000;
  function takeFreeProgress(state) {
    let progressed = true;
    while (progressed && state.status === "playing") {
      progressed = false;
      for (let i = 0; i < state.board.cells.length; i++) {
        const c = state.board.cells[i];
        if (G.isFrontier(state, i) && (c.kind === "field" || c.kind === "medkit") && c.power === 0) {
          G.revealCell(state, i, {});
          progressed = true;
          if (state.status !== "playing") return;
        }
      }
    }
  }
  function solve(state) {
    if (++nodes > CAP) return false;
    if (state.status === "won") return true;
    if (state.status === "lost") return false;
    takeFreeProgress(state);
    if (state.status === "won") return true;
    if (state.status !== "playing") return false;

    // Gather actionable defenders/keeper (frontier defenders + the actionable keeper).
    const acts = [];
    for (let i = 0; i < state.board.cells.length; i++) {
      const c = state.board.cells[i];
      if (!G.isActable(state, i)) continue;
      if (c.kind === "field" || c.kind === "keeper") {
        if (c.power > 0 && !c.beaten) acts.push(i);
      }
    }
    // Branch A: take any available level-up (full heal) — try it as a distinct option.
    if (G.canLevelUp(state)) {
      const branch = clone(state);
      G.levelUp(branch);
      if (solve(branch)) return true;
    }
    // Branch B: beat each affordable actionable defender/keeper, cheapest power first.
    acts.sort((a, b) => state.board.cells[a].power - state.board.cells[b].power);
    for (const i of acts) {
      const c = state.board.cells[i];
      const cost = Math.max(0, c.power - state.player.skill);
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
    for (let d = 1; d <= 10; d++) {
      const seed = "day:" + d;
      const b = G.generateBoard(seed, cfg);
      if (!G.isWinnable(b, cfg)) continue; // only cross-check accepted boards
      assert.ok(enginePlayable(seed, cfg),
        cfg.difficulty + " " + seed + ": isWinnable=true but engine could not beat it");
    }
  });
});

console.log("\n" + passed + " checks passed.");
