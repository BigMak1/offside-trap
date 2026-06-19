// Plain Node test runner (no framework) for the pure game logic (Deduction redesign).
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

// Count field defenders (mines) on a board; keeper excluded.
function countFieldDefenders(board) {
  return board.cells.filter((c) => c.kind === "field" && c.power > 0).length;
}
// Count artifacts by kind currently placed on the board.
function countArtifacts(board) {
  const c = { save: 0, scout: 0, total: 0 };
  board.cells.forEach((cell) => {
    if (cell.artifact === "save") { c.save++; c.total++; }
    else if (cell.artifact === "scout") { c.scout++; c.total++; }
  });
  return c;
}

// BFS through the SAFE region (power-0 cells) from start; returns true if it reaches a cell
// adjacent to the keeper (independent re-implementation of the generation invariant).
function keeperReachable(board) {
  const seen = new Uint8Array(board.cells.length);
  const stack = [board.startIdx];
  seen[board.startIdx] = 1;
  while (stack.length) {
    const i = stack.pop();
    for (const j of G.neighbors(i, board.rows, board.cols)) {
      if (j === board.keeperIdx) return true;
      const nb = board.cells[j];
      const isDefender = (nb.kind === "field" || nb.kind === "keeper") && nb.power > 0;
      if (!seen[j] && !isDefender) { seen[j] = 1; stack.push(j); }
    }
  }
  return false;
}

// ── config / presets ──────────────────────────────────────────────────────────
test("resolve flattens a preset into the keys game logic reads", () => {
  const cfg = CONFIG.resolve("normal");
  assert.strictEqual(cfg.difficulty, "normal");
  assert.strictEqual(cfg.cols, 10);
  assert.strictEqual(cfg.rows, 15);
  assert.strictEqual(cfg.goalRow, 0);
  assert.strictEqual(cfg.startRow, 14);          // rows - 1
  assert.strictEqual(cfg.startCol, 5);           // floor(cols / 2)
  assert.strictEqual(cfg.keeperCol, 5);          // floor(cols / 2)
  assert.strictEqual(cfg.tile, 32);
  assert.strictEqual(cfg.maxGenAttempts, 200);
  assert.strictEqual(cfg.startSaves, 2);
  assert.ok(cfg.powerWeights && cfg.artifacts);
  assert.strictEqual(typeof cfg.density, "number");
  assert.strictEqual(typeof cfg.pathWiggle, "number");
});

test("presets expose the Deduction balance numbers", () => {
  // Easy.
  assert.strictEqual(EASY.cols, 10);
  assert.strictEqual(EASY.rows, 15);
  assert.strictEqual(EASY.density, 0.30);
  assert.deepStrictEqual(EASY.powerWeights, { 1: 5, 2: 3, 3: 1, 4: 0 });
  assert.strictEqual(EASY.startSaves, 3);
  assert.deepStrictEqual(EASY.artifacts, { save: 3, scout: 3 });
  assert.strictEqual(EASY.pathWiggle, 0.35);
  // Normal.
  assert.strictEqual(NORMAL.density, 0.42);
  assert.deepStrictEqual(NORMAL.powerWeights, { 1: 4, 2: 3, 3: 2, 4: 1 });
  assert.strictEqual(NORMAL.startSaves, 2);
  assert.deepStrictEqual(NORMAL.artifacts, { save: 2, scout: 2 });
  assert.strictEqual(NORMAL.pathWiggle, 0.5);
  // Hard.
  assert.strictEqual(HARD.density, 0.55);
  assert.deepStrictEqual(HARD.powerWeights, { 1: 2, 2: 3, 3: 3, 4: 2 });
  assert.strictEqual(HARD.startSaves, 1);
  assert.deepStrictEqual(HARD.artifacts, { save: 1, scout: 2 });
  assert.strictEqual(HARD.pathWiggle, 0.6);
  // All presets share the 10x15 pitch and carry a label.
  [EASY, NORMAL, HARD].forEach((cfg) => {
    assert.strictEqual(cfg.cols, 10);
    assert.strictEqual(cfg.rows, 15);
    assert.strictEqual(typeof cfg.label, "string");
  });
});

