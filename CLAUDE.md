# GameZone — Project Context

## What this project is
A browser-based gaming website called **GameZone** with multiple game categories, user accounts, score saving, and real-time multiplayer. All games are custom-built using HTML, CSS, and JavaScript.

## My background
- Complete beginner — no prior coding experience
- Relying on Claude to write all code
- Goal: build an audience and community

## Tech stack
| Layer | Tool | Cost |
|---|---|---|
| Code editor | VS Code | Free |
| Version control | GitHub | Free |
| Static hosting | GitHub Pages | Free |
| Backend / Auth | Firebase (live) | Free tier |
| Multiplayer server | Socket.io + Render.com (planned) | Free tier |
| Domain | GitHub Pages subdomain for now | Free |

## File structure
```
my-gaming-site/
├── index.html
├── style.css
├── script.js           (Firebase auth state — updates nav on every page)
├── login.html          (live — Firebase email/password login + forgot password)
├── signup.html         (live — Firebase email/password sign-up)
├── leaderboard.html    (live — top 10 per game, Snake + Tetris + Solitaire tabs)
└── games/
    ├── snake/
    │   └── snake.html
    ├── tetris/
    │   └── tetris.html
    └── solitaire/
        └── solitaire.html
```

## Path conventions
- Always use **forward slashes** in file paths (e.g. `games/snake/snake.html`)
- Games are nested two levels deep, so back links use `../../index.html`
- Root-level files (index.html, style.css) are referenced directly by filename

## Game categories (current)
The site is organized by **genre**, not by platform:
- 🕹️ **Arcade** — Snake (live), Space Blaster (placeholder), Endless Run (placeholder)
- 🧩 **Puzzle** — Tetris (live), Star Match (placeholder), Memory Match (placeholder)
- 🃏 **Card** — Card Legends (placeholder), Solitaire (live), Blackjack (placeholder)
- 🌐 **Multiplayer** — Battle Arena, Dice Duel, Quiz Clash (all placeholders — requires Firebase + Socket.io)

## Games built so far
### Solitaire (`games/solitaire/solitaire.html`)
- Klondike Solitaire — click to select, click to place
- Tracks: moves, timer
- Leaderboard metric: completion time (lower = better), ordered ascending
- Double-tap any card to auto-send to foundation
- Saves completion time to Firestore on win via `window.firestoreSaveTime` (only if faster than personal best)
- Mobile friendly
- Back link: `../../index.html`

### Snake (`games/snake/snake.html`)
- HTML5 Canvas game
- Tracks: score, best score (localStorage), timer
- Mobile friendly: d-pad controls appear on screens under 600px
- Back link: `../../index.html`

### Tetris (`games/tetris/tetris.html`)
- HTML5 Canvas game
- Tracks: score, best score (localStorage), level, lines cleared, timer
- Features: ghost piece, next piece preview, speed increases per level
- Mobile friendly: d-pad controls appear on screens under 600px
- Back link: `../../index.html`

## Design system
- **Color scheme**: dark purple/navy theme
  - Background: `#0f0f1a`
  - Surface: `#1a1a2e`
  - Border: `#2a2a4a`
  - Accent: `#a78bfa` (purple)
  - Primary button: `#7c3aed`
- **Font**: Segoe UI, sans-serif
- **Border radius**: 12px for cards, 8px for buttons
- **Mobile breakpoint**: 600px (single column layout, d-pads on games)
- **Extra small breakpoint**: 380px (single column game grid)

## Design principles
- All games must be mobile friendly
- Each game is a self-contained HTML file
- Games save best scores to `localStorage`
- Placeholder game cards exist on the homepage for planned games
- Multiplayer games link to `signup.html` until accounts are built

## Completed phases
1. ✅ **Core site** — homepage, game grid, design system, nav
2. ✅ **Games** — Snake and Tetris (both live with localStorage best scores)
3. ✅ **User accounts** — Firebase Auth (email/password sign-up, login, logout, forgot password)
   - Firebase project: `gamezone-6487a`
   - Auth method enabled: Email/Password
   - Nav auto-updates to show username + Log Out when signed in
   - `script.js` watches auth state on every page load
