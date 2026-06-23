// Capture an Offside Trap "run" as portrait video (1080x1920) + a timing markers json.
// Usage: node capture.js --seed practice:tt:2 --mode goal --out out/goal --delay 300 --holdGoal 2200
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : def;
}
const SEED = arg('seed', 'practice:tt:2');
const MODE = arg('mode', 'goal');          // goal | puzzle | fail
const DIFF = arg('diff', 'normal');        // easy | normal | hard
const OUT = arg('out', 'out/clip');
const DELAY = parseInt(arg('delay', '300'), 10);
const HOLD_GOAL = parseInt(arg('holdGoal', '2200'), 10);
const PUZZLE_HOLD = parseInt(arg('puzzleHold', '2600'), 10);

const BASE = 'http://localhost:8137/index.html';
// IMPORTANT: recordVideo size MUST equal the viewport size, else Playwright pads the frame with
// gray and pins the page to the top-left. Capture at 720x1280 (mobile layout, <900) then upscale
// to 1080x1920 in ffmpeg. dsf=1 keeps the 1:1 mapping.
const VW = 720, VH = 1280;
const VIDEO = { width: VW, height: VH };

const CLEAN_CSS = `
  .app { max-width:none !important; width:100% !important; padding:0 !important; }
  .topbar, .controls, .hint, .seed { display:none !important; }
  body, .app, #screen-game { background:#0B1322 !important; }
  #screen-game { justify-content:flex-start !important; padding:0 !important; gap:0 !important; }
  .hud { margin:0 0 4px 0 !important; padding:6px 10px !important; }
  .board-wrap { width:100% !important; }
  .stage { border-width:2px !important; align-self:center !important; }
`;

