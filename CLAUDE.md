# GameZone — Project Context

## Stack
Plain HTML/CSS/JS. No frameworks. Firebase 10.12.2 (CDN, modular/ESM). Socket.io + Node.js on Render.com. Hosted on GitHub Pages.
Firebase project: `gamezone-6487a`. Auth method: Email/Password.

## File structure
```
my-gaming-site/
├── index.html
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
    ├── tetris/tetris.html
    ├── solitaire/solitaire.html
    └── poker/lobby.html + game.html
```

## Path conventions
- Always forward slashes in paths
- Games are 2 levels deep → back links use `../../index.html`

## Live games
| Game | File | Score hook | Chip hook | Metric |
|---|---|---|---|---|
| Snake | `games/snake/snake.html` | `window.firestoreSaveScore` | `window.firestoreEarnChips` | points, higher=better |
| Tetris | `games/tetris/tetris.html` | `window.firestoreSaveScore` | `window.firestoreEarnChips` | points, higher=better |
| Solitaire | `games/solitaire/solitaire.html` | `window.firestoreSaveTime` | — | seconds, lower=better |
| Poker | `games/poker/lobby.html` + `game.html` | — | read/write `users/{userId}.chips` | wins + gamesPlayed |

Poker server: `https://gamezone-poker.onrender.com` — SERVER_URL must be updated in `lobby.html`, `game.html`, and `account.html` if URL changes.

## Firestore structure
```
users/{userId}          chips, lastDailyBonus, username, createdAt
games/{game}/scores/{userId}   userId, username, score, updatedAt
poker_players/{userId}  userId, username, wins, gamesPlayed
```
Snake/Tetris score = points (DESC). Solitaire score = seconds (ASC).

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
- Poker: chips deducted on buy-in, saved back after each hand

## Design system
- Background `#0f0f1a` · Surface `#1a1a2e` · Border `#2a2a4a` · Accent `#a78bfa` · Button `#7c3aed`
- Font: Segoe UI. Border radius: 12px cards, 8px buttons
- Mobile breakpoint: 600px (single column, d-pads on games). Extra-small: 380px

## Conventions
- All code: plain HTML/CSS/JS, no frameworks. Every game = one self-contained `.html` file
- New games: back button to `../../index.html`, mobile-friendly with touch controls
- Firebase config lives in `signup.html`, `login.html`, and `script.js` — update all three if it changes
- Never use backslashes in `href` paths

## Planned next
- More games: Memory Match, Blackjack, Space Blaster
- Chip spending (cost to play certain games)
- Community: Discord, global leaderboards
- Monetization: Google AdSense, Ko-fi
