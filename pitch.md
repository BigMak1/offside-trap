# Offside Trap — itch.io page kit

Everything to make the page **bigmak1.itch.io/offside-trap** look sharp.
Assets live in `dist/itch-assets/` (gitignored). Rebuild the GIF/screenshots anytime
with the steps at the bottom.

---

## 1. Assets — what to upload where

| itch field | File | Notes |
|---|---|---|
| **Cover image** | `cover-630x500.png` | Exactly 630×500 — the thumbnail in listings & embeds. |
| **Gameplay GIF** | `gameplay.gif` | 640×1024, loops a full dribble → goal. Put it at the **top of the Description**, not as the cover (animated covers autoplay tiny). |
| **Screenshots** | `screenshot-1-menu-en.png`, `-2-gameplay.png`, `-3-playbook.png`, `-4-menu-ru.png` | 3–5 is the sweet spot. Order: gameplay → playbook → menu. |

> The cover is the #1 click driver. The GIF is the #1 *play* driver once they're on the page.

---

## 2. Page theme (Edit theme)

Match the game's "sunny stadium" palette so the page and the game feel like one thing:

| Setting | Value |
|---|---|
| Background | `#0E2A18` (deep pitch green) |
| Text | `#F4F6EA` (warm white) |
| Link color | `#FFD23F` (gold) |
| Secondary / borders | `#1F5237` |
| Layout | **Embed in page** (game shows above the fold) |
| Header / cover behind title | optional: enable "darken background image" if you add one |

Keep it flat and high-contrast — it mirrors the game's pixel UI. Avoid the default light theme; a dark green page makes the bright pitch pop.

---

## 3. Embed settings (the playable frame)

- **Viewport:** `540 × 960` (portrait — the board is 10×15, taller than wide).
- ✅ **Mobile friendly** — orientation *Default* or *Portrait*.
- ✅ **Fullscreen button**.
- ⬜ **Automatically start on page load** — leave OFF (browsers block audio until a tap; an explicit "click to play" frame is cleaner).
- On the `html5` upload, tick **"This file will be played in the browser"** (butler uploads the files; this flag is set in the UI once).

---

## 4. Title & tagline

- **Title:** `Offside Trap`
- **Tagline (Short description):** `Football minesweeper — read the numbers, find the safe path, beat the keeper.`

---

## 5. Description — paste this

> Drop the GIF in first (Editor → image button → upload `gameplay.gif`), then paste the text below.

```
A football-themed minesweeper. The defenders are mines — read the numbers to
deduce the safe path up the pitch, then dribble the ball to the keeper to score.

▶ How to play
• Open a cell next to the ball. A NUMBER = how many defenders sit in the 8
  surrounding cells.
• A 0 opens up a whole area. Use the numbers to tell safe grass from defenders.
• Step on a defender and you're caught — unless you've banked a SAVE (gloves).
• Grab SAVES and SCOUTS (a free safe-cell reveal) along the path.
• Reach the KEEPER at the top to score the goal.
• Long-press / right-click to drop a CONE on a cell you suspect.

★ Features
• Pure deduction — every board has a guaranteed safe path, so it's always solvable.
• A daily challenge + three difficulties (Easy / Normal / Hard).
• Handcrafted pixel art, chiptune SFX and a stadium atmosphere.
• English & Russian. Plays in the browser on desktop and mobile.

No install, no tracking — just open and play. ⚽
```

itch's editor supports headings and bold — feel free to make "How to play" / "Features"
real `H3` headers and bold the KEYWORDS for scannability.

---

## 6. Tags (up to 10 — pick from these)

`minesweeper`, `deduction`, `puzzle`, `logic`, `football`, `soccer`, `pixel-art`,
`singleplayer`, `mobile`, `daily`

Genre dropdown: **Puzzle**.

---

## 7. "More information" fields (boost discovery)

| Field | Value |
|---|---|
| Made with | Vanilla HTML5 / JavaScript (hand-written, no engine) |
| Inputs | Mouse, Touch |
| Languages | English, Russian |
| Accessibility | One-handed / touch friendly; colour + number coded |
| Average session | A few minutes |
| AI disclosure | **Yes** — pixel art via PixelLab, AI-generated music/ambience |

---

## 8. Pricing

- **Suggested price** e.g. `$2.00`, model **"No minimum (pay what you want)"** → minimum `$0`.
- Result: free to play, with a visible **Support / Name your price** button.
- ❗ Not "No payments" (kills donations). Connect a payout method in account settings to actually receive tips.

---

## 9. Community

**Comments** on — lightweight feedback under the page. (Discussion board is overkill for a small game.)

---

## Rebuilding the assets

- **Game build + push:** `./build-itch.sh` then `dist/push-itch.sh [version]` (butler).
- **GIF / screenshots** were captured from the live game via the browser; if you want
  fresh ones, re-run the capture (drive `window.OT_DEBUG` to play, screenshot the
  `#game` canvas, then `gifski --fps 14 -o gameplay.gif frames/*.png`).
