// Offside Trap — pure game logic (no rendering, no DOM).
// Every mutating action returns an ordered list of events the renderer can animate.
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
    var list = [];
    var d = cfg.defenders;
    // Highest ratings first so the offside bias has room to place them.
    for (var i = 0; i < d.r3; i++) list.push(3);
    for (var j = 0; j < d.r2; j++) list.push(2);
    for (var k = 0; k < d.r1; k++) list.push(1);
    return list;
  }

  // Fisher–Yates shuffle in place using the seeded RNG (deterministic for a given rnd).
  function shuffle(arr, rnd) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function placeBoard(rnd, cfg) {
    var rows = cfg.rows, cols = cfg.cols, n = rows * cols;
    var cells = new Array(n);
    for (var i = 0; i < n; i++) {
      cells[i] = { def: 0, pressure: 0, revealed: false, marked: false, beaten: false, lost: false };
    }
    var startIdx = index(cfg.startRow, cfg.startCol, cols);
    var offsideRow = RNG.pick(cfg.offsideRowChoices, rnd);

    if (cfg.forceLine) {
      placeForcedLine(cells, rnd, cfg, startIdx, offsideRow);
    } else {
      placeScatter(cells, rnd, cfg, startIdx, offsideRow);
    }

    recomputePressures(cells, rows, cols);
    return { cells: cells, startIdx: startIdx, offsideRow: offsideRow, rows: rows, cols: cols };
  }

  // Original random-with-offside-bias placement (used when cfg.forceLine is false, e.g. easy).
  function placeScatter(cells, rnd, cfg, startIdx, offsideRow) {
    var rows = cfg.rows, cols = cfg.cols, n = rows * cols;
    // available cells (everything but the start cell)
    var available = [];
    for (var a = 0; a < n; a++) if (a !== startIdx) available.push(a);

    function takeFrom(pool) {
      var pos = Math.floor(rnd() * pool.length);
      var idxValue = pool[pos];
      // remove from the master available list
      var ai = available.indexOf(idxValue);
      available.splice(ai, 1);
      return idxValue;
    }

    var ratings = ratingList(cfg);
    for (var ri = 0; ri < ratings.length; ri++) {
      var rating = ratings[ri];
      var pool = available;
      if (rating >= 2 && rnd() < cfg.offsideBias) {
        var near = available.filter(function (idx) {
          var r = rowOf(idx, cols);
          return r >= offsideRow - 1 && r <= offsideRow + 1;
        });
        if (near.length) pool = near;
      }
      var cell = takeFrom(pool);
      cells[cell].def = rating;
    }
  }

  // OFFSIDE LINE placement: a full-width wall of defenders across offsideRow. Because
  // king-movement only changes row by 1 per step, a fully-occupied row is an exact
  // 8-connectivity cut — there is provably no safe path across it (hasSafePath === false),
  // so the player MUST beat a defender to break the line.
  function placeForcedLine(cells, rnd, cfg, startIdx, offsideRow) {
    var rows = cfg.rows, cols = cfg.cols, n = rows * cols;

    var ratings = shuffle(ratingList(cfg), rnd);
    var ri = 0;

    // 1) The wall: one defender in every column of offsideRow (guard the start cell).
    for (var c = 0; c < cols && ri < ratings.length; c++) {
      var wallCell = index(offsideRow, c, cols);
      if (wallCell === startIdx) continue; // never place a defender on the start cell
      cells[wallCell].def = ratings[ri++];
    }

    // 2) Scatter the remaining ratings onto other cells (NOT in offsideRow, NOT the start).
    //    Bias toward rows BELOW the wall (the approach side, rows > offsideRow) so the region
    //    ABOVE the line (rows < offsideRow, toward goal row 0) stays navigable -> winnable.
    if (ri < ratings.length) {
      var below = [];   // approach side: between the wall and the start (preferred)
      var rest = [];    // everywhere else off the wall (above the line + the wall's own row spillover)
      for (var a = 0; a < n; a++) {
        if (a === startIdx) continue;
        var r = rowOf(a, cols);
        if (r === offsideRow) continue;          // the wall row is already full
        if (cells[a].def > 0) continue;          // shouldn't happen, but be safe
        if (r > offsideRow) below.push(a); else rest.push(a);
      }
      shuffle(below, rnd);
      shuffle(rest, rnd);
      var scatterPool = below.concat(rest);      // drain the approach side first
      var si = 0;
      while (ri < ratings.length && si < scatterPool.length) {
        cells[scatterPool[si++]].def = ratings[ri++];
      }
    }
  }

  // pressure = sum of neighbour ratings (only meaningful for safe cells)
  function recomputePressures(cells, rows, cols) {
    var n = rows * cols;
    for (var p = 0; p < n; p++) {
      if (cells[p].def > 0) { cells[p].pressure = 0; continue; }
      var sum = 0, nb = neighbors(p, rows, cols);
      for (var q = 0; q < nb.length; q++) sum += cells[nb[q]].def;
      cells[p].pressure = sum;
    }
  }

  function defaultCfg() { return CONFIG.resolve(CONFIG.difficulty); }

  // A connected SAFE (defender-free, 8-dir) path must exist from start to row 0.
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
        if (!seen[j] && cells[j].def === 0) { seen[j] = 1; stack.push(j); }
      }
    }
    return false;
  }

  // ── winnability (sound, bounded best-first search) ──────────────────────────
  // Model real play: from the start cell, safe (def===0) cells flood-reveal for free and
  // only expand the reachable region. A frontier defender of rating r costs
  // max(0, r - skill) stamina (only attemptable if cost <= stamina); beating it grants +r xp
  // which may trigger level-ups (each: skill+1, maxStamina+1, stamina = maxStamina).
  // A state's reachable region is derived from its beaten-set. The player wins when the
  // reachable region touches row 0. Because skill/level/xp/maxStamina are all functions of
  // *which* defenders are beaten (the bitmask), only `stamina` is path-dependent — so a
  // state is dominated (and skippable) if the same beaten-set was already reached with
  // >= stamina. We cap explored nodes and return false if the cap is hit (conservative):
  // a `true` result therefore always implies the board is genuinely beatable.
  var WINNABLE_NODE_CAP = 50000;

  function popcount(x) {
    var c = 0;
    while (x) { x &= x - 1; c++; }
    return c;
  }

  // Flood the reachable region for a given beaten bitmask. Returns { reached: Uint8Array,
  // goal: bool }. `defBit[i]` is the bit index of a defender at cell i, or -1 for safe cells.
  function floodReach(board, defBit, beaten) {
    var cells = board.cells, rows = board.rows, cols = board.cols, n = cells.length;
    var reached = new Uint8Array(n);
    var stack = [board.startIdx];
    reached[board.startIdx] = 1;
    var goal = rowOf(board.startIdx, cols) === 0;
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
        if (rowOf(j, cols) === 0) goal = true;
        stack.push(j);
      }
    }
    return { reached: reached, goal: goal };
  }

  function isWinnable(board, cfg) {
    cfg = cfg || defaultCfg();
    var cells = board.cells, rows = board.rows, cols = board.cols, n = cells.length;
    var xpT = cfg.xpThresholds;

    // Compact defender-index list so the beaten bitmask stays small.
    var defBit = new Int16Array(n);
    var defCells = [];          // bit index -> cell index
    var defRating = [];         // bit index -> rating
    for (var i = 0; i < n; i++) {
      if (cells[i].def > 0) {
        defBit[i] = defCells.length;
        defCells.push(i);
        defRating.push(cells[i].def);
      } else {
        defBit[i] = -1;
      }
    }

    // Derive skill/level/maxStamina from total xp (deterministic for a beaten-set).
    var baseSkill = cfg.start.skill, baseMax = cfg.start.stamina;
    function levelInfo(xp) {
      var level = 0;
      while (level < xpT.length && xp >= xpT[level]) level++;
      return { skill: baseSkill + level, maxStamina: baseMax + level, level: level };
    }

    // Priority: prefer most-progressed states (more beaten, higher reach via stamina) so we
    // hit a winning leaf quickly. Simple binary max-heap keyed by a scalar priority.
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

    // Dominance map: beaten bitmask -> best stamina seen. Skip states that arrive at an
    // already-seen mask with <= stamina (sound: same mask => same skill/xp/level/max).
    var bestStamina = new Map();

    function push(beaten, stamina) {
      var prev = bestStamina.get(beaten);
      if (prev !== undefined && prev >= stamina) return false;
      bestStamina.set(beaten, stamina);
      // priority: progress (beaten count) dominates, stamina breaks ties
      var pri = popcount(beaten) * 1000 + stamina;
      heapPush({ beaten: beaten, stamina: stamina, pri: pri });
      return true;
    }

    push(0, baseMax);
    var explored = 0;

    while (heap.length) {
      if (++explored > WINNABLE_NODE_CAP) return false; // cap hit -> conservative false
      var node = heapPop();
      var beaten = node.beaten;
      // Stale heap entry (a better stamina for this mask was found later)?
      if (bestStamina.get(beaten) > node.stamina) continue;

      var fr = floodReach(board, defBit, beaten);
      if (fr.goal) return true;

      var info = levelInfo(currentXp(beaten));
      var skill = info.skill, stamina = node.stamina;

      // Frontier defenders = hidden defenders adjacent to the reachable region.
      var reached = fr.reached;
      var seenFrontier = {};
      for (var ci = 0; ci < n; ci++) {
        if (!reached[ci]) continue;
        var nb = neighbors(ci, rows, cols);
        for (var k = 0; k < nb.length; k++) {
          var j = nb[k];
          var bit = defBit[j];
          if (bit < 0) continue;                  // safe (already flooded)
          if ((beaten & (1 << bit)) !== 0) continue; // already beaten
          if (seenFrontier[bit]) continue;
          seenFrontier[bit] = 1;
          var cost = Math.max(0, defRating[bit] - skill);
          if (cost > stamina) continue;            // unaffordable -> cannot attempt
          var nextBeaten = beaten | (1 << bit);
          var nextStamina = stamina - cost;
          // Beating grants +rating xp -> recompute level/refill.
          var nextInfo = levelInfo(currentXp(nextBeaten));
          if (nextInfo.level > info.level) nextStamina = nextInfo.maxStamina; // level-up refills
          push(nextBeaten, nextStamina);
        }
      }
    }
    return false;

    // xp earned for a beaten-set = sum of beaten defenders' ratings.
    function currentXp(mask) {
      var xp = 0;
      for (var b = 0; b < defRating.length; b++) if (mask & (1 << b)) xp += defRating[b];
      return xp;
    }
  }

  // Back-compat alias for the old name.
  function isSolvable(board) { return hasSafePath(board); }

  // Deterministically search seed variants for a board matching the difficulty contract:
  // it must be winnable, AND respect the safe-path constraint —
  //   forceLine    : winnable && !hasSafePath  (the full-width offside wall guarantees the
  //                  latter by construction; we still assert it and regenerate if violated);
  //   allowSafePath: winnable && hasSafePath   (a fully-safe route must exist, e.g. easy);
  //   otherwise    : winnable && !hasSafePath  (force at least one duel).
  // Falls back to the first winnable board if the constraint can't be met within
  // maxGenAttempts (never throws).
  function generateBoard(seedKey, cfg) {
    cfg = cfg || defaultCfg();
    var fallback = null;
    for (var attempt = 0; attempt < cfg.maxGenAttempts; attempt++) {
      var seed = RNG.hashStr("offside:" + seedKey + ":" + attempt);
      var rnd = RNG.mulberry32(seed);
      var board = placeBoard(rnd, cfg);
      if (!isWinnable(board, cfg)) continue;
      var safe = hasSafePath(board);
      if (!fallback) {
        board.attempt = attempt; board.seedKey = seedKey; board.forcedDuel = !safe;
        fallback = board;
      }
      var ok;
      if (cfg.forceLine) ok = !safe;            // wall guarantees no safe path
      else if (cfg.allowSafePath) ok = safe;
      else ok = !safe;
      if (ok) {
        board.attempt = attempt; board.seedKey = seedKey; board.forcedDuel = !safe;
        return board;
      }
    }
    // Never throw: gracefully fall back to the first winnable board found.
    if (fallback) return fallback;
    // Extremely unlikely (no winnable board at all): return the last placed board so the
    // game can still render rather than crashing.
    var s = RNG.hashStr("offside:" + seedKey + ":0");
    var b = placeBoard(RNG.mulberry32(s), cfg);
    b.attempt = 0; b.seedKey = seedKey; b.forcedDuel = !hasSafePath(b);
    return b;
  }

  // ── game state + actions ──────────────────────────────────────────────────
  function createGame(seedKey, cfg) {
    cfg = cfg || defaultCfg();
    var board = generateBoard(seedKey, cfg);
    var state = {
      cfg: cfg,
      board: board,
      player: {
        skill: cfg.start.skill,
        stamina: cfg.start.stamina,
        maxStamina: cfg.start.stamina,
        xp: 0,
        level: 0,
      },
      status: "playing",          // 'playing' | 'won' | 'lost'
      ballIdx: board.startIdx,
      events: [],
    };
    // Opening move is always free + cascades from the start cell.
    state.initialEvents = revealCell(state, board.startIdx, { initial: true, force: true });
    return state;
  }

  function isPassable(cell) { return cell.revealed && !cell.lost; }

  // A hidden cell is reachable only if it touches an already-revealed passable cell.
  function isFrontier(state, i) {
    var cells = state.board.cells;
    if (cells[i].revealed) return false;
    var nb = neighbors(i, state.board.rows, state.board.cols);
    for (var k = 0; k < nb.length; k++) if (isPassable(cells[nb[k]])) return true;
    return false;
  }

  function xpToNext(state) {
    var t = state.cfg.xpThresholds;
    if (state.player.level >= t.length) return null;
    return t[state.player.level];
  }

  function handleLevelUp(state, events) {
    var t = state.cfg.xpThresholds, p = state.player;
    while (p.level < t.length && p.xp >= t[p.level]) {
      p.level++;
      p.skill++;
      p.maxStamina++;
      p.stamina = p.maxStamina;
      events.push({ type: "levelup", level: p.level, skill: p.skill, maxStamina: p.maxStamina });
    }
  }

  function cascade(state, start, events) {
    var cells = state.board.cells, rows = state.board.rows, cols = state.board.cols;
    var stack = [start];
    while (stack.length) {
      var i = stack.pop();
      var cell = cells[i];
      if (cell.revealed || cell.def > 0 || cell.marked) continue;
      cell.revealed = true;
      events.push({ type: "reveal", idx: i, pressure: cell.pressure });
      if (cell.pressure === 0) {
        var nb = neighbors(i, rows, cols);
        for (var k = 0; k < nb.length; k++) {
          var j = nb[k];
          if (!cells[j].revealed && cells[j].def === 0 && !cells[j].marked) stack.push(j);
        }
      }
    }
  }

  function checkGoal(state, events, revealedIdxs) {
    var cols = state.board.cols;
    for (var k = 0; k < revealedIdxs.length; k++) {
      if (rowOf(revealedIdxs[k], cols) === 0) {
        state.status = "won";
        events.push({ type: "goal", idx: revealedIdxs[k] });
        return;
      }
    }
  }

  function revealCell(state, i, opts) {
    opts = opts || {};
    var events = [];
    if (state.status !== "playing") return events;
    var cell = state.board.cells[i];
    if (cell.revealed) return events;
    if (cell.marked && !opts.force) { events.push({ type: "blocked", reason: "marked", idx: i }); return events; }
    if (!opts.initial && !isFrontier(state, i)) { events.push({ type: "illegal", idx: i }); return events; }

    if (cell.def > 0) {
      // Duel.
      var rating = cell.def;
      var cost = Math.max(0, rating - state.player.skill);
      if (cost > state.player.stamina) {
        cell.revealed = true;
        cell.lost = true;
        state.status = "lost";
        events.push({ type: "duel", idx: i, rating: rating, cost: cost, success: false });
        events.push({ type: "gameover", idx: i });
        return events;
      }
      state.player.stamina -= cost;
      state.player.xp += rating;
      cell.revealed = true;
      cell.beaten = true;
      state.ballIdx = i;
      events.push({
        type: "duel", idx: i, rating: rating, cost: cost, success: true,
        stamina: state.player.stamina, xp: state.player.xp,
      });
      handleLevelUp(state, events);
      checkGoal(state, events, [i]);
      return events;
    }

    // Safe cell: reveal + flood-fill cascade.
    cascade(state, i, events);
    state.ballIdx = i;
    var revealed = [];
    for (var e = 0; e < events.length; e++) if (events[e].type === "reveal") revealed.push(events[e].idx);
    checkGoal(state, events, revealed);
    return events;
  }

  function toggleMark(state, i) {
    if (state.status !== "playing") return [];
    var cell = state.board.cells[i];
    if (cell.revealed) return [{ type: "blocked", reason: "revealed", idx: i }];
    cell.marked = !cell.marked;
    return [{ type: "mark", idx: i, marked: cell.marked }];
  }

  var api = {
    rowOf: rowOf, colOf: colOf, index: index, neighbors: neighbors,
    placeBoard: placeBoard, generateBoard: generateBoard,
    hasSafePath: hasSafePath, isSolvable: isSolvable, isWinnable: isWinnable,
    createGame: createGame, revealCell: revealCell, toggleMark: toggleMark,
    isFrontier: isFrontier, isPassable: isPassable, xpToNext: xpToNext,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.OT_GAME = api;
})(typeof window !== "undefined" ? window : globalThis);
