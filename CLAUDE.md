# PlayDen — Project Context

## Stack
Plain HTML/CSS/JS. No frameworks. Firebase 10.12.2 (CDN, modular/ESM). Socket.io + Node.js on Render.com. Hosted on GitHub Pages.
Firebase project: `gamezone-6487a`. Auth method: Email/Password.

## File structure
```
my-gaming-site/
├── index.html
├── about.html / privacy.html
├── style.css
├── script.js           (auth state + daily chip bonus — runs on every page except account/lobby/game)
├── login.html / signup.html
├── leaderboard.html    (top 10 per game — Snake, Tetris, Solitaire tabs)
├── account.html        (profile, chip balance, game stats)
├── chips.html          (chip economy explainer)
├── poker-server/
│   ├── engine.js       (Texas Hold'em logic + hand evaluator)
│   ├── server.js       (Socket.io server — deployed on Render.com)
│   └── serviceAccount.json  (secret — .gitignored, uploaded to Render)
└── games/
    ├── snake/snake.html
    ├── snakeio/snakeio.html    (multiplayer, Socket.io server)
    ├── tetris/tetris.html
    ├── solitaire/solitaire.html
    ├── poker/lobby.html + game.html
    ├── blackjack/blackjack.html
    ├── spaceblaster/spaceblaster.html
    ├── memorymatch/memorymatch.html
    ├── flappybird/flappybird.html
    ├── chickenrun/chickenrun.html
    └── sudoku/sudoku.html
```

## Path conventions
- Always forward slashes in paths
- Games are 2 levels deep → back links use `../../index.html`

## Live games
| Game | File | Score hook | Chip hook | Metric |
|---|---|---|---|---|
| Snake | `games/snake/snake.html` | `window.firestoreSaveScore` | `window.firestoreEarnChips` | points, higher=better |
| Snake.io | `games/snakeio/snakeio.html` | socket `saveScore` → server | server-side via `scoreSaved` event | score (kills-based), higher=better |
| Tetris | `games/tetris/tetris.html` | `window.firestoreSaveScore` | `window.firestoreEarnChips` | points, higher=better |
| Solitaire | `games/solitaire/solitaire.html` | `window.firestoreSaveTime` | — | seconds, lower=better |
| Poker | `games/poker/lobby.html` + `game.html` | — | read/write `users/{userId}.chips` | wins + gamesPlayed |
| Blackjack | `games/blackjack/blackjack.html` | inline `saveScore` | inline `persistChips` | session net chips won, higher=better |
| Space Blaster | `games/spaceblaster/spaceblaster.html` | inline `saveScore` | inline `earnChips` (+50/kill, +200/wave) | score (kills × wave), higher=better |
| Memory Match | `games/memorymatch/memorymatch.html` | inline `saveScore` | inline `addChips` (formula: pairs×50×diff - extra moves + time bonus) | chips earned, higher=better |
| Flappy Bird | `games/flappybird/flappybird.html` | inline `saveScore` | inline `earnChips` (+20/pipe) | pipes passed, higher=better |
| Chicken Run | `games/chickenrun/chickenrun.html` | — | inline `updateDoc` chips increment | rows crossed (milestone rewards) |
| Sudoku | `games/sudoku/sudoku.html` | inline `saveScore` | inline `earnChips` (base 500/800/1000 per diff, minus mistake/hint penalty) | chips earned, higher=better |

Poker server: `https://gamezone-poker.onrender.com` — SERVER_URL must be updated in `lobby.html`, `game.html`, and `account.html` if URL changes.

## Firestore structure
```
users/{userId}          chips, lastDailyBonus, username, createdAt
games/{game}/scores/{userId}   userId, username, score, updatedAt
poker_players/{userId}  userId, username, wins, gamesPlayed
```
Snake/Tetris score = points (DESC). Solitaire score = seconds (ASC).

- `users/{userId}.username` = display name set at signup — **cannot be changed** (enforced by UI warning at signup)

## Chip economy
- Balance in `users/{userId}.chips` — shared across all games
- New account: 1,000 chips. Daily login bonus: +500 (script.js on most pages; lobby.html and account.html have their own copy)
- Snake: +100/minute. Tetris: +100 per 1,000 pts. Both via `window.firestoreEarnChips(amount)`
- Snake.io: chips determined server-side on death, returned via `scoreSaved` socket event
- Flappy Bird: +20 per pipe passed
- Space Blaster: +50/kill, +200/wave cleared
- Memory Match: pairs×50×diff_multiplier − 10×extra_moves + time_bonus (up to 200)
- Blackjack: betting — win/lose chips each hand; Blackjack pays 3:2
- Chicken Run: row milestones → row 10: +15, row 25: +30, row 50: +60, row 100: +120, row 200: +250, row 500: +600
- Sudoku: base 500 (easy) / 800 (medium) / 1,000 (hard), minus 5% per mistake and 10% per hint used
- Poker: player picks buy-in (min 1,000, step 500) in lobby modal; chips deducted on join; `pdata.walletChips` = off-table balance; `savePlayerChips(userId, tableChips)` saves `walletChips + tableChips` back after each hand or on leave/disconnect

