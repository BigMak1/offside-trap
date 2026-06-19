// Offside Trap — pure game logic (no rendering, no DOM). Deduction redesign.
// Every mutating action returns an ordered list of events the renderer can animate.
//
// Model
//   Cells: { power:0, kind:'field', pressure:0, revealed, marked, beaten, lost, artifact:null }
//     - power 0 = safe grass; kind in 'field' | 'keeper'. A 'field' cell with power 0 is SAFE.
//     - The KEEPER sits at (goalRow=0, keeperCol), kind 'keeper', power 1, and is revealed FROM
//       THE START — it is the GOAL. Reaching/acting on it once it borders the safe region WINS.
//     - Field DEFENDERS carry power 1..4 (kind 'field') — they are MINES.
//     - cell.artifact is null | 'save' | 'scout'; artifact cells are SAFE (power 0).
//   A safe cell's NUMBER (pressure) = SUM of adjacent (8-dir) defender powers, INCLUDING the keeper.
//   Navigate by the numbers, avoiding defenders, to reach and beat the (trivial, HP-1) keeper.
//
//   SAVES absorb a defender hit: revealing a defender with saves > 0 consumes one and the run
//   continues; with no saves, revealing a defender is a loss. There is a guaranteed connected SAFE
//   path from the kickoff up to a cell adjacent to the keeper, so every board is solvable.
//   ARTIFACTS on the path: 'save' (+1 save), 'scout' (free reveal of one hidden safe frontier cell).
(function (global) {
  "use strict";

  var CONFIG = (typeof require !== "undefined" && typeof module !== "undefined")
    ? require("./config.js") : global.OT_CONFIG;
  var RNG = (typeof require !== "undefined" && typeof module !== "undefined")
    ? require("./rng.js") : global.OT_RNG;

  // ── grid helpers ──────────────────────────────────────────────────────────
  function rowOf(i, cols) { return Math.floor(i / cols); }
  function colOf(i, cols) { return i % cols; }
  function index(r, c, cols) { return r * cols + c; }

  function neighbors(i, rows, cols) {
    var r = rowOf(i, cols), c = colOf(i, cols), res = [];
    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        var nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) res.push(index(nr, nc, cols));
      }
    }
    return res;
  }

  // ── board generation ──────────────────────────────────────────────────────
  function newCell() {
    return {
      power: 0, kind: "field", pressure: 0,
      revealed: false, marked: false, beaten: false, lost: false, artifact: null,
    };
  }

  // A cell holds an opposing player (field defender OR keeper) — i.e. it is a MINE / win target.
  // Note: a 'field' cell with power 0 is SAFE grass (the default kind), so power must be > 0.
  function isDefenderCell(cell) {
    return (cell.kind === "field" || cell.kind === "keeper") && cell.power > 0;
  }
  function isDefenderPower(cell) { return isDefenderCell(cell) ? cell.power : 0; }

  // pressure = SUM of adjacent (8-dir) defender powers, INCLUDING the keeper.
  // Only meaningful for safe cells (power 0). Can be double-digit near clusters.
  function recomputePressures(cells, rows, cols) {
    var n = rows * cols;
    for (var p = 0; p < n; p++) {
      if (isDefenderPower(cells[p]) > 0) { cells[p].pressure = 0; continue; }
      var sum = 0, nb = neighbors(p, rows, cols);
      for (var q = 0; q < nb.length; q++) sum += isDefenderPower(cells[nb[q]]);
      cells[p].pressure = sum;
    }
  }

  // Pick a power 1..4 proportional to weights {1:w1,2:w2,3:w3,4:w4}; powers with weight 0 are skipped.
  function weightedRandomPower(rnd, weights) {
    var powers = [1, 2, 3, 4], total = 0, p;
    for (var i = 0; i < powers.length; i++) {
      p = powers[i];
      total += (weights && weights[p] > 0) ? weights[p] : 0;
    }
    if (total <= 0) return 1; // degenerate weights -> a power-1 defender
    var r = rnd() * total, acc = 0;
    for (var j = 0; j < powers.length; j++) {
      p = powers[j];
      var w = (weights && weights[p] > 0) ? weights[p] : 0;
      if (w <= 0) continue;
      acc += w;
      if (r < acc) return p;
    }
    return powers[powers.length - 1];
  }

  // Carve a single connected SAFE path from startIdx upward to a cell ADJACENT to the keeper.
  // Random walk biased UPWARD (toward row 0) and toward keeperCol, with lateral "wiggle"
  // probability cfg.pathWiggle. Path width 1; consecutive path cells are 8-neighbours. Returns an
  // ordered list of path indices (start first, keeper-adjacent cell last) — the keeper itself is
  // NOT included. Capped at rows*cols steps; if it stalls it steps straight up.
  function carvePath(rnd, cfg, startIdx, keeperIdx) {
    var rows = cfg.rows, cols = cfg.cols;
    var keeperCol = colOf(keeperIdx, cols);
    var onPath = {};
    var order = [startIdx];
    onPath[startIdx] = true;
    var cur = startIdx;
    var maxSteps = rows * cols;
    for (var step = 0; step < maxSteps; step++) {
      // Adjacent to the keeper? Then the path is complete (don't step onto the keeper itself).
      var nbCur = neighbors(cur, rows, cols);
      if (nbCur.indexOf(keeperIdx) !== -1) break;

      var cr = rowOf(cur, cols), cc = colOf(cur, cols);
      // Candidate next cells: 8-neighbours, in bounds, not the keeper, not already on the path.
      var cands = [];
      for (var k = 0; k < nbCur.length; k++) {
        var j = nbCur[k];
        if (j === keeperIdx) continue;
        if (onPath[j]) continue;
        cands.push(j);
      }
      if (cands.length === 0) {
        // Stalled (every neighbour is on the path or is the keeper). Step straight up if we can.
        var upIdx = (cr > 0) ? index(cr - 1, cc, cols) : -1;
        if (upIdx >= 0 && upIdx !== keeperIdx) {
          if (!onPath[upIdx]) { onPath[upIdx] = true; order.push(upIdx); }
          cur = upIdx;
          continue;
        }
        break;
      }

      // Decide whether to wiggle laterally (same/away row) or push upward toward the keeper.
      var wiggle = rnd() < cfg.pathWiggle;
      var pick = chooseStep(rnd, cands, cr, cc, keeperCol, cols, wiggle);
      onPath[pick] = true;
      order.push(pick);
      cur = pick;
    }
    return { order: order, onPath: onPath };
  }

  // Score candidates and pick one: upward (lower row) and toward keeperCol is preferred; on a
  // wiggle we instead favour lateral moves (same row, toward keeperCol). Deterministic via rnd().
  function chooseStep(rnd, cands, cr, cc, keeperCol, cols, wiggle) {
    var best = [], bestScore = -Infinity;
    for (var i = 0; i < cands.length; i++) {
      var j = cands[i];
      var nr = rowOf(j, cols), nc = colOf(j, cols);
      var score = 0;
      if (wiggle) {
        // Favour staying on the row (lateral) and edging toward the keeper column.
        if (nr === cr) score += 2;
        score -= Math.abs(nc - keeperCol);
      } else {
        // Favour going up and edging toward the keeper column.
        if (nr < cr) score += 3;
        score -= Math.abs(nc - keeperCol);
      }
      if (score > bestScore) { bestScore = score; best = [j]; }
      else if (score === bestScore) best.push(j);
    }
    return best[Math.floor(rnd() * best.length)];
  }

  // Place the keeper, carve a guaranteed safe path to it, scatter defenders on off-path cells,
  // sprinkle artifacts along the path, then compute pressures. Returns the board.
  function placeBoard(rnd, cfg) {
    var rows = cfg.rows, cols = cfg.cols, n = rows * cols;
    var cells = new Array(n);
    for (var i = 0; i < n; i++) cells[i] = newCell();

    var startIdx = index(cfg.startRow, cfg.startCol, cols);
    var keeperIdx = index(cfg.goalRow, cfg.keeperCol, cols);

    // Keeper: kind 'keeper', power 1 (HP 1 — trivial), revealed from the start. It is the GOAL.
    cells[keeperIdx].kind = "keeper";
    cells[keeperIdx].power = 1;
    cells[keeperIdx].revealed = true;

    // Carve the single connected safe path start -> keeper-adjacent cell.
    var carved = carvePath(rnd, cfg, startIdx, keeperIdx);
    var onPath = carved.onPath, pathOrder = carved.order;

    // Defenders: every off-path, non-start, non-keeper cell becomes a defender with prob density.
    for (var a = 0; a < n; a++) {
      if (a === startIdx || a === keeperIdx || onPath[a]) continue;
      if (rnd() < cfg.density) {
        cells[a].kind = "field";
        cells[a].power = weightedRandomPower(rnd, cfg.powerWeights);
      }
      // Otherwise it stays safe grass (power 0) — a cascade / decoy cell.
    }

    // Artifacts along the path, excluding the start cell and the final keeper-adjacent cell.
    placeArtifacts(cfg, cells, pathOrder);

    recomputePressures(cells, rows, cols);
    return {
      cells: cells, startIdx: startIdx, keeperIdx: keeperIdx,
      rows: rows, cols: cols,
    };
  }

  // Spread cfg.artifacts.save 'save' + cfg.artifacts.scout 'scout' artifacts evenly along the
  // interior of the path (excluding the start cell at order[0] and the keeper-adjacent cell at the
  // tail). Artifact cells stay safe (power 0). Saves first, then scouts, on distinct interior cells.
  function placeArtifacts(cfg, cells, pathOrder) {
    var art = cfg.artifacts || { save: 0, scout: 0 };
    var interior = pathOrder.slice(1, pathOrder.length - 1); // drop start + keeper-adjacent tail
    if (interior.length === 0) return;

    var wantSave = art.save || 0, wantScout = art.scout || 0;
    var total = wantSave + wantScout;
    if (total <= 0) return;

    // Evenly spaced slots across the interior, de-duplicated, capped to available cells.
    var slots = evenSlots(interior.length, total);
    var assigned = 0;
    for (var s = 0; s < slots.length; s++) {
      var cellIdx = interior[slots[s]];
      var kind = (assigned < wantSave) ? "save" : "scout";
      cells[cellIdx].artifact = kind; // stays power 0, kind 'field' (safe)
      assigned++;
    }
  }

  // Choose `count` evenly-spaced, distinct indices in [0, length). Deterministic, no RNG.
  function evenSlots(length, count) {
    if (count >= length) {
      var all = [];
      for (var i = 0; i < length; i++) all.push(i);
      return all;
    }
    var slots = [], used = {};
    for (var k = 0; k < count; k++) {
      var pos = Math.round(((k + 1) * length) / (count + 1));
      if (pos < 0) pos = 0;
      if (pos >= length) pos = length - 1;
      // Nudge off collisions so the slots stay distinct.
      while (used[pos]) pos = (pos + 1) % length;
      used[pos] = true;
      slots.push(pos);
    }
    return slots;
  }

  function defaultCfg() { return CONFIG.resolve(CONFIG.difficulty); }

  // BFS through the SAFE region (power-0 cells) from start; the keeper is reachable iff the region
  // touches a cell adjacent to the keeper. Used as a safety-net validator in generateBoard.
  function keeperReachable(board) {
    var cells = board.cells, rows = board.rows, cols = board.cols;
    var seen = new Uint8Array(cells.length);
    var stack = [board.startIdx];
    seen[board.startIdx] = 1;
    while (stack.length) {
      var i = stack.pop();
      var nb = neighbors(i, rows, cols);
      for (var k = 0; k < nb.length; k++) {
        var j = nb[k];
        if (j === board.keeperIdx) return true;   // the safe region borders the keeper
        if (!seen[j] && isDefenderPower(cells[j]) === 0) { seen[j] = 1; stack.push(j); }
      }
    }
    return false;
  }

  // Seed an RNG and place a board. The path-to-keeper connectivity is guaranteed by construction,
  // so the first board is normally returned; a small attempt loop is kept only as a safety net,
  // verifying connectivity via BFS through safe cells. Stamps board.attempt and board.seedKey.
  function generateBoard(seedKey, cfg) {
    cfg = cfg || defaultCfg();
    var fallback = null;
    for (var attempt = 0; attempt < cfg.maxGenAttempts; attempt++) {
      var seed = RNG.hashStr("offside:" + seedKey + ":" + attempt);
      var rnd = RNG.mulberry32(seed);
      var board = placeBoard(rnd, cfg);
      if (!fallback) fallback = stamp(board, seedKey, attempt);
      if (keeperReachable(board)) return stamp(board, seedKey, attempt);
    }
    // Never throw: fall back to the first board placed (connectivity is guaranteed by the carve,
    // so this is effectively unreachable, but the game still renders rather than crashing).
    if (fallback) return fallback;
    var s = RNG.hashStr("offside:" + seedKey + ":0");
    return stamp(placeBoard(RNG.mulberry32(s), cfg), seedKey, 0);
  }

  function stamp(board, seedKey, attempt) {
    board.attempt = attempt;
    board.seedKey = seedKey;
    return board;
  }

  // ── game state + actions ──────────────────────────────────────────────────
  function createGame(seedKey, cfg) {
    cfg = cfg || defaultCfg();
    var board = generateBoard(seedKey, cfg);
    var state = {
      cfg: cfg,
      board: board,
      status: "playing",          // 'playing' | 'won' | 'lost'
      ballIdx: board.startIdx,
      keeperIdx: board.keeperIdx,
      saves: cfg.startSaves,
      artifactsCollected: 0,
      events: [],
    };
    // Opening move is always free + cascades from the start cell. The keeper is already revealed.
    state.initialEvents = revealCell(state, board.startIdx, { initial: true, force: true });
    return state;
  }

  // A cell is passable (the ball can sit on / move through it) when it is revealed, not lost, and
  // not an un-beaten defender/keeper. The start cell, safe cells, artifact cells and BEATEN
  // defenders are passable; the keeper is revealed from the start but NOT passable until beaten.
  function isPassable(cell) {
    if (!cell.revealed || cell.lost) return false;
    if (isDefenderCell(cell)) return cell.beaten === true;
    return true;
  }

  function touchesRegion(state, i) {
    var nb = neighbors(i, state.board.rows, state.board.cols);
    for (var k = 0; k < nb.length; k++) if (isPassable(state.board.cells[nb[k]])) return true;
    return false;
  }

  // A hidden cell is reachable only if it touches an already-revealed passable cell. The keeper is
  // revealed (so isFrontier returns false for it) but is still actionable once it borders the
  // region — see isActable / revealCell.
  function isFrontier(state, i) {
    var cells = state.board.cells;
    if (cells[i].revealed) return false;
    return touchesRegion(state, i);
  }

  // Can the player legally ACT on cell i right now (reveal a frontier cell OR reach the
  // already-revealed-but-unbeaten keeper sitting next to the passable region)?
  function isActable(state, i) {
    var cell = state.board.cells[i];
    if (isFrontier(state, i)) return true;
    // The keeper is revealed from the start; it becomes actionable once it borders the region.
    if (cell.kind === "keeper" && cell.revealed && !cell.beaten) return touchesRegion(state, i);
    return false;
  }

  // Reveal a safe (power-0) cell: reveal it, cascade if pressure 0, and collect any artifact.
  // Used both by direct taps and by the 'scout' artifact's free hint. Appends to `events`.
  function revealSafe(state, i, events) {
    var cell = state.board.cells[i];
    if (cell.revealed || isDefenderPower(cell) > 0) return;
    cell.revealed = true;
    events.push({ type: "reveal", idx: i, pressure: cell.pressure });
    if (cell.artifact) collectArtifact(state, i, events);
    if (cell.pressure === 0) cascade(state, i, events);
  }

  function cascade(state, start, events) {
    var cells = state.board.cells, rows = state.board.rows, cols = state.board.cols;
    var stack = neighbors(start, rows, cols);
    while (stack.length) {
      var i = stack.pop();
      var cell = cells[i];
      if (cell.revealed || isDefenderPower(cell) > 0 || cell.marked) continue;
      cell.revealed = true;
      events.push({ type: "reveal", idx: i, pressure: cell.pressure });
      if (cell.artifact) collectArtifact(state, i, events);
      if (cell.pressure === 0) {
        var nb = neighbors(i, rows, cols);
        for (var k = 0; k < nb.length; k++) {
          var j = nb[k];
          if (!cells[j].revealed && isDefenderPower(cells[j]) === 0 && !cells[j].marked) stack.push(j);
        }
      }
    }
  }

  // Collect the artifact on cell i (assumed already revealed). Clears cell.artifact, bumps the
  // counter, and applies the effect: 'save' grants +1 save; 'scout' reveals one hidden safe
  // frontier cell (lowest pressure) for free. Appends to `events`.
  function collectArtifact(state, i, events) {
    var cell = state.board.cells[i];
    var kind = cell.artifact;
    if (!kind) return;
    cell.artifact = null;
    state.artifactsCollected++;
    if (kind === "save") {
      state.saves++;
      events.push({ type: "artifact", idx: i, kind: "save", saves: state.saves });
    } else if (kind === "scout") {
      events.push({ type: "artifact", idx: i, kind: "scout" });
      revealScoutHint(state, events);
    }
  }

  // Free safe hint: reveal ONE currently-hidden SAFE frontier cell (isFrontier + power 0), the one
  // with the LOWEST pressure. If none exists, do nothing. Reuses revealSafe (so it cascades and can
  // chain further artifacts). Appends to `events`.
  function revealScoutHint(state, events) {
    var cells = state.board.cells, best = -1, bestPressure = Infinity;
    for (var i = 0; i < cells.length; i++) {
      if (isDefenderPower(cells[i]) > 0) continue;     // must be a safe cell
      if (!isFrontier(state, i)) continue;             // must be a hidden frontier cell
      if (cells[i].pressure < bestPressure) { bestPressure = cells[i].pressure; best = i; }
    }
    if (best >= 0) revealSafe(state, best, events);
  }

  function revealCell(state, i, opts) {
    opts = opts || {};
    var events = [];
    if (state.status !== "playing") return events;
    var cell = state.board.cells[i];

    // A revealed-but-unbeaten keeper can still be ACTED ON (it is shown from the start).
    var isKeeperAct = cell.kind === "keeper" && cell.revealed && !cell.beaten;

    if (cell.revealed && !isKeeperAct) return events;
    if (cell.marked && !opts.force) { events.push({ type: "blocked", reason: "marked", idx: i }); return events; }

    // Legality: a normal hidden cell must be a frontier; the keeper must border the region.
    if (!opts.initial) {
      var legal = isKeeperAct ? touchesRegion(state, i) : isFrontier(state, i);
      if (!legal) { events.push({ type: "illegal", idx: i }); return events; }
    }

    // KEEPER: reaching it (HP 1) wins — no cost.
    if (cell.kind === "keeper") {
      cell.beaten = true;
      state.ballIdx = i;
      state.status = "won";
      events.push({ type: "goal", idx: i });
      return events;
    }

    // DEFENDER (field, power > 0): a save absorbs the hit; otherwise it is a loss.
    if (isDefenderCell(cell) && !cell.beaten) {
      var power = cell.power;
      if (state.saves > 0) {
        state.saves--;
        cell.beaten = true;
        cell.revealed = true;
        state.ballIdx = i;
        events.push({ type: "save", idx: i, power: power });
        return events;
      }
      cell.revealed = true;
      cell.lost = true;
      state.status = "lost";
      events.push({ type: "duel", idx: i, power: power, success: false });
      events.push({ type: "gameover", idx: i, reason: "caught", power: power });
      return events;
    }

    // SAFE cell (grass or artifact): reveal + flood-fill cascade + collect artifact.
    revealSafe(state, i, events);
    state.ballIdx = i;
    return events;
  }

  function toggleMark(state, i) {
    if (state.status !== "playing") return [];
    var cell = state.board.cells[i];
    if (cell.revealed) return [{ type: "blocked", reason: "revealed", idx: i }];
    cell.marked = !cell.marked;
    return [{ type: "mark", idx: i, marked: cell.marked }];
  }

  // ── scouting (HUD read) — pure read ─────────────────────────────────────────
  // Returns the current saves, total/remaining defenders (unrevealed/unbeaten), whether the keeper
  // is beaten, and how many uncollected artifacts remain on the board.
  function scout(state) {
    var cells = state.board.cells;
    var defendersTotal = 0, defendersRemaining = 0, artifactsLeft = 0, keeperBeaten = false;
    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      if (cell.kind === "keeper") {
        keeperBeaten = cell.beaten === true;
        continue;
      }
      if (cell.kind === "field" && cell.power > 0) {
        defendersTotal++;
        if (!cell.revealed && !cell.beaten) defendersRemaining++;
      }
      if (cell.artifact) artifactsLeft++;
    }
    return {
      saves: state.saves,
      defendersTotal: defendersTotal,
      defendersRemaining: defendersRemaining,
      keeperBeaten: keeperBeaten,
      artifactsLeft: artifactsLeft,
    };
  }

  var api = {
    rowOf: rowOf, colOf: colOf, index: index, neighbors: neighbors,
    placeBoard: placeBoard, generateBoard: generateBoard,
    createGame: createGame, revealCell: revealCell, toggleMark: toggleMark,
    isFrontier: isFrontier, isPassable: isPassable, isActable: isActable,
    scout: scout,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.OT_GAME = api;
})(typeof window !== "undefined" ? window : globalThis);
