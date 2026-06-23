// Polish raw capture webms into TikTok-ready 1080x1920 mp4s (EN + RU).
// Text → transparent PNG layers (Pillow) composited via `overlay` (this ffmpeg lacks drawtext).
// EN uses Silkscreen, RU uses Tiny5 (has Cyrillic). Music = the game's own track.
// Usage: node polish.js <key> <lang>   |   node polish.js all
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const PROJ = '/Users/mkonovalov/Documents/VS_code_projects/ITMO/Offside_Trap';
const SIL = path.join(HERE, 'silkscreen-700.ttf');
const TINY = path.join(HERE, 'tiny5.ttf');
const MUSIC = path.join(PROJ, 'assets/audio/menu-music.mp3');
const dur = (f) => parseFloat(execFileSync('ffprobe', ['-v','error','-show_entries','format=duration','-of','csv=p=0', f]).toString().trim());

// shared geometry; text is filled in per language
const END_GEO = [
  { y: 720, size: 110, fill: 'accent' },                 // OFFSIDE TRAP
  { y: 900, size: 46, fill: 'white' },                   // sub
  { y: 985, size: 38, fill: 'white' },                   // url
  { y: 1085, size: 44, fill: 'accent' },                 // link line
];
const URL = 'OFFSIDE-TRAP.VERCEL.APP';

function zip(geo, texts) { return geo.map((g, i) => Object.assign({}, g, { text: texts[i] })); }

// num, capture file, timings, and per-language texts (hook geo shared, text per lang)
const SPECS = {
  clutch: {
    num: '01', in: 'out/goal4.webm', hookTo: 2.9, endLen: 2.4,
    hookGeo: [{ y: 150, size: 40, fill: 'white', box: 0.78, stroke: 5 }, { y: 250, size: 92, fill: 'accent', box: 0.82 }, { y: 372, size: 92, fill: 'accent', box: 0.82 }],
    en: { hook: ['FOOTBALL x MINESWEEPER', 'ONE WRONG TAP', '= CAUGHT'], endSub: 'PLAY FREE IN BROWSER', endLink: 'LINK IN BIO' },
    ru: { hook: ['ФУТБОЛ x САПЁР', 'ОДИН НЕВЕРНЫЙ ТАП', '= ПОЙМАЛИ'], endSub: 'ИГРАЙ В БРАУЗЕРЕ', endLink: 'ССЫЛКА В ПРОФИЛЕ' },
  },
  puzzle: {
    num: '02', in: 'out/puzzle.webm', hookTo: 4.4, endLen: 2.4,
    hookGeo: [{ y: 230, size: 84, fill: 'white', box: 0.82 }, { y: 348, size: 84, fill: 'accent', box: 0.82 }, { y: 470, size: 38, fill: 'white', box: 0.78, stroke: 5 }],
    en: { hook: ['CAN YOU FIND', 'THE SAFE PATH?', 'READ THE NUMBERS'], endSub: 'FOOTBALL MINESWEEPER', endLink: 'LINK IN BIO' },
    ru: { hook: ['НАЙДЁШЬ', 'БЕЗОПАСНЫЙ ПУТЬ?', 'ЧИТАЙ ЦИФРЫ'], endSub: 'ФУТБОЛ-САПЁР', endLink: 'ССЫЛКА В ПРОФИЛЕ' },
  },
  ai: {
    num: '03', in: 'out/ai.webm', hookTo: 3.0, endLen: 2.4, midFrom: 3.2, midTo: 5.7,
    hookGeo: [{ y: 250, size: 70, fill: 'white', box: 0.82 }, { y: 360, size: 84, fill: 'accent', box: 0.82 }],
    midGeo: [{ y: 250, size: 66, fill: 'white', box: 0.82 }, { y: 362, size: 70, fill: 'accent', box: 0.82 }],
    en: { hook: ['I BUILT THIS GAME', 'USING ONLY AI'], mid: ['ART . CODE . SFX', 'ALL AI-GENERATED'], endSub: 'MADE WITH AI', endLink: 'LINK IN BIO' },
    ru: { hook: ['Я СДЕЛАЛ ЭТУ ИГРУ', 'ТОЛЬКО НА AI'], mid: ['АРТ. КОД. ЗВУК', 'ВСЁ СДЕЛАЛ AI'], endSub: 'СДЕЛАНО НА AI', endLink: 'ССЫЛКА В ПРОФИЛЕ' },
  },
  sat: {
    num: '04', in: 'out/sat.webm', hookTo: 2.8, endLen: 2.4,
    hookGeo: [{ y: 250, size: 86, fill: 'accent', box: 0.82 }, { y: 372, size: 70, fill: 'white', box: 0.82 }],
    en: { hook: ['ODDLY SATISFYING', 'PIXEL FOOTBALL'], endSub: 'PLAY FREE IN BROWSER', endLink: 'LINK IN BIO' },
    ru: { hook: ['ЗАЛИПАТЕЛЬНО', 'ПИКСЕЛЬНЫЙ ФУТБОЛ'], endSub: 'ИГРАЙ В БРАУЗЕРЕ', endLink: 'ССЫЛКА В ПРОФИЛЕ' },
  },
  fail: {
    num: '05', in: 'out/fail.webm', hookTo: 2.8, endLen: 2.6,
    hookGeo: [{ y: 250, size: 78, fill: 'white', box: 0.82 }, { y: 360, size: 84, fill: 'accent', box: 0.82 }],
    en: { hook: ['ALMOST...', 'ONE STEP FROM GOAL'], endSub: 'PIXEL FOOTBALL', endLink: 'LINK IN BIO' },
    ru: { hook: ['ОБИДНО...', 'В ШАГЕ ОТ ГОЛА'], endSub: 'ФУТБОЛ-САПЁР', endLink: 'ССЫЛКА В ПРОФИЛЕ' },
  },
};