## Site layout & navigation

CrazyGames-style layout: fixed left sidebar + scrollable main area via `style.css` + `nav.js`.

### Page structure (all non-game pages)
```html
<div class="page-layout">
  <div id="sidebar"></div>   <!-- populated by nav.js -->
  <div id="main-wrap">
    <div class="top-bar">...</div>
    <div class="main-content">...</div>
    <footer>...</footer>
  </div>
</div>
<nav class="bottom-nav" id="bottomNav"></nav>  <!-- mobile only, populated by nav.js -->
<script src="nav.js"></script>
<script type="module" src="script.js"></script>
```

### nav.js responsibilities
- Loaded as a **plain `<script>` (not module)** — runs synchronously before Firebase
- Injects sidebar HTML into `#sidebar`, bottom nav into `#bottomNav`, and `games-sheet` panel into `document.body`
- Exposes `window.updateSidebarAuth(user, data, logoutFn)` — call from each page's `onAuthStateChanged`
- Active link detection via `window.location.pathname`

### Mobile nav (≤768px) — flex-body pattern
```css
html, body { height: 100%; }
body { display: flex; flex-direction: column; }
.page-layout { flex: 1; min-height: 0; overflow-y: auto; }
.bottom-nav { position: relative; flex-shrink: 0; }
```
Bottom nav is a static flex child — avoids `position: fixed` breaking under `overflow-x` parents.

**Critical**: `#main-wrap` must have `min-width: 0` on mobile — otherwise flex children expand to fit carousel content and overflow the viewport.

### Games sheet (mobile categories panel)
Hidden with `position: fixed; bottom: 0; transform: translateY(100%)`. Opens by translating `translateY(-58px)`.
**Do NOT use `bottom: 58px`** — that leaves a gap on desktop. Always use `bottom: 0` + translate.

### Carousel touch isolation
Use `touch-action: pan-x` and `overscroll-behavior-x: contain` on `.carousel-row` to prevent page scroll when swiping carousels.

## Design system
- Background `#0c0d14` · Surface `#1a1b28` · Border `#2a2a4a` · Accent `#a78bfa` · Button `#7c3aed`
- Font: Segoe UI. Border radius: 12px cards, 8px buttons
- Breakpoints: **768px** = mobile (sidebar → bottom nav). **600px** = game d-pad shown. **380px** = extra-small cards.
- Top bar: sticky, `background: #0c0d14`, `z-index: 50`

## Standard header pattern
Every game page must use: `back-btn` (← Back) + `header-title` (game name) + `chip-display` (🪙 chip count). See any existing game for the CSS — it's identical across all games.

For games with centred body layout (Snake, Tetris), the header needs `width: calc(100% + 40px); margin-left: -20px; margin-right: -20px` to span full width.

**Solitaire exception**: header contains Moves + Time + New Game button instead of chip display.

## Pre-game overlay conventions
Every game must show a pre-game overlay before first play explaining chip mechanics. Key rules:
- Show overlay **after auth resolves** (inside `onAuthStateChanged`), not on page load
- Always include `← Back to Arcade` link (`href="../../index.html"`) below the Start button
- **Canvas-positioned overlay** (Snake, Tetris): `position: absolute` inside `.canvas-wrap`
- **Fullscreen overlay** (all others): `position: fixed; inset: 0`
- **Solitaire**: uses `#start-screen` div as its overlay

### Thumbnail in overlay (required when PNG exists)
Every game with a PNG at `games/{game}/{game}.png` must display it in its overlay above the title:
```html
<img src="{game}.png" alt="{Game Name}" style="width:140px;height:79px;object-fit:cover;border-radius:10px;margin-bottom:2px;">
```
PNG sits in the same folder as the game HTML. Display 140×79px; source files at 2× (**400×225px**).

The overlay title (`<h2>`) must be plain text — no emoji prefix.

### Thumbnail in index.html game cards
When a game has a PNG, replace the emoji inside `.game-thumb` with an `<img>`:
```html
<div class="game-thumb gt-{game}"><img src="games/{game}/{game}.png" alt="{Game Name}" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit;"></div>
```

