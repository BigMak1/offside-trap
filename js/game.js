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

  function placeBoard(rnd, cfg) {
    var rows = cfg.rows, cols = cfg.cols, n = rows * cols;
    var cells = new Array(n);
    for (var i = 0; i < n; i++) {
      cells[i] = { def: 0, pressure: 0, revealed: false, marked: false, beaten: false, lost: false };
    }
    var startIdx = index(cfg.startRow, cfg.startCol, cols);
    var offsideRow = RNG.pick(cfg.offsideRowChoices, rnd);

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

    // pressure = sum of neighbour ratings (only meaningful for safe cells)
    for (var p = 0; p < n; p++) {
      if (cells[p].def > 0) continue;
      var sum = 0, nb = neighbors(p, rows, cols);
      for (var q = 0; q < nb.length; q++) sum += cells[nb[q]].def;
      cells[p].pressure = sum;
    }

    return { cells: cells, startIdx: startIdx, offsideRow: offsideRow, rows: rows, cols: cols };
  }

  // A connected SAFE (defender-free, 8-dir) path must exist from start to row 0.
  function isSolvable(board) {
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

  // Deterministically search seed variants until a solvable board is found.
  function generateBoard(seedKey, cfg) {
    cfg = cfg || CONFIG;
    for (var attempt = 0; attempt < cfg.maxGenAttempts; attempt++) {
      var seed = RNG.hashStr("offside:" + seedKey + ":" + attempt);
      var rnd = RNG.mulberry32(seed);
      var board = placeBoard(rnd, cfg);
      if (isSolvable(board)) { board.attempt = attempt; board.seedKey = seedKey; return board; }
    }
    throw new Error("No solvable board found for " + seedKey);
  }

  // ── game state + actions ──────────────────────────────────────────────────
  function createGame(seedKey, cfg) {
    cfg = cfg || CONFIG;
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
    placeBoard: placeBoard, isSolvable: isSolvable, generateBoard: generateBoard,
    createGame: createGame, revealCell: revealCell, toggleMark: toggleMark,
    isFrontier: isFrontier, isPassable: isPassable, xpToNext: xpToNext,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.OT_GAME = api;
})(typeof window !== "undefined" ? window : globalThis);