function makeCfg(key, lang) {
  const sp = SPECS[key], L = sp[lang];
  const font = lang === 'ru' ? TINY : SIL;
  const suffix = lang === 'ru' ? '-RU' : '';
  const cfg = {
    in: sp.in, out: `final/${sp.num}-${key}${suffix}.mp4`, music: MUSIC,
    hookTo: sp.hookTo, endLen: sp.endLen, midFrom: sp.midFrom, midTo: sp.midTo,
    layers: {
      out_dir: path.join(HERE, `layers/${sp.num}${suffix}`), font,
      hook: zip(sp.hookGeo, L.hook),
      end_scrim: 0.62,
      end: zip(END_GEO, ['OFFSIDE TRAP', L.endSub, URL, L.endLink]),
    },
  };
  if (sp.midGeo && L.mid) cfg.layers.mid = zip(sp.midGeo, L.mid);
  return cfg;
}

function build(key, lang) {
  const cfg = makeCfg(key, lang);
  const inPath = path.join(HERE, cfg.in);
  const outPath = path.join(HERE, cfg.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const D = dur(inPath);
  const endFrom = (D - cfg.endLen).toFixed(2);

  execFileSync('python3', [path.join(HERE, 'mktext.py'), JSON.stringify(cfg.layers)], { stdio: 'inherit' });
  const hook = path.join(cfg.layers.out_dir, 'hook.png');
  const end = path.join(cfg.layers.out_dir, 'end.png');
  const mid = path.join(cfg.layers.out_dir, 'mid.png');
  const hasMid = fs.existsSync(mid) && cfg.midFrom != null;

  // Bound every looping image input with -t D, else multiple infinite -loop inputs deadlock ffmpeg.
  const DT = D.toFixed(2);
  const inputs = ['-i', inPath, '-loop','1','-t', DT,'-i', hook];
  let fc = `[0:v]scale=1080:1920:flags=neighbor,setsar=1[bg];[bg][1:v]overlay=enable=between(t\\,0\\,${cfg.hookTo})[o1]`;
  let last = 'o1', idx = 2;
  if (hasMid) {
    inputs.push('-loop','1','-t', DT,'-i', mid);
    fc += `;[${last}][${idx}:v]overlay=enable=between(t\\,${cfg.midFrom}\\,${cfg.midTo})[o${idx}]`;
    last = 'o' + idx; idx++;
  }
  inputs.push('-loop','1','-t', DT,'-i', end);
  fc += `;[${last}][${idx}:v]overlay=enable=gte(t\\,${endFrom})[v]`;
  const musicIdx = idx + 1;
  inputs.push('-i', cfg.music);
  fc += `;[${musicIdx}:a]atrim=0:${D.toFixed(2)},afade=t=in:st=0:d=0.4,afade=t=out:st=${(D-1.0).toFixed(2)}:d=1.0,volume=0.9[a]`;

  const args = ['-y', ...inputs, '-filter_complex', fc, '-map','[v]','-map','[a]',
    '-c:v','libx264','-profile:v','high','-pix_fmt','yuv420p','-r','30','-b:v','7M',
    '-c:a','aac','-b:a','160k','-movflags','+faststart','-t', D.toFixed(2), outPath];
  execFileSync('ffmpeg', args, { stdio: ['ignore','ignore','inherit'] });
  console.log('WROTE', cfg.out, 'dur', D);
}

const a = process.argv.slice(2);
if (a[0] === 'all') {
  for (const k of Object.keys(SPECS)) for (const lang of ['en','ru']) build(k, lang);
} else {
  build(a[0] || 'clutch', a[1] || 'en');
}