## Game-specific notes

### Chicken Run (`games/chickenrun/chickenrun.html`)
- **Position system**: chicken uses float pixel position `player.px`. All snapping must be log-relative, NOT screen-grid-relative (logs drift during hop animation).
- **`checkLanding()` water branch**: snap using `lg.x + (sqIdx + 0.5) * CELL`
- **`checkLanding()` non-water branch**: `player.col = Math.floor(player.px / CELL); player.px = player.col * CELL + CELL * 0.5`
- **`tryMove()` lateral on water**: `tPx = lg.x + (sqIdx + dc + 0.5) * CELL` (log-relative, not screen grid)
- **Difficulty**: stepped via `diff(row)` → 0 / 0.5 / 1.0 / 1.5 / 2.0 at rows 0 / 30 / 60 / 90 / 120
- **Bush obstacles**: stored in `ln.bushes[]` on grass lanes. `makeBushes()` always leaves ≥3 free columns and avoids tree columns.
- **Lives**: 1 life only

### Tetris (`games/tetris/tetris.html`)
- **Grid**: `BLOCK=28`, `COLS=12`, `ROWS=22`, canvas `336×616`
- **Layout**: compact `.top-panel` horizontal bar above canvas (no side panel)
- **Rendering**: `setInterval` for logic ticks; `requestAnimationFrame renderLoop` for rendering with sub-tick interpolation via `current.prevY`
- **Hard drop**: `animateHardDrop(targetY)` — visual animation then `placePiece()`, sets `paused=true` during animation
- **Line clear flash**: `clearingRows[]`, `paused=true` for 220ms, white overlay fades then rows removed

### Snake (`games/snake/snake.html`)
- **Food**: Two HTML `<span class="food-emoji">` elements (not canvas) — avoids cross-browser emoji inconsistency. `positionFoodDOM()` uses `canvas.clientWidth / canvas.width` scale factor.
- **Food expiry**: `placedAt` reset in `beginGame()` AFTER countdown — not at `initFoods()` — so timer starts when gameplay begins.
- **Smooth movement**: set `t = 0` immediately after a tick fires (not `elapsed/TICK_MS`) to prevent head snapping backward on next frame.
- **Color phases**: 5 phases cycling every 50pts via `getPhase(score) = Math.floor(score/50) % PHASES.length`

### Solitaire
- No chip earning during play — only on win
- Header: Moves + Time + New Game button (unique layout)
- `#start-screen` = pre-game overlay

## Conventions
- All code: plain HTML/CSS/JS, no frameworks. Every game = one self-contained `.html` file
- New games: back button to `../../index.html`, mobile-friendly with touch controls
- Firebase config lives in `signup.html`, `login.html`, and `script.js` — update all three if it changes
- Never use backslashes in `href` paths
- Every game must have a **standard header** (chip display) and **pre-game overlay** (`← Back to Arcade` link)

## Poker — architecture notes

### Engine hooks (engine.js)
- `table._onHandStart` — fired at end of `_dealHand`; server broadcasts state + triggers bot
- `table._onAutoAction` — fired after auto-fold timeout; server calls `handlePostAction`
- `table.lastHandWinnerIds` — set in `_awardPot`; server reads to record wins

### server.js key functions
- `handlePostAction(table)` — unified post-hand handler (playerAction, triggerBotIfNeeded, _onAutoAction). On SHOWDOWN: broadcasts state, emits handResult, schedules next hand, saves chips, records wins
- `savePlayerChips(userId, tableChips)` — skips bots; saves `pdata.walletChips + tableChips`
- `recordWin(userId)` / `recordGamePlayed(userId)` — both skip `bot_` prefixed userIds
- `triggerBotIfNeeded(table)` — 1.2–2.2s delayed bot action via `getBotAction()` heuristic

### Bot players
- userId prefixed `bot_` — all Firestore ops skipped
- Added via `socket.emit('addBot')` when player is alone; removed when last real player leaves

### game.html UI layout
Vertical stack: opponents row → board (pot + 5 community cards) → my area (hole cards + chips) → action panel (timer bar + raise slider + buttons). Hand result: `.result-overlay` fullscreen (z-index 100).

## Git workflow
After every change, give the user these commands:

```bash
git add <changed files>
git commit -m "short description"
git push origin main
```

If push is rejected: `git stash` → `git pull --rebase origin main` → `git stash pop` → `git push origin main`

**Never `git add .`** without checking `git status` first. Stage specific files by name. `.gitignore` must include `.claude/`.

## Planned next
- Chip spending (cost to play certain games)
- Community: Discord, global leaderboards
- Monetization: Google AdSense, Ko-fi