(async () => {
  fs.mkdirSync(path.join(__dirname, path.dirname(OUT)), { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({
    viewport: { width: VW, height: VH }, deviceScaleFactor: 2,
    recordVideo: { dir: path.join(__dirname, path.dirname(OUT)), size: VIDEO },
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.OT_DEBUG && window.OT_DEBUG.newGame && window.OT_DEBUG.renderer, null, { timeout: 15000 });
  await page.addStyleTag({ content: CLEAN_CSS });
  await page.evaluate(({ seed, diff }) => {
    window.OT_DEBUG.newGame(diff, seed);
    var r = window.OT_DEBUG.renderer;
    // Stretch the canvas to the FULL viewport width (board fills the frame edge-to-edge). The 320x512
    // internal buffer stays crisp; CSS pixelated upscaling keeps it blocky. Freeze fitTo so a stray
    // resize can't undo it.
    r.fitTo = function () { return this.scale; };
    var cw = window.innerWidth;
    r.canvas.style.width = cw + 'px';
    r.canvas.style.height = Math.round(cw * r.H / r.W) + 'px';
    window.dispatchEvent(new Event('resize'));
  }, { seed: SEED, diff: DIFF });
  await page.waitForTimeout(700);

  const markers = [];
  const t0 = Date.now();
  const mark = (label) => markers.push({ label, t: Date.now() - t0 });
  mark('start');

  // Next safe target: hidden, safe (power 0), frontier; climb upward (min row), tie-break col-distance to keeper.
  const nextStep = () => page.evaluate(() => {
    const st = window.OT_DEBUG.state, b = st.board, cells = b.cells, C = b.cols;
    if (st.status !== 'playing') return { done: true, status: st.status };
    if (window.OT_GAME.isActable(st, b.keeperIdx)) return { keeper: true, keeperIdx: b.keeperIdx };
    const kc = b.keeperIdx % C;
    let best = -1, bestKey = Infinity;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (c.kind === 'keeper' || c.power > 0 || c.revealed) continue;
      if (!window.OT_GAME.isFrontier(st, i)) continue;
      const r = Math.floor(i / C), col = i % C;
      const key = r * 100 + Math.abs(col - kc);
      if (key < bestKey) { bestKey = key; best = i; }
    }
    return best >= 0 ? { next: best } : { stuck: true };
  });

  // FAIL mode: climb safely to the keeper's doorstep, then reveal frontier defenders near the goal
  // (saves absorb the first hits → "SAVE!", the last one with no saves left → CAUGHT one step away).
  const nextFail = () => page.evaluate(() => {
    const st = window.OT_DEBUG.state, b = st.board, cells = b.cells, C = b.cols, G = window.OT_GAME;
    if (st.status !== 'playing') return { done: true, status: st.status };
    const kc = b.keeperIdx % C;
    const keeperActable = G.isActable(st, b.keeperIdx);
    // nearest frontier DEFENDER (hidden mine touching the region), prefer near the keeper
    let dB = -1, dK = Infinity;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (c.kind === 'keeper' || c.revealed || !(c.power > 0)) continue;
      if (!G.isFrontier(st, i)) continue;
      const r = Math.floor(i / C), col = i % C, key = r * 100 + Math.abs(col - kc);
      if (key < dK) { dK = key; dB = i; }
    }
    if (!keeperActable) {                       // still climbing → nearest safe frontier cell
      let best = -1, bk = Infinity;
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        if (c.kind === 'keeper' || c.power > 0 || c.revealed) continue;
        if (!G.isFrontier(st, i)) continue;
        const r = Math.floor(i / C), col = i % C, key = r * 100 + Math.abs(col - kc);
        if (key < bk) { bk = key; best = i; }
      }
      if (best >= 0) return { next: best, saves: st.saves };
    }
    if (dB >= 0) return { kill: dB, saves: st.saves };
    return { stuck: true };
  });

  let steps = 0;
  const maxSteps = 70;
  while (steps < maxSteps) {
    if (MODE === 'fail') {
      const s = await nextFail();
      if (s.done) { mark('over_' + s.status); await page.waitForTimeout(HOLD_GOAL); break; }
      if (s.stuck) { mark('stuck'); await page.waitForTimeout(800); break; }
      if (s.next != null) { await page.evaluate((i) => window.OT_DEBUG.reveal(i), s.next); steps++; await page.waitForTimeout(DELAY); continue; }
      // collapse: reveal a defender (save or caught). Slow beat for tension.
      mark('def_' + s.saves);
      await page.waitForTimeout(620);
      await page.evaluate((i) => window.OT_DEBUG.reveal(i), s.kill);
      steps++;
      await page.waitForTimeout(620);
      continue;
    }
    const s = await nextStep();
    if (s.keeper) {
      await page.waitForTimeout(450);
      mark('preGoal');
      await page.evaluate((k) => window.OT_DEBUG.reveal(k), s.keeperIdx);
      mark('goal');
      await page.waitForTimeout(HOLD_GOAL);
      break;
    }
    if (s.done || s.stuck) { mark('end_' + (s.status || 'stuck')); await page.waitForTimeout(800); break; }
    await page.evaluate((i) => window.OT_DEBUG.reveal(i), s.next);
    steps++;
    // PUZZLE mode: freeze partway for the "guess the path" beat.
    if (MODE === 'puzzle' && steps === 5) { mark('puzzleFreeze'); await page.waitForTimeout(PUZZLE_HOLD); mark('puzzleResume'); }
    await page.waitForTimeout(DELAY);
  }

  // grab a mid screenshot for review
  await page.screenshot({ path: path.join(__dirname, path.dirname(OUT), 'frame.png') });
  const video = page.video();
  await ctx.close();           // finalizes the video file
  const vpath = await video.path();
  const finalWebm = path.join(__dirname, OUT + '.webm');
  fs.renameSync(vpath, finalWebm);
  fs.writeFileSync(path.join(__dirname, OUT + '.markers.json'), JSON.stringify({ seed: SEED, mode: MODE, steps, markers }, null, 2));
  await browser.close();
  console.log('VIDEO', finalWebm);
  console.log('MARKERS', JSON.stringify(markers));
})().catch(e => { console.error(e); process.exit(1); });
