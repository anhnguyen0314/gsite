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

## Design system
- Background `#0f0f1a` · Surface `#1a1a2e` · Border `#2a2a4a` · Accent `#a78bfa` · Button `#7c3aed`
- Font: Segoe UI. Border radius: 12px cards, 8px buttons
- Mobile breakpoint: 600px (single column, d-pads on games). Extra-small: 380px

## Conventions
- All code: plain HTML/CSS/JS, no frameworks. Every game = one self-contained `.html` file
- New games: back button to `../../index.html`, mobile-friendly with touch controls
- Firebase config lives in `signup.html`, `login.html`, and `script.js` — update all three if it changes
- Never use backslashes in `href` paths
- Every game must have a pre-game overlay (shown before first play) that explains how chips are earned. Pattern: `<div class="overlay hidden" id="overlayStart">` — show it after auth resolves, hide on "Start Game" / "Play" button click. Overlay CSS uses fixed fullscreen, `z-index: 200`, same design system colours.

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

## Planned next
- Chip spending (cost to play certain games)
- Community: Discord, global leaderboards
- Monetization: Google AdSense, Ko-fi 