4. ✅ **Score saving** — Firebase Firestore (per-user best scores + leaderboard)
   - Firestore data structure: `games/{game}/scores/{userId}`
   - Scores saved at game over only if logged in and score beats personal best
   - `leaderboard.html` shows top 10 per game (Snake + Tetris + Solitaire tabs)
   - Snake and Tetris both updated to save scores via `window.firestoreSaveScore`
   - Solitaire saves completion time via `window.firestoreSaveTime` (ascending — fastest wins)
   - Leaderboard is game-aware: Snake/Tetris order by score DESC, Solitaire orders by time ASC and displays as M:SS
5. ✅ **More games** — Solitaire live (Blackjack, Memory Match, Space Blaster still planned)

## Completed phases (continued)
6. ✅ **Real-time multiplayer poker** — Texas Hold'em with Socket.io + Node.js backend
   - Server files: `poker-server/package.json`, `poker-server/engine.js`, `poker-server/server.js`
   - Client files: `games/poker/lobby.html`, `games/poker/game.html`
   - Firestore collection: `poker_players/{userId}` — stores chips, wins, gamesPlayed, lastRefillDate
   - Token system: 10,000 starting chips; daily refill to 10,000 if balance < 1,000
   - Table types: low (25/50 blinds), mid (100/200), high (500/1000)
   - Tables: public (browsable in lobby) or private (6-char invite code)
   - Max 5 players per table; game auto-starts when 2+ seated
   - Full Texas Hold'em: hole cards, flop/turn/river, hand evaluator, showdown
   - Player actions: fold, check, call, raise, all-in; 30-second action timer
   - Leaderboard metric: most wins (tracked in Firestore)
   - `index.html` Battle Arena card → now links to `games/poker/lobby.html`
   - **Deployed on Render.com**: `https://gamezone-poker.onrender.com`
   - SERVER_URL is set in lobby.html, game.html, and account.html

## Completed phases (continued)
7. ✅ **Account page** — `account.html`
   - Shows avatar (initial letter), username, email, member badge
   - Poker stats: chip balance, wins, games played, win rate
   - Leaderboard rank (by wins, pulled live from Firestore)
   - Best scores for Snake (pts), Tetris (pts), Solitaire (M:SS)
   - Low-chip warning when balance < 1,000
   - Username in nav is now a link to account.html (handled in script.js)
   - Account link added to index.html nav

## Completed phases (continued)
8. ✅ **Site-wide chip economy**
   - Chips moved from `poker_players/{userId}` to `users/{userId}` (shared across all games)
   - Firestore structure: `users/{userId}` — chips, lastDailyBonus, username, createdAt
   - Daily login bonus: +500 chips on first login each day (handled in script.js via toast)
   - New users start with 1,000 chips
   - Snake: +100 chips per full minute played (shown on game over screen)
   - Tetris: +100 chips per 1,000 points scored (shown on game over screen)
   - Poker server updated to read/write chips from `users/` not `poker_players/`
   - Poker stats (wins, gamesPlayed) still tracked in `poker_players/{userId}`
   - account.html updated: shows total chips + chip earning rates for each game
   - Chip earning uses `window.firestoreEarnChips(amount)` pattern (same as firestoreSaveScore)

## Planned next phases
1. **More games** — Memory Match, Blackjack, Space Blaster
2. **Chip spending** — define which games cost chips to play and how much
3. **Community** — Discord server, global leaderboards
4. **Monetization** — Google AdSense, Ko-fi donations

## Conventions Claude should follow
- Write all code in plain HTML, CSS, and JavaScript — no frameworks
- Every game is a single self-contained `.html` file
- Always use forward slashes in file paths
- Keep the dark purple design theme consistent across all pages
- All new games must include a back button linking to `../../index.html`
- All new games must be mobile friendly with touch controls where needed
- Use `localStorage` for best score persistence until Firestore is set up
- Firebase SDK version in use: **10.12.2** (loaded via CDN, modular/ESM style)
- All Firebase config is duplicated in `signup.html`, `login.html`, and `script.js` — update all three if config changes
- Never use backslashes in `href` paths
