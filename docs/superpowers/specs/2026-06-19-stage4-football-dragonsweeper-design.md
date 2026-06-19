# Stage 4 — Football Dragonsweeper redesign

Status: approved (pillars chosen by user 2026-06-19). Branch: new `stage-4-dragonsweeper`.

## Why
Stages 1-3 made a thin-path "reach the goal" game that a careful player can never lose
(logically solvable + minimal path + level-up healing). The user wants the Dragonsweeper
loop in a football skin: you MUST fight through the defense, manage stamina-as-HP, level
up tactically, and beat the keeper-boss. Loss becomes real because you're forced to engage.

## Core mechanics

### Resources & combat
- **stamina = HP** (the resource you risk), **skill = attack**.
- Beating a defender of **power P** costs `max(0, P - skill)` stamina and grants `+P` XP.
- Attempting a tackle with `cost > stamina` → **loss** (потеря владения, reason 'tackle').
- **Stranded** (no affordable progressing move left) → loss (reason 'stranded').

### Manual level-up (Dragonsweeper-style)
- XP accrues from beaten defenders. Cumulative thresholds (normal): `[4,9,15,22,30,40,52]`.
- When `xp >= nextThreshold`, a **LEVEL UP** control activates. The player taps it when they
  choose → `skill += 1`, `maxStamina += 2`, `stamina = maxStamina` (full heal). Bankable
  (you delay it to heal at the right moment). Total XP on the board is finite → finite heals.
- Logic exposes `canLevelUp(state)` and `levelUp(state)` → returns events `{type:'levelup',...}`.
  Leveling is NO LONGER automatic inside duels.

### Defenders (roster with varied power + roles)
- Field powers 1-4 with role labels + distinct sprites:
  1 Крайний, 2 Опорник, 3 Центральный, 4 Последний.
- **Keeper (boss)**: a single high-power defender at the goal (top-centre), **revealed from the
  start** (like the Dragon). Power: easy 9 / normal 13 / hard 17. Beating it = GOAL (win).
- **pressure** of a safe cell = SUM of adjacent (8-dir) defender powers (keeper included).
  Pressure can be double-digit now → renderer must draw multi-digit numbers.

### Objective & board
- **Win** = beat the keeper (occupy/defeat the goal boss). No thin safe path to row 0.
- Field is tall (pitch-shaped). Presets: easy 7×10, normal 8×12, hard 8×14. Start bottom-centre.
- Generation guarantees **winnable** (resource-aware validator, extended for the new combat,
  manual leveling, and the must-beat-keeper objective). No all-safe path required/expected.
- **Medkit cells**: easy 3 / normal 2 / hard 1, each restores +3 stamina when revealed (safe,
  capped at maxStamina). Marked on the board with a medkit sprite.

### Scouting panel (bestiary analog)
- Shows remaining counts per power on the pitch, the keeper's power, and the skill needed to
  tackle the keeper affordably. Read-only UI fed by a logic helper `scout(state)`.

## CONFIG (preset-driven, all tunable)
```
PRESETS[diff] = {
  label, cols, rows,
  defenders: { p1, p2, p3, p4 },   // counts per power on the field (excl. keeper)
  keeperPower, start:{skill,stamina}, maxStaminaStart,
  xpThresholds:[...], medkits, allowSafePath:false,
}
// resolve(): + goalRow0, startRow rows-1, startCol floor(cols/2), keeperCol floor(cols/2), tile16
```
Concrete (initial, to balance):
- easy:   7×10, defenders {p1:6,p2:4,p3:2,p4:0}, keeperPower 9,  start{skill:1,stamina:7}, medkits 3, xp [4,9,15,22,30]
- normal: 8×12, defenders {p1:8,p2:6,p3:4,p4:2}, keeperPower 13, start{skill:1,stamina:6}, medkits 2, xp [4,9,15,22,30,40,52]
- hard:   8×14, defenders {p1:9,p2:8,p3:6,p4:3}, keeperPower 17, start{skill:1,stamina:5}, medkits 1, xp [5,11,18,26,35,45,57]

## Events / contract additions (renderer/UI consume)
- cell fields gain: `def` becomes `power` (0 = safe); add `kind` ('field'|'keeper'|'medkit'),
  `beaten`, `lost`. Keep `revealed`, `marked`, `pressure`.
- events: `reveal{idx,pressure}`, `duel{idx,power,cost,success,stamina,xp}`,
  `medkit{idx,restored,stamina}`, `levelup{skill,maxStamina,stamina,level}`,
  `goal{idx}` (keeper beaten), `gameover{idx,reason:'tackle'|'stranded',power?,cost?,stamina}`.
- state: `player{skill,stamina,maxStamina,xp,level}`, `status`, `ballIdx`, `keeperIdx`,
  `pendingLevels` (how many level-ups are bankable now). Helpers: `canLevelUp`, `levelUp`,
  `scout`, `isWinnable`, `isStranded`.

## UI polish (from user comments, this stage)
1. **Ball must not obscure the cell it lands on.** Keep the fly-over animation between cells,
   but once the move settles, do NOT draw the ball parked on the revealed cell (so its number/
   contents stay visible). Ball is shown only in transit (and/or as a small marker that doesn't
   cover the digit).
2. **Real desktop layout.** Mobile stays a single column; on wide viewports use a roomy
   Dragonsweeper-style layout — board centre/left with side panels (scouting + HUD + controls)
   instead of a cramped narrow column. Board still scales by integer factor.
3. **i18n, English default.** All UI copy (menu, buttons, rules, cards, banners, scouting,
   HUD labels) goes through a `t(key)` dictionary with `en` + `ru`. **Default language = en**;
   a EN/RU toggle switches at runtime (persist choice in localStorage). Defender role names,
   reasons, etc. localized.
4. **Cleaner pixel font.** Replace/augment Pixelify Sans (looks slightly irregular). Plan:
   bundle a crisp pixel font for Latin (e.g. Press Start 2P) as primary, with a Cyrillic-capable
   pixel font fallback for Russian; verify both scripts read cleanly. font-smoothing off.

## Deferred to Stage 4b (own sprites + design)
- **Captain** (aura +1 to adjacent defenders while alive).
- **Offside-trap** tile.

## Phasing
- A: logic rewrite (subagent) + new sprites (defenders 1-4, keeper, medkit, digits 7-9).
- B: render/UI for the new model (tall field, multi-digit pressure, keeper, scouting panel,
   manual LEVEL UP button, medkit, ball-no-obscure fix).
- C: polish — desktop layout, i18n (EN default), cleaner font.
- 4b later: captain, offside-trap.

## Work split
- Subagent (logic): rewrite js/config.js + js/game.js + tests for the new combat, manual
  leveling, keeper-boss objective, medkits, scouting, winnability validator. No UI, no git.
- Main agent (me): new sprites (defender roles 1-4, keeper, medkit, digits 7-9 + compact
  number renderer), taller-field render, keeper drawing, multi-digit pressure, scouting panel,
  manual LEVEL UP button, HUD. Owns git + integration + Playwright verification.

## Verification
- Node tests green incl. new combat/leveling/keeper/medkit/stranded + every preset winnable.
- In-browser: a real win (beat keeper after farming/leveling) and both loss paths; mobile size.
