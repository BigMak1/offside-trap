# Stage 3 — Difficulty rework + full pixel-art UI + rules screen

Status: approved 2026-06-19. Branch: `stage-3-difficulty-pixel-ui`.

## Goal
Make the daily game genuinely losable, let the player pick a difficulty, and bring the
whole UI (title menu, HUD, buttons, overlays) into the same pixel-art look as the pitch.
Keep everything CONFIG-driven so board size / difficulty / levels stay easy to tune.

## 1. Difficulty model — "you must beat defenders"
Replace the old guarantee ("a fully-safe path exists") with a **resource-aware winnability
guarantee**, and on Normal/Hard remove the free safe route so at least one duel is forced.

### CONFIG shape (js/config.js)
```
PRESETS = {
  easy:   { label:'Лёгкий',  cols:8,  rows:7, defenders:{r1:5,r2:3,r3:1},
            start:{skill:1,stamina:6}, xpThresholds:[3,7,12,18,25],
            offsideRowChoices:[2,3],   offsideBias:0.60, allowSafePath:true },
  normal: { label:'Норма',   cols:10, rows:8, defenders:{r1:7,r2:5,r3:2},
            start:{skill:1,stamina:5}, xpThresholds:[3,7,12,18,25],
            offsideRowChoices:[2,3],   offsideBias:0.65, allowSafePath:false },
  hard:   { label:'Сложный', cols:11, rows:9, defenders:{r1:8,r2:7,r3:3},
            start:{skill:1,stamina:4}, xpThresholds:[4,9,15,22,30],
            offsideRowChoices:[2,3,4], offsideBias:0.70, allowSafePath:false },
}
CONFIG = { difficulty:'normal', presets:PRESETS, resolve(key) }
```
`resolve(key)` returns a flat cfg = `{...PRESETS[key||normal], difficulty:key, goalRow:0,
startRow:rows-1, startCol:floor(cols/2), tile:16, maxGenAttempts:600}`. Daily board uses
`normal`. The selected difficulty is passed from the menu (and via `?diff=easy|normal|hard`).

### Generation contract (js/game.js)
- `hasSafePath(board)` — existing safe-only 8-dir BFS start→row0 (rename of `isSolvable`,
  keep an alias).
- `isWinnable(board, cfg)` — **sound** bounded best-first search over states
  `{beaten:bitmask, skill, stamina, xp, level, reachable}`. Safe cells flood for free and only
  expand reach; a frontier defender of rating r costs `max(0,r-skill)` stamina (must be
  affordable), beating it grants `+r` xp → level-ups (refill stamina, +1 max, +1 skill).
  Returns true iff some sequence reaches row 0 without stamina going negative. Prune
  dominated states (same/sub-set beaten with ≤ skill & ≤ stamina); cap explored nodes
  (~50k) — if cap hit, return false (conservative). `true ⇒ board is beatable by real play`.
- `generateBoard(seedKey, cfg)` accepts a board only if `isWinnable` AND
  (`cfg.allowSafePath ? hasSafePath : !hasSafePath`). If no board satisfies the safe-path
  constraint within `maxGenAttempts`, **gracefully fall back** to winnable-only (never throw);
  expose `board.forcedDuel = !hasSafePath(board)`.
- Determinism unchanged (seed variants `offside:<key>:<attempt>`).

### Why it creates losses
No free walk on Normal/Hard → you must spend stamina; misjudging the offside line or
burning stamina on the wrong defenders leaves you unable to afford a later duel = game over.

## 2. Screens & flow (js/main.js)
Screen state machine: `title → difficulty → game`, plus a `rules` overlay reachable from
title and game. `?diff=` / `?day=` / `?debug=1` still work and can skip straight to game.
- **Title:** pixel logo + night-stadium pixel backdrop; buttons ИГРАТЬ / СЛОЖНОСТЬ / ПРАВИЛА.
- **Difficulty:** three pixel cards (label + tiny stat line: поле, защитники, стамина).
- **Game:** pixel HUD panels + pixel buttons (Маркер, Заново, Меню, CRT, Debug).
- **Rules overlay:** concise illustrated rules using existing sprites (ходьба-дриблинг,
  смысл числа, обыгрыш/стоимость, победа = ворота, поражение = нет стамины).

## 3. Pixel-art UI tech (styles.css, index.html, assets)
- Bundle a **CC0 Cyrillic pixel font** (Pixel Operator) as `@font-face` in `assets/font/`;
  `font-smooth:never`, `-webkit-font-smoothing:none`. All UI text uses it.
- **9-slice pixel sprites** for buttons (idle/active) and panels, generated via the
  pixel-art-gen pipeline in the same 13-colour palette; applied as CSS `border-image`
  (`border-image-repeat: stretch` won't blur because source is pixel + `image-rendering`
  is irrelevant for border-image; use small slices so scaling stays blocky) — verify
  visually. Title logo + backdrop are PNG sprites too.
- No gradients / smooth rounded chrome. Palette stays in CSS vars; integer scaling;
  `image-rendering: pixelated` on all sprite imagery.

## 4. Flexibility
Everything tunable lives in `PRESETS`. New preset key → new difficulty card appears
automatically (menu iterates `CONFIG.presets`).

## 5. Work split (uses subagents, per user request)
- **Subagent (logic track):** edit ONLY `js/config.js`, `js/game.js`, `tests/logic.test.js`.
  Implement PRESETS+resolve, `isWinnable`, generation contract, keep/extend Node tests
  (all green). Must NOT touch UI files and MUST NOT run git.
- **Main agent (me, UI track):** pixel font + 9-slice button/panel/logo/backdrop assets,
  title/difficulty/rules screens, pixel-styled HUD/buttons, screen state machine in
  `js/main.js`, render tweaks for variable board size.
- File sets are disjoint (logic: config/game/tests; UI: html/css/main/render/assets) → safe
  to run in parallel. I own all git commits and final integration.

## 6. Verification
- `node tests/logic.test.js` green; new tests for `isWinnable`, "Normal has no safe path",
  "every preset generates winnable boards", determinism.
- Playwright visual QA (mobile viewport) of title/difficulty/rules/game, plus win + lose
  flows still work. Delete screenshots after QA (repo hygiene).
