// Offside Trap — pure game logic (no rendering, no DOM). Stage 4: Dragonsweeper football.
// Every mutating action returns an ordered list of events the renderer can animate.
//
// Model
//   Cells: { power:0, kind:'field', pressure:0, revealed, marked, beaten, lost }
//     - power 0 = safe grass; kind in 'field' | 'keeper' | 'medkit'.
//     - The KEEPER (boss) sits at (goalRow=0, keeperCol), kind 'keeper', power keeperPower,
//       and is revealed FROM THE START (visible like the Dragon). Beating it = GOAL (win).
//     - Field defenders carry power 1..4 (kind 'field'); medkits are safe cells (power 0).
//   Resources: stamina = HP (risked), skill = attack.
//     - Beating a defender of power P costs max(0, P - skill) stamina and grants +P XP.
//     - cost > stamina  -> loss (reason 'tackle'). No affordable move left -> loss ('stranded').
//   Level-up is MANUAL (Dragonsweeper-style) and a FULL HEAL: the player taps LEVEL UP when
//   xp >= xpThresholds[level]; that does skill+1, maxStamina+2, stamina = maxStamina. Duels do
//   NOT auto-level. Total XP on the board is finite, so heals are finite.
//   Medkit cells restore +medkitRestore stamina (capped at maxStamina) when revealed.
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
  function ratingList(cfg) {
    // Field-defender powers, highest first (so dense placement seats the big ones early).
    var list = [];
    var d = cfg.defenders;
    var p4 = d.p4 || 0, p3 = d.p3 || 0, p2 = d.p2 || 0, p1 = d.p1 || 0;
    var i;
    for (i = 0; i < p4; i++) list.push(4);
    for (i = 0; i < p3; i++) list.push(3);
    for (i = 0; i < p2; i++) list.push(2);
    for (i = 0; i < p1; i++) list.push(1);
    return list;
  }

  function newCell() {
    return {
      power: 0, kind: "field", pressure: 0,
      revealed: false, marked: false, beaten: false, lost: false,
    };
  }

  // Place the keeper-boss + a DENSE field defense + medkits. No guaranteed safe path.
  // The keeper occupies (goalRow, keeperCol), is revealed from the start, and is the win target.
  function placeBoard(rnd, cfg) {
    var rows = cfg.rows, cols = cfg.cols, n = rows * cols;
    var cells = new Array(n);
    for (var i = 0; i < n; i++) cells[i] = newCell();

    var startIdx = index(cfg.startRow, cfg.startCol, cols);
    var keeperIdx = index(cfg.goalRow, cfg.keeperCol, cols);

    // Keeper boss: high power, kind 'keeper', visible from the start.
    cells[keeperIdx].kind = "keeper";
    cells[keeperIdx].power = cfg.keeperPower;
    cells[keeperIdx].revealed = true;

    // Field defenders scattered onto any cell except the start and the keeper. Dense by design.
    var available = [];
    for (var a = 0; a < n; a++) {
      if (a === startIdx || a === keeperIdx) continue;
      available.push(a);
    }
    shuffle(available, rnd);

    var ratings = ratingList(cfg);
    var placed = 0;
    for (var ri = 0; ri < ratings.length && placed < available.length; ri++) {
      var cellIdx = available[placed++];
      cells[cellIdx].power = ratings[ri];
      cells[cellIdx].kind = "field";
    }

    // Medkits on safe cells (power 0, not start, not keeper). Reuse the shuffled pool tail.
    var medkits = cfg.medkits || 0, mPlaced = 0;
    for (var m = placed; m < available.length && mPlaced < medkits; m++) {
      var mi = available[m];
      if (cells[mi].power === 0 && cells[mi].kind === "field") {
        cells[mi].kind = "medkit";   // safe cell, power stays 0
        mPlaced++;
      }
    }

    recomputePressures(cells, rows, cols);
    return {
      cells: cells, startIdx: startIdx, keeperIdx: keeperIdx,
      rows: rows, cols: cols,
    };
  }

  // Fisher–Yates shuffle in place using the seeded RNG (deterministic for a given rnd).
  function shuffle(arr, rnd) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // A cell holds an opposing player (field defender OR keeper) — i.e. it must be beaten to pass.
  // Note: a 'field' cell with power 0 is SAFE grass (the default kind), so power must be > 0.
  function isDefenderCell(cell) {
    return (cell.kind === "field" || cell.kind === "keeper") && cell.power > 0;
  }
  function isDefenderPower(cell) { return isDefenderCell(cell) ? cell.power : 0; }

  // pressure = SUM of adjacent (8-dir) defender powers, INCLUDING the keeper.
  // Only meaningful for safe cells (grass / medkits, power 0). Can be double-digit.
  function recomputePressures(cells, rows, cols) {
    var n = rows * cols;
    for (var p = 0; p < n; p++) {
      if (isDefenderPower(cells[p]) > 0) { cells[p].pressure = 0; continue; }
      var sum = 0, nb = neighbors(p, rows, cols);
      for (var q = 0; q < nb.length; q++) sum += isDefenderPower(cells[nb[q]]);
      cells[p].pressure = sum;
    }
  }

  function defaultCfg() { return CONFIG.resolve(CONFIG.difficulty); }

  // A connected SAFE (defender-free, 8-dir) path from start to row 0. Kept for tests/diagnostics;
  // in the Stage 4 model the keeper occupies the goal row centre, so a "safe path to row 0" no
  // longer means a win — winning requires beating the keeper. Treats keeper + field as blockers.
  function hasSafePath(board) {
    var cells = board.cells, rows = board.rows, cols = board.cols;
    var seen = new Uint8Array(cells.length);
    var stack = [board.startIdx];
    seen[board.startIdx] = 1;
    while (stack.length) {
      var i = stack.pop();
      if (rowOf(i, cols) === 0) return true;
      var nb = neighbors(i, rows, cols);
      for (var k = 0; k < nb.length; k++) {
        var j = nb[k];
        if (!seen[j] && isDefenderPower(cells[j]) === 0) { seen[j] = 1; stack.push(j); }
      }
    }
    return false;
  }

  // ── winnability (sound, bounded best-first search) ──────────────────────────
  // A board is winnable iff some sequence of legal actions ends with the KEEPER beaten without
  // stamina ever going negative. Legal actions:
  //   - reveal safe cells / medkits freely (they only enlarge the reachable region);
  //   - beat an affordable frontier defender/keeper (cost = max(0, power - skill) <= stamina);
  //   - LEVEL UP whenever xp >= xpThresholds[leveled] (full heal): skill+1, maxStamina+2,
  //     stamina = newMax. Leveling is a CHOICE the search may take at any eligible point.
  // Medkits on the reachable region are essentially free restores (capped at maxStamina).
  //
  // State = { beaten bitmask (keeper has its own bit), stamina, leveled }. skill and xp are
  // deterministic functions of (beaten, leveled): skill = start.skill + leveled,
  // xp = sum of beaten powers. So a state is dominated if the same (beaten, leveled) was reached
  // with >= stamina. We cap explored nodes and return false on overflow (conservative: a `true`
  // result therefore always implies the board is genuinely winnable).
  var WINNABLE_NODE_CAP = 100000;

  function popcount(x) {
    var c = 0;
    while (x) { x &= x - 1; c++; }
    return c;
  }

  // Flood the reachable region for a beaten bitmask. `defBit[i]` is the bit of a defender at i,
  // or -1 for safe cells. Safe cells and beaten defenders are passable. Returns reached + the
  // set of medkit cells now reachable (so the search can bank their restore).
  function floodReach(board, defBit, medMask, beaten) {
    var cells = board.cells, rows = board.rows, cols = board.cols, n = cells.length;
    var reached = new Uint8Array(n);
    var stack = [board.startIdx];
    reached[board.startIdx] = 1;
    var medkitsReachable = 0;
    while (stack.length) {
      var i = stack.pop();
      var nb = neighbors(i, rows, cols);
      for (var k = 0; k < nb.length; k++) {
        var j = nb[k];
        if (reached[j]) continue;
        var bit = defBit[j];
        var passable = (bit < 0) || ((beaten & (1 << bit)) !== 0);
        if (!passable) continue;
        reached[j] = 1;
        if (medMask[j]) medkitsReachable++;
        stack.push(j);
      }
    }
    return { reached: reached, medkitsReachable: medkitsReachable };
  }

  function isWinnable(board, cfg) {
    cfg = cfg || defaultCfg();
    var cells = board.cells, rows = board.rows, cols = board.cols, n = cells.length;
    var xpT = cfg.xpThresholds;
    var restore = (cfg.medkitRestore != null) ? cfg.medkitRestore : CONFIG.MEDKIT_RESTORE;

    // Compact defender-index list (field + keeper). The keeper gets its own bit.
    var defBit = new Int16Array(n);
    var defCells = [];          // bit index -> cell index
    var defPower = [];          // bit index -> power
    var keeperBit = -1;
    var medMask = new Uint8Array(n);
    for (var i = 0; i < n; i++) {
      var cell = cells[i];
      if (isDefenderCell(cell) && cell.power > 0) {
        defBit[i] = defCells.length;
        if (cell.kind === "keeper") keeperBit = defCells.length;
        defCells.push(i);
        defPower.push(cell.power);
      } else {
        defBit[i] = -1;
        if (cell.kind === "medkit") medMask[i] = 1;
      }
    }
    if (keeperBit < 0) return false; // no keeper -> unwinnable by construction
    var keeperMaskBit = 1 << keeperBit;

    var baseSkill = cfg.start.skill;
    var baseMax = (cfg.maxStaminaStart != null) ? cfg.maxStaminaStart : cfg.start.stamina;

    function skillFor(leveled) { return baseSkill + leveled; }
    function maxStaminaFor(leveled) { return baseMax + 2 * leveled; }

    // xp earned for a beaten-set = sum of beaten powers (keeper included once beaten, but the
    // keeper bit being set means we've already won so xp from it never matters for leveling).
    function currentXp(mask) {
      var xp = 0;
      for (var b = 0; b < defPower.length; b++) if (mask & (1 << b)) xp += defPower[b];
      return xp;
    }

    // Best-first heap keyed by progress so winning leaves surface quickly.
    var heap = [];
    function heapPush(node) {
      heap.push(node);
      var c = heap.length - 1;
      while (c > 0) {
        var p = (c - 1) >> 1;
        if (heap[p].pri >= heap[c].pri) break;
        var tmp = heap[p]; heap[p] = heap[c]; heap[c] = tmp; c = p;
      }
    }
    function heapPop() {
      var top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        var c = 0, len = heap.length;
        for (;;) {
          var l = 2 * c + 1, r = l + 1, big = c;
          if (l < len && heap[l].pri > heap[big].pri) big = l;
          if (r < len && heap[r].pri > heap[big].pri) big = r;
          if (big === c) break;
          var t = heap[big]; heap[big] = heap[c]; heap[c] = t; c = big;
        }
      }
      return top;
    }

    // Dominance: key (beaten, leveled) -> best stamina seen. Same key => same skill/xp/max, so a
    // later arrival with <= stamina is dominated. Encode key as a string (beaten can exceed 31
    // bits worth of defenders, so keep beaten as a Number but guard the bit count).
    var bestStamina = new Map();
    function keyOf(beaten, leveled) { return beaten + "|" + leveled; }

    function push(beaten, stamina, leveled) {
      var key = keyOf(beaten, leveled);
      var prev = bestStamina.get(key);
      if (prev !== undefined && prev >= stamina) return;
      bestStamina.set(key, stamina);
      // priority: more beaten first, then more leveled, then more stamina.
      var pri = popcount(beaten) * 100000 + leveled * 1000 + stamina;
      heapPush({ beaten: beaten, stamina: stamina, leveled: leveled, pri: pri });
    }

    // Apply all reachable medkit restores (capped at the current max) to a stamina value.
    function applyMedkits(stamina, leveled, medCount) {
      var max = maxStaminaFor(leveled);
      return Math.min(max, stamina + medCount * restore);
    }

    // Seed: start with medkits already-reachable folded in (initial reveal floods them).
    var initFlood = floodReach(board, defBit, medMask, 0);
    push(0, applyMedkits(baseMax, 0, initFlood.medkitsReachable), 0);

    var explored = 0;
    while (heap.length) {
      if (++explored > WINNABLE_NODE_CAP) return false; // cap hit -> conservative false
      var node = heapPop();
      var beaten = node.beaten, leveled = node.leveled, stamina = node.stamina;
      if (bestStamina.get(keyOf(beaten, leveled)) > stamina) continue; // stale entry

      if (beaten & keeperMaskBit) return true; // keeper beaten -> win

      var skill = skillFor(leveled);
      var xp = currentXp(beaten);

      // Option A: LEVEL UP (full heal) whenever an XP threshold is reached and tiers remain.
      if (leveled < xpT.length && xp >= xpT[leveled]) {
        var nextLeveled = leveled + 1;
        var healed = maxStaminaFor(nextLeveled);
        // re-bank reachable medkits at the new (larger) cap (no new region opened by leveling,
        // but the cap grew so medkits could now matter — already at full, so this is just full).
        push(beaten, healed, nextLeveled);
      }

      // Option B: beat an affordable frontier defender/keeper.
      var fr = floodReach(board, defBit, medMask, beaten);
      var reached = fr.reached;
      var seenFrontier = {};
      for (var ci = 0; ci < n; ci++) {
        if (!reached[ci]) continue;
        var nb = neighbors(ci, rows, cols);
        for (var k = 0; k < nb.length; k++) {
          var j = nb[k];
          var bit = defBit[j];
          if (bit < 0) continue;                       // safe (already flooded)
          if ((beaten & (1 << bit)) !== 0) continue;   // already beaten
          if (seenFrontier[bit]) continue;
          seenFrontier[bit] = 1;
          var cost = Math.max(0, defPower[bit] - skill);
          if (cost > stamina) continue;                // unaffordable -> cannot attempt
          var nextBeaten = beaten | (1 << bit);
          var nextStamina = stamina - cost;
          if (bit === keeperBit) {
            // Beating the keeper wins immediately; stamina bookkeeping no longer matters.
            return true;
          }
          // Beating opens new region -> new medkits may become reachable; bank them.
          var fr2 = floodReach(board, defBit, medMask, nextBeaten);
          var newMeds = fr2.medkitsReachable - fr.medkitsReachable;
          if (newMeds < 0) newMeds = 0;
          nextStamina = applyMedkits(nextStamina, leveled, newMeds);
          push(nextBeaten, nextStamina, leveled);
        }
      }
    }
    return false;
  }

  // Back-compat alias for the old name.
  function isSolvable(board) { return hasSafePath(board); }

  // Deterministically search seed variants for a winnable board (the only hard constraint in the
  // Stage 4 model: there must exist a play that beats the keeper). No safe-path requirement.
  // Sets board.keeperIdx and board.forcedDuel=true. Never throws (graceful fallback).
  function generateBoard(seedKey, cfg) {
    cfg = cfg || defaultCfg();
    var fallback = null;
    for (var attempt = 0; attempt < cfg.maxGenAttempts; attempt++) {
      var seed = RNG.hashStr("offside:" + seedKey + ":" + attempt);
      var rnd = RNG.mulberry32(seed);
      var board = placeBoard(rnd, cfg);
      if (!fallback) fallback = stamp(board, seedKey, attempt);
      if (isWinnable(board, cfg)) return stamp(board, seedKey, attempt);
    }
    // Never throw: fall back to the first board placed (extremely unlikely to be unwinnable
    // across 600 attempts, but the game still renders rather than crashing).
    if (fallback) return fallback;
    var s = RNG.hashStr("offside:" + seedKey + ":0");
    return stamp(placeBoard(RNG.mulberry32(s), cfg), seedKey, 0);
  }

  function stamp(board, seedKey, attempt) {
    board.attempt = attempt;
    board.seedKey = seedKey;
    board.keeperIdx = board.keeperIdx; // already set by placeBoard
    board.forcedDuel = true;           // you must always beat the keeper to win
    return board;
  }

  // ── game state + actions ──────────────────────────────────────────────────
  function createGame(seedKey, cfg) {
    cfg = cfg || defaultCfg();
    var board = generateBoard(seedKey, cfg);
    var maxStamina = (cfg.maxStaminaStart != null) ? cfg.maxStaminaStart : cfg.start.stamina;
    var state = {
      cfg: cfg,
      board: board,
      player: {
        skill: cfg.start.skill,
        stamina: cfg.start.stamina,
        maxStamina: maxStamina,
        xp: 0,
        level: 0,
      },
      status: "playing",          // 'playing' | 'won' | 'lost'
      ballIdx: board.startIdx,
      keeperIdx: board.keeperIdx,
      pendingLevels: 0,
      events: [],
    };
    // Opening move is always free + cascades from the start cell. The keeper is already revealed.
    state.initialEvents = revealCell(state, board.startIdx, { initial: true, force: true });
    return state;
  }

  // A cell is passable (the ball can sit on / move through it) when it is revealed, not lost, and
  // not an un-beaten defender/keeper. The start cell, safe cells, medkits and BEATEN defenders are
  // passable; the keeper is revealed from the start but is NOT passable until it is beaten.
  function isPassable(cell) {
    if (!cell.revealed || cell.lost) return false;
    if (isDefenderCell(cell)) return cell.beaten === true;
    return true;
  }

  // A hidden cell is reachable only if it touches an already-revealed passable cell. The keeper is
  // revealed (so isFrontier returns false for it) but is still tackleable — see revealCell, which
  // permits acting on a revealed-but-unbeaten defender adjacent to the passable region.
  function isFrontier(state, i) {
    var cells = state.board.cells;
    if (cells[i].revealed) return false;
    var nb = neighbors(i, state.board.rows, state.board.cols);
    for (var k = 0; k < nb.length; k++) if (isPassable(cells[nb[k]])) return true;
    return false;
  }

  // Can the player legally ACT on cell i right now (reveal a frontier cell OR tackle the
  // already-revealed-but-unbeaten keeper sitting next to the passable region)?
  function isActable(state, i) {
    var cell = state.board.cells[i];
    if (isFrontier(state, i)) return true;
    // The keeper is revealed from the start; it becomes actionable once it borders the region.
    if (cell.kind === "keeper" && cell.revealed && !cell.beaten) return touchesRegion(state, i);
    return false;
  }

  function touchesRegion(state, i) {
    var nb = neighbors(i, state.board.rows, state.board.cols);
    for (var k = 0; k < nb.length; k++) if (isPassable(state.board.cells[nb[k]])) return true;
    return false;
  }

  // STRANDED loss: the game is playing, not won, and NO hidden frontier cell (or the actionable
  // keeper) is "actionable". Actionable = a safe/medkit cell, OR a defender/keeper whose duel cost
  // max(0, power - skill) <= current stamina. Marked cells still count (the player can unmark).
  function isStranded(state) {
    if (state.status !== "playing") return false;
    var cells = state.board.cells, p = state.player;
    for (var i = 0; i < cells.length; i++) {
      if (!isActable(state, i)) continue;
      var cell = cells[i];
      var power = isDefenderPower(cell);
      if (power === 0) return false; // a safe/medkit actionable cell -> always progressing
      var cost = Math.max(0, power - p.skill);
      if (cost <= p.stamina) return false; // an affordable duel -> actionable
    }
    return true;
  }

  // Convert a soft-lock into an explicit loss after a non-winning action.
  function checkStranded(state, events) {
    if (state.status !== "playing") return false;
    if (!isStranded(state)) return false;
    state.status = "lost";
    events.push({
      type: "gameover", idx: state.ballIdx, reason: "stranded", stamina: state.player.stamina,
    });
    return true;
  }

  function xpToNext(state) {
    var t = state.cfg.xpThresholds;
    if (state.player.level >= t.length) return null;
    return t[state.player.level];
  }

  // How many level-ups are bankable right now (cumulative thresholds crossed minus levels taken).
  function pendingLevelCount(state) {
    var t = state.cfg.xpThresholds, p = state.player, count = 0;
    while (p.level + count < t.length && p.xp >= t[p.level + count]) count++;
    return count;
  }

  function canLevelUp(state) {
    if (state.status !== "playing") return false;
    var t = state.cfg.xpThresholds, p = state.player;
    return p.level < t.length && p.xp >= t[p.level];
  }

  // MANUAL level-up (NOT automatic). Each tap: level+1, skill+1, maxStamina+2, FULL heal.
  function levelUp(state) {
    if (!canLevelUp(state)) return [];
    var p = state.player;
    p.level++;
    p.skill++;
    p.maxStamina += 2;
    p.stamina = p.maxStamina;            // full heal on level-up
    state.pendingLevels = pendingLevelCount(state);
    return [{
      type: "levelup", level: p.level, skill: p.skill,
      maxStamina: p.maxStamina, stamina: p.stamina,
    }];
  }

  function cascade(state, start, events) {
    var cells = state.board.cells, rows = state.board.rows, cols = state.board.cols;
    var stack = [start];
    while (stack.length) {
      var i = stack.pop();
      var cell = cells[i];
      if (cell.revealed || isDefenderPower(cell) > 0 || cell.marked) continue;
      cell.revealed = true;
      events.push({ type: "reveal", idx: i, pressure: cell.pressure });
      // A medkit revealed by the cascade auto-applies its restore.
      if (cell.kind === "medkit") applyMedkit(state, i, events);
      if (cell.pressure === 0) {
        var nb = neighbors(i, rows, cols);
        for (var k = 0; k < nb.length; k++) {
          var j = nb[k];
          if (!cells[j].revealed && isDefenderPower(cells[j]) === 0 && !cells[j].marked) stack.push(j);
        }
      }
    }
  }

  function applyMedkit(state, i, events) {
    var p = state.player;
    var restore = (state.cfg.medkitRestore != null) ? state.cfg.medkitRestore : CONFIG.MEDKIT_RESTORE;
    var before = p.stamina;
    p.stamina = Math.min(p.maxStamina, p.stamina + restore);
    var restored = p.stamina - before;
    events.push({ type: "medkit", idx: i, restored: restored, stamina: p.stamina });
  }

  function revealCell(state, i, opts) {
    opts = opts || {};
    var events = [];
    if (state.status !== "playing") return events;
    var cell = state.board.cells[i];

    // A revealed-but-unbeaten keeper can be TACKLED (it is shown from the start).
    var isKeeperTackle = cell.kind === "keeper" && cell.revealed && !cell.beaten;

    if (cell.revealed && !isKeeperTackle) return events;
    if (cell.marked && !opts.force) { events.push({ type: "blocked", reason: "marked", idx: i }); return events; }

    // Legality: a normal hidden cell must be a frontier; the keeper must border the region.
    if (!opts.initial) {
      var legal = isKeeperTackle ? touchesRegion(state, i) : isFrontier(state, i);
      if (!legal) { events.push({ type: "illegal", idx: i }); return events; }
    }

    if (isDefenderCell(cell) && cell.power > 0 && !cell.beaten) {
      // DUEL (field defender or keeper boss).
      var power = cell.power;
      var cost = Math.max(0, power - state.player.skill);
      if (cost > state.player.stamina) {
        cell.revealed = true;
        cell.lost = true;
        state.status = "lost";
        events.push({ type: "duel", idx: i, power: power, cost: cost, success: false });
        events.push({
          type: "gameover", idx: i, reason: "tackle",
          power: power, cost: cost, stamina: state.player.stamina,
        });
        return events;
      }
      state.player.stamina -= cost;
      state.player.xp += power;
      cell.revealed = true;
      cell.beaten = true;
      state.ballIdx = i;
      state.pendingLevels = pendingLevelCount(state);
      events.push({
        type: "duel", idx: i, power: power, cost: cost, success: true,
        stamina: state.player.stamina, xp: state.player.xp,
      });
      // NOTE: duels do NOT auto-level. Leveling is manual via levelUp().
      if (cell.kind === "keeper") {
        state.status = "won";
        events.push({ type: "goal", idx: i });
        return events;
      }
      // A successful field duel that didn't win may now leave a soft-lock -> stranded loss.
      if (state.status === "playing") checkStranded(state, events);
      return events;
    }

    // Safe cell (grass or medkit): reveal + flood-fill cascade.
    if (cell.kind === "medkit") {
      // A directly-tapped medkit reveals + restores (the cascade path also applies it).
      cell.revealed = true;
      events.push({ type: "reveal", idx: i, pressure: cell.pressure });
      applyMedkit(state, i, events);
      if (cell.pressure === 0) cascade(state, i, events);
    } else {
      cascade(state, i, events);
    }
    state.ballIdx = i;
    // The opening/initial reveal must never strand. After a normal safe reveal that didn't win,
    // check for the soft-lock.
    if (!opts.initial && state.status === "playing") checkStranded(state, events);
    return events;
  }

  function toggleMark(state, i) {
    if (state.status !== "playing") return [];
    var cell = state.board.cells[i];
    if (cell.revealed) return [{ type: "blocked", reason: "revealed", idx: i }];
    cell.marked = !cell.marked;
    return [{ type: "mark", idx: i, marked: cell.marked }];
  }

  // ── scouting (bestiary analog) — pure read ──────────────────────────────────
  // Returns the count of UNBEATEN field defenders per power, the keeper's power + beaten flag,
  // and the smallest skill at which the keeper becomes affordable given the current maxStamina
  // (i.e. smallest skill s.t. keeperPower - skill <= maxStamina).
  function scout(state) {
    var cells = state.board.cells;
    var remaining = { 1: 0, 2: 0, 3: 0, 4: 0 };
    var keeperPower = state.cfg.keeperPower;
    var keeperBeaten = false;
    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      if (cell.kind === "keeper") {
        keeperPower = cell.power;
        keeperBeaten = cell.beaten === true;
      } else if (cell.kind === "field" && cell.power > 0 && !cell.beaten) {
        if (remaining[cell.power] === undefined) remaining[cell.power] = 0;
        remaining[cell.power]++;
      }
    }
    // smallest skill s.t. keeperPower - skill <= maxStamina  =>  skill >= keeperPower - maxStamina
    var skillNeededForKeeper = Math.max(0, keeperPower - state.player.maxStamina);
    return {
      remaining: remaining,
      keeperPower: keeperPower,
      keeperBeaten: keeperBeaten,
      skillNeededForKeeper: skillNeededForKeeper,
    };
  }

  var api = {
    rowOf: rowOf, colOf: colOf, index: index, neighbors: neighbors,
    placeBoard: placeBoard, generateBoard: generateBoard,
    hasSafePath: hasSafePath, isSolvable: isSolvable, isWinnable: isWinnable,
    createGame: createGame, revealCell: revealCell, toggleMark: toggleMark,
    isFrontier: isFrontier, isPassable: isPassable, isActable: isActable,
    canLevelUp: canLevelUp, levelUp: levelUp, isStranded: isStranded,
    scout: scout, xpToNext: xpToNext,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.OT_GAME = api;
})(typeof window !== "undefined" ? window : globalThis);
