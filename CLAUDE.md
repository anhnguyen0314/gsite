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

## Firestore security rules
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /games/{game}/scores/{userId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    match /users/{userId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    match /poker_players/{userId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

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
- Poker: player picks buy-in amount (min 1,000, step 500) in lobby modal before joining; chips deducted from Firestore immediately on join; `pdata.walletChips` = off-table balance; `savePlayerChips(userId, tableChips)` saves `walletChips + tableChips` back to Firestore after each hand or on leave/disconnect

## Site layout & navigation

The site uses a **CrazyGames-style layout**: fixed left sidebar + scrollable main area. This is implemented via `style.css` + `nav.js`.

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
- Injects sidebar HTML into `#sidebar` (logo, nav links, categories, auth area)
- Injects bottom nav HTML into `#bottomNav` plus a `games-sheet` slide-up panel + backdrop into `document.body`
- Exposes `window.updateSidebarAuth(user, data, logoutFn)` — call this from each page's `onAuthStateChanged` to update chip count, show/hide login buttons, bind logout handler
- Active link detection via `window.location.pathname`

### Mobile nav (≤768px)
Uses a **flex-body pattern** — NOT `position: fixed`:
```css
html, body { height: 100%; }
body { display: flex; flex-direction: column; }
.page-layout { flex: 1; min-height: 0; overflow-y: auto; }
.bottom-nav { position: relative; flex-shrink: 0; }
```
Bottom nav is a static flex child — always visible at the bottom of the viewport without needing `position: fixed`. This avoids the bug where `position: fixed` breaks when a parent has `overflow-x`.

**Critical**: `#main-wrap` must have `min-width: 0` on mobile. Without it, flex children default to `min-width: auto`, causing `#main-wrap` to expand to fit carousel content width, which overflows the viewport and breaks the search bar width and carousel scrolling.

### Games sheet (mobile categories panel)
- Slide-up panel injected by `nav.js` with `position: fixed; bottom: 0; transform: translateY(100%)` (hidden)
- Opens by translating `translateY(-58px)` (bottom nav height) — slides up above the nav bar
- Do NOT set `bottom: 58px` — that leaves 58px visible on desktop. Always use `bottom: 0` + translate.

### Carousel touch isolation
```css
.carousel-row {
  display: flex; overflow-x: auto; overflow-y: hidden;
  touch-action: pan-x;
  overscroll-behavior-x: contain;
}
```
`touch-action: pan-x` tells the browser this element handles horizontal swipes — prevents the whole page from scrolling when the user swipes a carousel.

### Per-game gradient CSS classes
Each game has a `.game-thumb` CSS class with a unique gradient background used on the home page cards:
| Class | Gradient |
|---|---|
| `.gt-snake` | `#11998e → #38ef7d` |
| `.gt-chicken` | `#f46b45 → #eea849` |
| `.gt-spaceblaster` | `#0f0c29 → #302b63` |
| `.gt-flappy` | `#56ccf2 → #2f80ed` |
| `.gt-tetris` | `#e96c50 → #e83e8c` |
| `.gt-memory` | `#834d9b → #d04ed6` |
| `.gt-sudoku` | `#1d976c → #93f9b9` |
| `.gt-poker` | `#b79891 → #614385` |
| `.gt-solitaire` | `#134e5e → #71b280` |
| `.gt-blackjack` | `#232526 → #414345` |
| `.gt-snakeio` | `#355c7d → #c06c84` |
| `.gt-dice` | `#f7971e → #ffd200` |

### Utility classes
- `.mobile-only` — `display: none` by default; `display: inline-block` at ≤768px
- `.top-bar-logo` — PlayDen logo shown left of search bar on mobile only

## Design system
- Background `#0c0d14` (page bg) · Surface `#1a1b28` · Border `#2a2a4a` · Accent `#a78bfa` · Button `#7c3aed`
- Font: Segoe UI. Border radius: 12px cards, 8px buttons
- Layout breakpoints: **768px** = mobile layout (sidebar → bottom nav). **600px** = game d-pad shown. **380px** = extra-small cards.
- Top bar: sticky, `background: #0c0d14`, `z-index: 50`

## Standard header pattern
Every game page must use this header structure:

```html
<div class="header">
  <a href="../../index.html" class="back-btn">← Back</a>
  <div class="header-title">🎮 Game Name</div>
  <div class="chip-display">🪙 <span id="chipCount">—</span></div>
</div>
```

Standard header CSS (copy into every new game):
```css
.header {
  width: 100%;
  background: #1a1a2e;
  border-bottom: 1px solid #2a2a4a;
  padding: 12px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.back-btn {
  background: none;
  border: 1px solid #2a2a4a;
  color: #a78bfa;
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 13px;
  text-decoration: none;
}
.back-btn:hover { background: #2a2a4a; }
.header-title { font-size: 18px; font-weight: 700; color: #a78bfa; }
.chip-display {
  background: #0f0f1a;
  border: 1px solid #2a2a4a;
  border-radius: 20px;
  padding: 5px 14px;
  font-size: 13px;
  white-space: nowrap;
}
.chip-display span { font-weight: 700; color: #a78bfa; }
```

**Note for games with a centred body layout** (e.g. Snake, Tetris — `body { align-items: center; padding: 0 20px 20px; }`): make the header break out of the side padding so it spans full width:
```css
.header {
  width: calc(100% + 40px);
  margin-left: -20px;
  margin-right: -20px;
  /* rest of header CSS as above */
}
```

**Chip count display**: in `onAuthStateChanged`, read `users/{userId}.chips` and populate `#chipCount`:
```js
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (user) {
    const snap = await getDoc(doc(db, 'users', user.uid));
    const chips = snap.exists() ? (snap.data().chips || 0) : 0;
    document.getElementById('chipCount').textContent = chips.toLocaleString();
  }
});
```

**Solitaire exception**: keeps stats (Moves, Time) and New Game button in the header alongside the back-btn and `h1` — same visual style, different content.

## Pre-game overlay conventions
Every game must show a pre-game overlay before the first play, explaining chip earning mechanics.

**Standard fullscreen overlay pattern** (Blackjack, Memory Match, Space Blaster, Flappy Bird, Sudoku, Chicken Run, Snake.io):
```html
<div class="overlay hidden" id="overlayStart">
  <div style="font-size:52px">🎮</div>
  <h2>Game Name</h2>
  <p>How to play and how chips are earned.<br>
     <strong>Chip earning details here 🪙</strong></p>
  <button id="btnOverlayStart">Start Game</button>
  <a href="../../index.html" style="color:#a78bfa;font-size:13px;text-decoration:none;margin-top:4px;opacity:0.85">← Back to Arcade</a>
</div>
```

CSS for fullscreen overlay:
```css
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(15,15,26,0.96);
  z-index: 200;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  text-align: center;
  padding: 24px;
}
.overlay.hidden { display: none; }
.overlay h2 { font-size: 26px; font-weight: 700; color: #a78bfa; }
.overlay p  { color: #94a3b8; max-width: 360px; line-height: 1.6; }
```

**Show overlay after auth resolves** (not immediately on page load):
```js
onAuthStateChanged(auth, async u => {
  // ... load chips ...
  document.getElementById('overlayStart').classList.remove('hidden');
});

document.getElementById('btnOverlayStart').addEventListener('click', () => {
  document.getElementById('overlayStart').classList.add('hidden');
  newGame(); // or startGame()
});
```

**Canvas-positioned overlay** (Snake, Tetris — `position: absolute` inside `.canvas-wrap`): same rule applies — add `← Back to Arcade` link below the start button.

**Solitaire**: uses `#start-screen` (fixed fullscreen div) as its pre-game overlay — same `← Back to Arcade` link below Start Game button.

**The `← Back to Arcade` link must always appear below the Start/Play button** in every overlay, on every game. Use:
```html
<a href="../../index.html" style="color:#a78bfa;font-size:13px;text-decoration:none;margin-top:4px;opacity:0.85">← Back to Arcade</a>
```

### Game thumbnail in overlay (required when PNG exists)
Every game that has a PNG thumbnail (`games/{game}/{game}.png`) **must display it inside its own pre-game overlay**, directly above the game title. Use:
```html
<img src="{game}.png" alt="{Game Name}" style="width:140px;height:79px;object-fit:cover;border-radius:10px;margin-bottom:2px;">
```
- Path is relative — the PNG sits in the same folder as the game HTML file.
- Dimensions 140×79px (16:9) at display size; source files should be created at 2× resolution (**392×220px** or **400×225px**).
- This rule applies to new games and retroactively to existing games when their thumbnail PNG is added.

### Thumbnail in index.html game cards
When a game has a PNG thumbnail, replace the emoji + gradient div with an `<img>` tag inside `.game-thumb`:
```html
<div class="game-thumb gt-{game}"><img src="games/{game}/{game}.png" alt="{Game Name}" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit;"></div>
```
Games without a PNG keep the plain emoji inside `.game-thumb` (e.g. `<div class="game-thumb gt-tetris">🟦</div>`).

## Game-specific notes

### Chicken Run (`games/chickenrun/chickenrun.html`)
- **Position system**: chicken uses float pixel position `player.px`. All snapping must be log-relative, NOT screen-grid-relative (logs drift during hop animation).
- **`checkLanding()` water branch**: snap to nearest log-square centre using `lg.x + (sqIdx + 0.5) * CELL`
- **`checkLanding()` non-water branch**: snap to column centre using `player.col = Math.floor(player.px / CELL); player.px = player.col * CELL + CELL * 0.5`
- **`tryMove()` lateral on water**: set `tPx = lg.x + (sqIdx + dc + 0.5) * CELL` (log-relative, not screen grid)
- **Difficulty**: stepped via `diff(row)` → 0 / 0.5 / 1.0 / 1.5 / 2.0 at rows 0 / 30 / 60 / 90 / 120. "⚡ Harder!" toast shown on threshold cross.
- **Bush obstacles**: stored in `ln.bushes[]` on grass lanes. Movement blocked in `tryMove()` before hop. `makeBushes()` always leaves ≥3 free columns and avoids tree columns.
- **Lives**: 1 life only (no extra lives)

### Snake & Tetris
- Both use `window.firestoreSaveScore` and `window.firestoreEarnChips` exposed by a `<script type="module">` block at the bottom of the file
- Chip balance is now read from Firestore in `onAuthStateChanged` and shown in the header `#chipCount`

### Tetris (`games/tetris/tetris.html`)
- **Grid**: `BLOCK=28`, `COLS=12`, `ROWS=22`, canvas `336×616`
- **Layout**: No side panel — compact `.top-panel` horizontal bar above canvas shows Score/Best/Level/Lines/Time/Next piece
- **Rendering**: `setInterval` drives logic ticks; `requestAnimationFrame renderLoop` drives rendering. `current.prevY` saved before gravity tick; draw interpolates `renderY = current.prevY + (current.y - current.prevY) * t`
- **Hard drop (Space)**: `animateHardDrop(targetY)` — steps piece down 1 row every 18ms via `setTimeout` chain (visual animation), then calls `placePiece()`. Sets `paused=true` during animation to block logic tick.
- **Line clear flash**: `clearingRows[]` array, `paused=true` for 220ms, draws white overlay on cleared rows fading by ratio `(flashEnd - Date.now()) / 220`, then `board.splice` + `board.unshift` new empty rows
- **Sounds**: `playPlaceSound()` (soft thud), `playClearSound(numLines)` (ascending arpeggio, scales 1–4 lines), `playHardDropSound()` (square crack + sine sub), `playGameOverSound()` (descending sawtooth 330→220Hz)

### Snake (`games/snake/snake.html`)
- **Color phases**: 5 phases cycling every 50pts — purple (0), cyan (50), green (100), orange (150), red (200). `getPhase(score) = Math.floor(score/50) % PHASES.length`. Defined in `PHASES` array with `head`, `body`, `glow` colors. Score element pulses on phase change.
- **Food**: Two fruits active simultaneously (`foods[]` array of 2). Each is an absolutely-positioned `<span class="food-emoji">` HTML element (NOT canvas `fillText`) — avoids emoji rendering inconsistency across browsers/mobile. Random fruit from `FRUITS` array (🍎🍐🍓🍇🍊🫐🍉🍋🍑🍒). `positionFoodDOM()` computes CSS `left`/`top` using `canvas.clientWidth / canvas.width` scale factor.
- **Food expiry**: Each food has `placedAt: Date.now()` timestamp. After 5s the food is replaced. Visual warning (shrink/pulse) starts at 2.5s remaining. `placedAt` is reset in `beginGame()` (AFTER countdown ends) — not at `initFoods()` — so the timer starts when gameplay actually begins.
- **Smooth movement / head interpolation**: `requestAnimationFrame` loop stores `prevHeadX/prevHeadY` before each logic tick. Rendering interpolates head position. Critical: set `t = 0` (not `elapsed/TICK_MS`) immediately after a tick fires, to prevent the head from snapping backward on the next frame.
- **Explosion on death**: `spawnExplosion(gx, gy, color)` fires 28 canvas particles; `endGame()` runs the particle animation via rAF before showing the game-over overlay.
- **Snake head**: direction-aware eyes drawn with canvas arcs (white + dark pupil). Eye offset computed from `dir.x/dir.y`.
- **Snake body**: tail shrinks slightly, alternates shade for scale texture, fades in opacity toward tail.
- **Sounds**: countdown beeps (`playCountdownBeep`), eat sound (`playEatSound`), phase change (`playPhaseSound`), explosion (`playExplosionSound`) — all via Web Audio API, created lazily on first user gesture.

### Solitaire
- No chip earning during play — earns chips only on win (via Firebase)
- Header keeps Moves + Time counters and New Game button (unique layout)
- `#start-screen` acts as the pre-game overlay

## Conventions
- All code: plain HTML/CSS/JS, no frameworks. Every game = one self-contained `.html` file
- New games: back button to `../../index.html`, mobile-friendly with touch controls
- Firebase config lives in `signup.html`, `login.html`, and `script.js` — update all three if it changes
- Never use backslashes in `href` paths
- Every game must have both a **standard header** (with chip display) and a **pre-game overlay** (with `← Back to Arcade` link) — see sections above

## Poker — architecture notes

### Engine hooks (engine.js)
Three lightweight hooks let server.js react to engine-internal events without modifying core logic:
- `table._onHandStart` — fired at end of `_dealHand`; server uses it to broadcast state + trigger bot
- `table._onAutoAction` — fired after auto-fold timeout in `_startActionTimer`; server calls `handlePostAction`
- `table.lastHandWinnerIds` — set in `_awardPot` to array of winner userIds; server reads this to record wins

### server.js key functions
- `handlePostAction(table)` — unified post-hand handler called by playerAction, triggerBotIfNeeded, and _onAutoAction. On SHOWDOWN: broadcasts state, emits handResult, schedules next hand, saves chips, records win/gamesPlayed for real players
- `savePlayerChips(userId, tableChips)` — skips bots; saves `pdata.walletChips + tableChips` to Firestore
- `recordWin(userId)` / `recordGamePlayed(userId)` — both skip `bot_` prefixed userIds
- `triggerBotIfNeeded(table)` — 1.2–2.2s delayed bot action using `getBotAction()` heuristic; calls `handlePostAction` after

### Bot players
- userId prefixed `bot_` — all Firestore ops skipped for bots
- Added via `socket.emit('addBot')` from game.html when player is alone at table
- Removed automatically when last real player leaves (`table.players = []`)
- Hand strength: preflop uses rank/pair heuristic; postflop uses `evaluateHand`

### Win/stats tracking
- `wins` incremented only for actual pot winners (`table.lastHandWinnerIds`)
- `gamesPlayed` incremented for all real non-winning players at showdown
- Both stored in `poker_players/{userId}` in Firestore

### lobby.html header
`lobby.html` uses the **standard game header** (`.header`, `.back-btn`, `.header-title`, `.chip-display` with `#chipCount`). It does NOT use the old `<nav>` / `navAuth` pattern — those CSS classes were removed in the redesign. The `syncChipsFromFirestore` function updates both `#chipDisplay` (inside rendered content) and `#chipCount` (in the header).

### game.html UI layout (redesigned)
Vertical stack — no oval table:
1. Opponents row: `.opp-pod` components (avatar, name, chips, bet, face-down cards, status badges)
2. Board area: pot pill + state pill + 5 community card slots (54×76px)
3. My area: large hole cards (62×88px) + chip count + bet + status badges
4. Action panel: timer bar (turns red at ≤8s) + raise slider + Fold/Check/Call/Raise/All-in buttons
- Hand result: fixed full-screen overlay `.result-overlay` (z-index 100)

## Git workflow
After every change, give the user these commands to run in the VS Code terminal:

```bash
git add <changed files>
git commit -m "short description of what changed"
git push origin main
```

If push is rejected (non-fast-forward), run:
```bash
git stash
git pull --rebase origin main
git stash pop
git push origin main
```

To check if local and GitHub are in sync:
```bash
git status
```
"Your branch is up to date with 'origin/main'. nothing to commit, working tree clean" = in sync.

**Never `git add .`** without checking `git status` first — avoid accidentally staging `.claude/` or other non-project files. Always stage specific files by name.

**`.gitignore`** must include `.claude/` to prevent accidentally committing Claude's internal worktree/session files.

## Planned next
- Chip spending (cost to play certain games)
- Community: Discord, global leaderboards
- Monetization: Google AdSense, Ko-fi