test("resolve falls back to normal for unknown / missing keys", () => {
  const a = CONFIG.resolve("does-not-exist");
  assert.strictEqual(a.difficulty, "normal");
  assert.strictEqual(a.cols, 10);
  const b = CONFIG.resolve();
  assert.strictEqual(b.difficulty, "normal");
  assert.strictEqual(b.cols, 10);
});

// ── generation ──────────────────────────────────────────────────────────────
test("keeper is placed at the goal (row 0, keeperCol), revealed, power 1", () => {
  [EASY, NORMAL, HARD].forEach((cfg) => {
    const b = G.generateBoard("day:1", cfg);
    const keeperIdx = G.index(cfg.goalRow, cfg.keeperCol, cfg.cols);
    assert.strictEqual(b.keeperIdx, keeperIdx, cfg.difficulty + " keeperIdx");
    const k = b.cells[keeperIdx];
    assert.strictEqual(k.kind, "keeper", cfg.difficulty + " kind");
    assert.strictEqual(k.power, 1, cfg.difficulty + " keeper power 1 (HP 1)");
    assert.strictEqual(k.revealed, true, cfg.difficulty + " keeper revealed from start");
    assert.strictEqual(k.beaten, false, cfg.difficulty + " keeper not beaten yet");
    assert.strictEqual(G.rowOf(keeperIdx, cfg.cols), 0, cfg.difficulty + " keeper at goal row");
  });
});

test("start cell is always safe (power 0, kind field, no artifact)", () => {
  [EASY, NORMAL, HARD].forEach((cfg) => {
    for (let d = 1; d <= 20; d++) {
      const b = G.generateBoard("day:" + d, cfg);
      const s = b.cells[b.startIdx];
      assert.strictEqual(s.power, 0, cfg.difficulty + " day " + d + " start power");
      assert.strictEqual(s.kind, "field", cfg.difficulty + " day " + d + " start kind");
      assert.strictEqual(s.artifact, null, cfg.difficulty + " day " + d + " start no artifact");
    }
  });
});

test("every preset generates a board whose safe region reaches the keeper (many seeds)", () => {
  [EASY, NORMAL, HARD].forEach((cfg) => {
    for (let d = 1; d <= 40; d++) {
      const b = G.generateBoard("day:" + d, cfg);
      assert.ok(keeperReachable(b), cfg.difficulty + " day " + d + " keeper NOT reachable");
    }
  });
});

test("board scatters defenders (mines) on off-path cells", () => {
  [EASY, NORMAL, HARD].forEach((cfg) => {
    let totalDefs = 0;
    for (let d = 1; d <= 5; d++) totalDefs += countFieldDefenders(G.generateBoard("day:" + d, cfg));
    assert.ok(totalDefs > 0, cfg.difficulty + " should place at least some defenders");
  });
});

test("defender powers respect the preset weights (no power with weight 0 appears)", () => {
  // Easy has powerWeights[4] === 0, so no power-4 defender should ever be placed.
  for (let d = 1; d <= 30; d++) {
    const b = G.generateBoard("day:" + d, EASY);
    b.cells.forEach((c) => {
      if (c.kind === "field" && c.power > 0) {
        assert.ok(c.power >= 1 && c.power <= 3, "easy defender power in 1..3, got " + c.power);
      }
    });
  }
});

test("artifacts are placed on safe path cells (power 0), not on start/keeper", () => {
  [EASY, NORMAL, HARD].forEach((cfg) => {
    const want = cfg.artifacts.save + cfg.artifacts.scout;
    for (let d = 1; d <= 10; d++) {
      const b = G.generateBoard("day:" + d, cfg);
      const c = countArtifacts(b);
      assert.strictEqual(c.total, want, cfg.difficulty + " day " + d + " artifact total");
      assert.strictEqual(c.save, cfg.artifacts.save, cfg.difficulty + " day " + d + " save count");
      assert.strictEqual(c.scout, cfg.artifacts.scout, cfg.difficulty + " day " + d + " scout count");
      b.cells.forEach((cell, i) => {
        if (cell.artifact) {
          assert.strictEqual(cell.power, 0, cfg.difficulty + " artifact cell is safe");
          assert.notStrictEqual(i, b.startIdx, cfg.difficulty + " artifact not on start");
          assert.notStrictEqual(i, b.keeperIdx, cfg.difficulty + " artifact not on keeper");
        }
      });
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
    a.cells.map((c) => c.power + ":" + c.kind + ":" + c.artifact),
    b.cells.map((c) => c.power + ":" + c.kind + ":" + c.artifact)
  );
  assert.strictEqual(a.keeperIdx, b.keeperIdx);
  assert.strictEqual(a.attempt, b.attempt);
});

// ── opening move / state shape ────────────────────────────────────────────────
test("createGame returns the documented state shape; opening reveal is free + cascades", () => {
  const s = G.createGame("day:5", NORMAL);
  assert.strictEqual(s.status, "playing");
  assert.strictEqual(s.ballIdx, s.board.startIdx);
  assert.strictEqual(s.keeperIdx, s.board.keeperIdx);
  assert.strictEqual(s.saves, NORMAL.startSaves);
  assert.strictEqual(s.artifactsCollected, 0);
  assert.ok(Array.isArray(s.events));
  assert.ok(Array.isArray(s.initialEvents));
  assert.ok(s.board.cells[s.board.startIdx].revealed, "start revealed by opening move");
  assert.ok(s.board.cells[s.board.keeperIdx].revealed, "keeper revealed from start");
  // The start cell sits on the safe path next to grass, so the opening reveal cascades.
  assert.ok(s.initialEvents.some((e) => e.type === "reveal"), "opening emits reveal events");
});

test("createGame defaults to the daily (normal) preset when no cfg passed", () => {
  const s = G.createGame("day:5");
  assert.strictEqual(s.board.cols, 10);
  assert.strictEqual(s.board.rows, 15);
  assert.strictEqual(s.saves, NORMAL.startSaves);
});

test("the keeper is revealed but NOT passable/frontier until beaten", () => {
  const s = G.createGame("day:5", NORMAL);
  const k = s.board.keeperIdx;
  assert.strictEqual(G.isPassable(s.board.cells[k]), false, "keeper not passable while unbeaten");
  assert.strictEqual(G.isFrontier(s, k), false, "revealed keeper is not a frontier cell");
});

// ── adjacency / dribbling ─────────────────────────────────────────────────────
test("cannot reveal a non-adjacent cell (dribbling rule)", () => {
  const s = G.createGame("day:5", NORMAL);
  const far = G.index(0, 0, s.board.cols); // a far corner
  if (!s.board.cells[far].revealed) {
    const ev = G.revealCell(s, far, {});
    assert.ok(ev.some((e) => e.type === "illegal"), "expected illegal move");
    assert.strictEqual(s.board.cells[far].revealed, false);
  }
});

// ── helpers for injecting cells on a real board ────────────────────────────────
function firstFrontier(s, pred) {
  for (let i = 0; i < s.board.cells.length; i++) {
    if (G.isFrontier(s, i) && (!pred || pred(i))) return i;
  }
  return -1;
}

// Force a field defender of the given power on a frontier cell next to the ball.
function injectDefender(seed, power, cfg) {
  cfg = cfg || NORMAL;
  const s = G.createGame(seed, cfg);
  const target = firstFrontier(s, (i) => i !== s.board.keeperIdx);
  assert.ok(target >= 0, "no frontier cell found for " + seed);
  s.board.cells[target].power = power;
  s.board.cells[target].kind = "field";
  s.board.cells[target].pressure = 0;
  s.board.cells[target].artifact = null;
  return { s, target };
}

// ── defenders (mines) ──────────────────────────────────────────────────────────
test("revealing a defender with saves==0 loses with a 'caught' gameover", () => {
  const { s, target } = injectDefender("day:9", 3);
  s.saves = 0;
  const ev = G.revealCell(s, target, {});
  const duel = ev.find((e) => e.type === "duel");
  assert.ok(duel, "expected a duel event");
  assert.strictEqual(duel.success, false);
  assert.strictEqual(duel.power, 3);
  const over = ev.find((e) => e.type === "gameover");
  assert.ok(over, "expected a gameover event");
  assert.strictEqual(over.reason, "caught");
  assert.strictEqual(over.idx, target);
  assert.strictEqual(over.power, 3);
  assert.strictEqual(s.status, "lost");
  assert.ok(s.board.cells[target].lost, "defender cell marked lost");
});

test("revealing a defender with saves>0 consumes a save, marks beaten, does NOT lose", () => {
  const { s, target } = injectDefender("day:9", 4);
  s.saves = 2;
  const ev = G.revealCell(s, target, {});
  const save = ev.find((e) => e.type === "save");
  assert.ok(save, "expected a save event");
  assert.strictEqual(save.power, 4);
  assert.strictEqual(save.idx, target);
  assert.strictEqual(s.saves, 1, "one save consumed");
  assert.strictEqual(s.status, "playing", "run continues after a save");
  assert.ok(s.board.cells[target].beaten, "defender marked beaten");
  assert.ok(s.board.cells[target].revealed, "defender revealed");
  assert.ok(!s.board.cells[target].lost, "not a loss");
  assert.ok(!ev.some((e) => e.type === "gameover"), "no gameover when a save absorbs the hit");
});

// ── safe cascade ───────────────────────────────────────────────────────────────
test("revealing a safe 0-pressure cell cascades (reveals multiple cells)", () => {
  // 4x4 all-safe board (no defenders) -> any reveal floods the whole grid.
  const cols = 4, rows = 4;
  const cells = [];
  for (let i = 0; i < rows * cols; i++) cells.push(mkCell());
  const startIdx = (rows - 1) * cols + 1;
  const keeperIdx = 1;
  cells[keeperIdx].kind = "keeper"; cells[keeperIdx].power = 1; cells[keeperIdx].revealed = true;
  const board = { cells, startIdx, keeperIdx, rows, cols };
  const state = mkState(board);
  const ev = G.revealCell(state, startIdx, { initial: true, force: true });
  const revealCount = ev.filter((e) => e.type === "reveal").length;
  assert.ok(revealCount > 1, "0-pressure reveal should cascade to several cells, got " + revealCount);
});

// ── artifacts ──────────────────────────────────────────────────────────────────
function mkCell() {
  return { power: 0, kind: "field", pressure: 0, revealed: false, marked: false, beaten: false, lost: false, artifact: null };
}
function mkState(board, overrides) {
  return Object.assign({
    cfg: NORMAL, board, status: "playing",
    ballIdx: board.startIdx, keeperIdx: board.keeperIdx,
    saves: 0, artifactsCollected: 0, events: [],
  }, overrides || {});
}

test("collecting a 'save' artifact increments saves and emits {type:'artifact',kind:'save'}", () => {
  // Tiny board: a frontier safe cell carrying a 'save' artifact, non-zero pressure so it doesn't
  // cascade away the surroundings.
  const cols = 3, rows = 3;
  const cells = [];
  for (let i = 0; i < rows * cols; i++) cells.push(mkCell());
  const keeperIdx = 1;
  cells[keeperIdx].kind = "keeper"; cells[keeperIdx].power = 1; cells[keeperIdx].revealed = true;
  const startIdx = (rows - 1) * cols + 1;
  cells[startIdx].revealed = true; // pretend the opening already revealed the start
  const target = (rows - 1) * cols + 0; // bottom-left, adjacent to start
  cells[target].artifact = "save";
  cells[target].pressure = 1; // non-zero -> no cascade
  const board = { cells, startIdx, keeperIdx, rows, cols };
  const state = mkState(board, { saves: 1 });
  const ev = G.revealCell(state, target, {});
  const art = ev.find((e) => e.type === "artifact");
  assert.ok(art, "expected an artifact event");
  assert.strictEqual(art.kind, "save");
  assert.strictEqual(art.saves, 2);
  assert.strictEqual(state.saves, 2, "save artifact increments saves");
  assert.strictEqual(state.artifactsCollected, 1);
  assert.strictEqual(state.board.cells[target].artifact, null, "artifact consumed");
});

test("collecting a 'scout' artifact emits {kind:'scout'} and reveals an extra safe cell", () => {
  // Layout (3 cols x 3 rows), start bottom-centre:
  //   row0:  .  K  .
  //   row1:  H  .  .     (H = hidden safe frontier cell to be scouted)
  //   row2:  .  S  .     (S = start, A = scout artifact at bottom-left)
  // Put the scout artifact on a frontier cell next to the start; the scout hint then reveals the
  // remaining hidden frontier safe cell. Use pressures so nothing cascades on its own.
  const cols = 3, rows = 3;
  const cells = [];
  for (let i = 0; i < rows * cols; i++) cells.push(mkCell());
  const keeperIdx = 1;
  cells[keeperIdx].kind = "keeper"; cells[keeperIdx].power = 1; cells[keeperIdx].revealed = true;
  const startIdx = 2 * cols + 1; // bottom-centre
  cells[startIdx].revealed = true;
  cells[startIdx].pressure = 1;
  // Give every still-hidden cell a non-zero pressure so reveals never cascade.
  for (let i = 0; i < cells.length; i++) if (!cells[i].revealed && cells[i].kind !== "keeper") cells[i].pressure = 1;
  const artIdx = 2 * cols + 0; // bottom-left, frontier of start
  cells[artIdx].artifact = "scout";
  const board = { cells, startIdx, keeperIdx, rows, cols };
  const state = mkState(board);

  const hiddenSafeBefore = cells.filter((c) => !c.revealed && c.kind === "field").length;
  const ev = G.revealCell(state, artIdx, {});
  const art = ev.find((e) => e.type === "artifact" && e.kind === "scout");
  assert.ok(art, "expected a scout artifact event");
  assert.strictEqual(state.artifactsCollected, 1);
  // The artifact cell itself reveals + the scout hint reveals one more safe cell => 2 reveals.
  const revealCount = ev.filter((e) => e.type === "reveal").length;
  assert.ok(revealCount >= 2, "scout should reveal the artifact cell plus a free hint, got " + revealCount);
  const hiddenSafeAfter = cells.filter((c) => !c.revealed && c.kind === "field").length;
  assert.ok(hiddenSafeAfter < hiddenSafeBefore - 1, "scout revealed at least one EXTRA safe cell");
});

test("scout artifact with no hidden safe frontier left simply does nothing extra", () => {
  // Single safe cell besides start/keeper, carrying a scout; nothing else to reveal.
  const cols = 3, rows = 2;
  const cells = [];
  for (let i = 0; i < rows * cols; i++) cells.push(mkCell());
  const keeperIdx = 1;
  cells[keeperIdx].kind = "keeper"; cells[keeperIdx].power = 1; cells[keeperIdx].revealed = true;
  // Make the two top corners defenders so there is no other hidden SAFE frontier cell.
  cells[0].kind = "field"; cells[0].power = 1;
  cells[2].kind = "field"; cells[2].power = 1;
  const startIdx = 1 * cols + 1; // bottom-centre
  cells[startIdx].revealed = true; cells[startIdx].pressure = 1;
  const artIdx = 1 * cols + 0; // bottom-left frontier safe cell w/ scout
  cells[artIdx].artifact = "scout"; cells[artIdx].pressure = 2;
  // bottom-right also a defender so it is not a safe frontier hint candidate
  cells[1 * cols + 2].kind = "field"; cells[1 * cols + 2].power = 1;
  const board = { cells, startIdx, keeperIdx, rows, cols };
  const state = mkState(board);
  const ev = G.revealCell(state, artIdx, {});
  assert.ok(ev.some((e) => e.type === "artifact" && e.kind === "scout"), "scout event still emitted");
  // Only the artifact cell itself is revealed (no safe frontier hint available).
  assert.strictEqual(ev.filter((e) => e.type === "reveal").length, 1);
});

// ── winning ──────────────────────────────────────────────────────────────────
test("reaching+revealing the keeper sets status 'won' and emits 'goal'", () => {
  const s = G.createGame("day:5", NORMAL);
  const k = s.board.keeperIdx;
  // Force a passable beaten defender adjacent to the keeper so it borders the region.
  const nb = G.neighbors(k, s.board.rows, s.board.cols).find((j) => j !== s.board.startIdx);
  s.board.cells[nb].kind = "field"; s.board.cells[nb].power = 1;
  s.board.cells[nb].revealed = true; s.board.cells[nb].beaten = true;
  assert.ok(G.isActable(s, k), "keeper should be actionable once it borders the region");
  const ev = G.revealCell(s, k, {});
  assert.ok(ev.some((e) => e.type === "goal" && e.idx === k), "goal event on keeper reached");
  assert.strictEqual(s.status, "won");
  assert.ok(s.board.cells[k].beaten);
  assert.ok(!ev.some((e) => e.type === "duel"), "beating the trivial keeper is not a duel");
});

test("an end-to-end safe-path walk reaches and beats the keeper (real board)", () => {
  // Greedily reveal safe frontier cells; absorb any forced defender hit with the available saves;
  // when the keeper is actionable, beat it. The guaranteed safe path makes this terminate in a win
  // on a real generated board with enough saves to spare.
  const s = G.createGame("day:3", EASY);
  let guard = 0;
  while (s.status === "playing" && guard++ < 5000) {
    if (G.isActable(s, s.board.keeperIdx)) { G.revealCell(s, s.board.keeperIdx, {}); break; }
    // Reveal a safe frontier cell if one exists.
    let acted = false;
    for (let i = 0; i < s.board.cells.length; i++) {
      const c = s.board.cells[i];
      if (i === s.board.keeperIdx) continue;
      if (G.isFrontier(s, i) && c.power === 0) { G.revealCell(s, i, {}); acted = true; break; }
    }
    if (acted) continue;
    // No safe frontier: spend a save on the lowest-power frontier defender to open the region.
    let best = -1, bestPow = Infinity;
    for (let i = 0; i < s.board.cells.length; i++) {
      const c = s.board.cells[i];
      if (i === s.board.keeperIdx) continue;
      if (G.isFrontier(s, i) && c.power > 0 && c.power < bestPow) { bestPow = c.power; best = i; }
    }
    if (best < 0) break;
    s.saves = Math.max(s.saves, 1); // ensure the absorb succeeds for this connectivity probe
    G.revealCell(s, best, {});
  }
  assert.strictEqual(s.status, "won", "the guaranteed safe path should lead to a win");
});

// ── marking ──────────────────────────────────────────────────────────────────
test("marking toggles and a marked cell is blocked from reveal", () => {
  const s = G.createGame("day:5", NORMAL);
  const target = firstFrontier(s, (i) => i !== s.board.keeperIdx);
  assert.ok(target >= 0, "no hidden frontier cell found");
  let ev = G.toggleMark(s, target);
  assert.strictEqual(ev[0].type, "mark");
  assert.strictEqual(ev[0].marked, true);
  assert.ok(s.board.cells[target].marked);
  ev = G.revealCell(s, target, {});
  assert.ok(ev.some((e) => e.type === "blocked" && e.reason === "marked"), "marked cell blocked");
  assert.strictEqual(s.board.cells[target].revealed, false);
  // Toggling again clears the mark.
  ev = G.toggleMark(s, target);
  assert.strictEqual(ev[0].marked, false);
  assert.ok(!s.board.cells[target].marked);
});

test("cannot mark an already-revealed cell", () => {
  const s = G.createGame("day:5", NORMAL);
  const start = s.board.startIdx;
  const ev = G.toggleMark(s, start);
  assert.ok(ev.some((e) => e.type === "blocked" && e.reason === "revealed"));
});

// ── scout HUD read ─────────────────────────────────────────────────────────────
test("scout returns the HUD shape: saves, defenders totals, keeperBeaten, artifactsLeft", () => {
  const s = G.createGame("day:2", NORMAL);
  const sc = G.scout(s);
  assert.strictEqual(sc.saves, NORMAL.startSaves);
  assert.strictEqual(typeof sc.defendersTotal, "number");
  assert.strictEqual(typeof sc.defendersRemaining, "number");
  assert.strictEqual(sc.keeperBeaten, false);
  // All defenders start hidden -> remaining equals total.
  assert.strictEqual(sc.defendersRemaining, sc.defendersTotal);
  // Artifacts left equals the configured count at the start.
  assert.strictEqual(sc.artifactsLeft, NORMAL.artifacts.save + NORMAL.artifacts.scout);
});

test("scout is a pure read and reflects collected artifacts / beaten defenders", () => {
  const { s, target } = injectDefender("day:9", 2);
  s.saves = 1;
  const before = G.scout(s);
  G.revealCell(s, target, {}); // absorb -> defender beaten
  const after = G.scout(s);
  assert.strictEqual(after.defendersRemaining, before.defendersRemaining - 1, "beaten defender removed from remaining");
  // scout must not mutate state.
  const a = G.scout(s), b = G.scout(s);
  assert.deepStrictEqual(a, b);
});

console.log("\n" + passed + " checks passed.");
