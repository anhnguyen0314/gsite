// ============================================================
//  GameZone Poker Server — Socket.io + Express
// ============================================================
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const admin      = require('firebase-admin');
const { Table, STATE, STAKE_CONFIG, MAX_PLAYERS, STARTING_CHIPS, evaluateHand } = require('./engine');

// ── Firebase Admin init ──────────────────────────────────────
// You'll paste your service account JSON here (from Firebase console)
// Download it from: Firebase Console → Project Settings → Service accounts → Generate new private key
const serviceAccount = require('./serviceAccount.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// ── Express + Socket.io setup ────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => res.send('GameZone Poker Server running ✅'));

// ── Admin API ────────────────────────────────────────────────
// Protected by ADMIN_KEY environment variable.
// Set ADMIN_KEY in Render → Environment before using these endpoints.

function adminAuth(req, res, next) {
  const key = process.env.ADMIN_KEY;
  if (!key) return res.status(503).json({ error: 'ADMIN_KEY not configured on server' });
  if (req.headers['x-admin-key'] !== key) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// GET /admin/users — list all users with chip balances
app.get('/admin/users', adminAuth, async (req, res) => {
  try {
    // Fetch all users from Firebase Auth (paginated, up to 1000)
    const listResult = await admin.auth().listUsers(1000);
    const uids = listResult.users.map(u => u.uid);

    // Batch-fetch Firestore user docs
    const chunks = [];
    for (let i = 0; i < uids.length; i += 10) chunks.push(uids.slice(i, i + 10));
    const firestoreUsers = {};
    for (const chunk of chunks) {
      const refs = chunk.map(uid => db.collection('users').doc(uid));
      const docs = await db.getAll(...refs);
      docs.forEach(d => { if (d.exists) firestoreUsers[d.id] = d.data(); });
    }

    const users = listResult.users.map(u => ({
      uid:      u.uid,
      email:    u.email || '',
      username: firestoreUsers[u.uid]?.username || '(no username)',
      chips:    firestoreUsers[u.uid]?.chips ?? 0,
      created:  u.metadata.creationTime,
      disabled: u.disabled
    }));

    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/chips — set chip balance for a user
// Body: { uid, chips }
app.post('/admin/chips', adminAuth, async (req, res) => {
  const { uid, chips } = req.body;
  if (!uid || chips == null) return res.status(400).json({ error: 'uid and chips required' });
  const amount = parseInt(chips, 10);
  if (isNaN(amount) || amount < 0) return res.status(400).json({ error: 'chips must be a non-negative integer' });
  try {
    await db.collection('users').doc(uid).update({ chips: amount });

    // Keep in-memory state consistent so savePlayerChips doesn't overwrite this value
    const pdata = players.get(uid);
    if (pdata) {
      if (pdata.tableId) {
        // Player is currently at a table — split the admin amount into wallet + table portions
        const table    = tables.get(pdata.tableId);
        const tp       = table ? table.players.find(p => p.userId === uid) : null;
        const tableStack = tp ? tp.chips : 0;
        pdata.walletChips = amount - tableStack; // so wallet + tableStack = amount
      } else {
        pdata.walletChips = undefined; // not at a table; savePlayerChips will use 0
      }
      pdata.chips = amount;
    }

    res.json({ ok: true, uid, chips: amount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/reset-password — send Firebase password reset email
// Body: { email }
app.post('/admin/reset-password', adminAuth, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const link = await admin.auth().generatePasswordResetLink(email);
    res.json({ ok: true, link });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /admin/user — delete user from Auth + Firestore
// Body: { uid }
app.delete('/admin/user', adminAuth, async (req, res) => {
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ error: 'uid required' });
  try {
    await admin.auth().deleteUser(uid);
    await db.collection('users').doc(uid).delete().catch(() => {});
    await db.collection('poker_players').doc(uid).delete().catch(() => {});
    res.json({ ok: true, uid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── In-memory state ──────────────────────────────────────────
const tables  = new Map();   // tableId → Table
const players = new Map();   // userId  → { socketId, username, chips, tableId }

let tableCounter = 1;

// ── Helpers ──────────────────────────────────────────────────
function generateInviteCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function getOrCreatePlayer(userId, username) {
  // Chips live in users/{userId} (shared across all games)
  const userRef   = db.collection('users').doc(userId);
  const userSnap  = await userRef.get();

  let chips = STARTING_CHIPS;
  if (userSnap.exists) {
    chips = userSnap.data().chips ?? STARTING_CHIPS;
  } else {
    // Create user account if it doesn't exist yet
    await userRef.set({
      userId,
      username,
      chips:          STARTING_CHIPS,
      lastDailyBonus: new Date().toDateString(),
      createdAt:      admin.firestore.FieldValue.serverTimestamp()
    });
  }

  // Poker stats live in poker_players/{userId}
  const pokerRef  = db.collection('poker_players').doc(userId);
  const pokerSnap = await pokerRef.get();

  if (!pokerSnap.exists) {
    await pokerRef.set({ userId, username, wins: 0, gamesPlayed: 0 });
    return { chips, wins: 0, gamesPlayed: 0 };
  }

  return { chips, ...pokerSnap.data() };
}

async function savePlayerChips(userId, tableChips) {
  if (userId.startsWith('bot_')) return; // bots have no Firestore entry
  const pdata = players.get(userId);
  // walletChips = chips NOT at the table. Total = wallet + table.
  const walletChips = (pdata && pdata.walletChips != null) ? pdata.walletChips : 0;
  const total = walletChips + tableChips;
  await db.collection('users').doc(userId).update({ chips: total });
  if (pdata) pdata.chips = total;
}

async function recordWin(userId) {
  if (userId.startsWith('bot_')) return;
  await db.collection('poker_players').doc(userId).update({
    wins:        admin.firestore.FieldValue.increment(1),
    gamesPlayed: admin.firestore.FieldValue.increment(1)
  });
}

async function recordGamePlayed(userId) {
  if (userId.startsWith('bot_')) return;
  await db.collection('poker_players').doc(userId).update({
    gamesPlayed: admin.firestore.FieldValue.increment(1)
  });
}

function broadcastTableState(table) {
  for (const p of table.players) {
    const sock = io.sockets.sockets.get(p.socketId);
    if (sock) {
      sock.emit('tableState', table.publicState(p.userId));
    }
  }
}

function broadcastLobbyUpdate() {
  const list = [];
  for (const t of tables.values()) {
    if (!t.isPrivate) list.push(t.lobbyEntry());
  }
  io.emit('lobbyUpdate', list);
}

// ── Shared post-action handler ────────────────────────────────
// Called after any action (human, bot, or auto-timeout) resolves.
async function handlePostAction(table) {
  if (table.state === STATE.SHOWDOWN) {
    // lastHandWinnerIds is set by engine._awardPot — these are the actual winners
    const actualWinnerIds = table.lastHandWinnerIds || [];
    const winnerIds  = actualWinnerIds.filter(uid => !uid.startsWith('bot_'));
    const allRealIds = table.players
      .filter(p => !p.userId.startsWith('bot_'))
      .map(p => p.userId);

    broadcastTableState(table);

    // Build handResult with correct winners (from lastHandWinnerIds) and all revealed hands
    const nonFolded    = table.players.filter(p => p.sitting && !p.folded);
    const folded       = table.players.filter(p => p.sitting && p.folded);
    const pot          = table.lastHandPot || 0;  // set by engine._awardPot
    const winnerCount  = actualWinnerIds.length || 1;
    const share        = Math.floor(pot / winnerCount);
    const isSplit      = actualWinnerIds.length > 1;

    io.to(`table:${table.tableId}`).emit('handResult', {
      // actual pot winners only
      winners: nonFolded
        .filter(p => actualWinnerIds.includes(p.userId))
        .map(p => ({
          userId:   p.userId,
          username: p.username,
          handName: p.handEval ? p.handEval.name : 'Last standing',
          cards:    p.cards,
          won:      share
        })),
      // all non-folded hands revealed (for result overlay and history)
      allPlayers: nonFolded.map(p => ({
        userId:   p.userId,
        username: p.username,
        handName: p.handEval ? p.handEval.name : 'Last standing',
        cards:    p.cards,
        isWinner: actualWinnerIds.includes(p.userId),
        won:      actualWinnerIds.includes(p.userId) ? share : 0
      })),
      // players who folded during this hand
      foldedPlayers: folded.map(p => ({
        userId:   p.userId,
        username: p.username,
        cards:    p.cards
      })),
      pot,
      isSplit,
      community: table.community
    });

    table.scheduleNextHand(async (info, brokePlayers) => {
      // Save chips and record stats for remaining players
      for (const p of table.players) {
        if (!p.userId.startsWith('bot_')) await savePlayerChips(p.userId, p.chips);
      }
      // Winners get wins+gamesPlayed; losers get only gamesPlayed
      for (const uid of winnerIds) await recordWin(uid);
      for (const uid of allRealIds) {
        if (!winnerIds.includes(uid)) await recordGamePlayed(uid);
      }

      // Notify broke players and clean up their server-side state
      for (const p of (brokePlayers || [])) {
        const pdata = players.get(p.userId);
        if (pdata) {
          const sock = io.sockets.sockets.get(pdata.socketId);
          if (sock) sock.emit('brokeOut');
          pdata.tableId      = null;
          pdata.walletChips  = undefined;
        }
      }

      broadcastTableState(table);
      broadcastLobbyUpdate();
      triggerBotIfNeeded(table);
    });
  } else {
    broadcastTableState(table);
    triggerBotIfNeeded(table);
  }
}

// ── Bot logic ─────────────────────────────────────────────────
const RANK_VALUES = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14 };

function getBotHandStrength(bot, community) {
  if (community.length < 3) {
    // Preflop heuristic (evaluateHand needs 5+ cards)
    const [c1, c2] = bot.cards;
    if (!c1 || !c2) return 0;
    const r1 = RANK_VALUES[c1.rank] || 0;
    const r2 = RANK_VALUES[c2.rank] || 0;
    const maxR = Math.max(r1, r2);
    const gap  = Math.abs(r1 - r2);
    const isSuited = c1.suit === c2.suit;
    const isPair = c1.rank === c2.rank;
    if (isPair && maxR >= 9)            return 3; // pocket 9s+
    if (maxR >= 13 && gap <= 3)         return 2; // AK, AQ, KQ
    if (isPair || maxR >= 11)           return 1; // any pair or J+
    if (gap <= 4 && isSuited)           return 1; // suited connectors
    return 0;
  }
  const ev = evaluateHand([...bot.cards, ...community]);
  if (!ev) return 0;
  if (ev.rank >= 5) return 3; // flush or better
  if (ev.rank >= 3) return 2; // set or better
  if (ev.rank >= 1) return 1; // one pair
  return 0;
}

function getBotAction(table, bot) {
  const strength = getBotHandStrength(bot, table.community);
  const toCall   = Math.max(0, table.currentBet - bot.bet);
  const rand     = Math.random();
  const blinds   = table.stakes.bigBlind;
  const minRaise = table.currentBet + blinds;
  const halfPot  = Math.floor(table.pot / 2);

  if (strength === 0) {
    if (toCall === 0) return { action: 'check' };
    if (rand < 0.15)  return { action: 'call' }; // rare bluff-call
    return { action: 'fold' };
  }
  if (strength === 1) {
    if (toCall === 0) return { action: 'check' };
    if (toCall > bot.chips * 0.5) return { action: 'fold' };
    return { action: 'call' };
  }
  if (strength === 2) {
    if (toCall === 0) {
      if (rand < 0.5) {
        const amt = Math.min(minRaise + halfPot, bot.chips + bot.bet);
        if (amt > table.currentBet) return { action: 'raise', amount: amt };
      }
      return { action: 'check' };
    }
    return { action: 'call' };
  }
  // strength === 3: strong hand
  const raiseAmt = Math.min(minRaise + table.pot, bot.chips + bot.bet);
  if (rand < 0.65 && raiseAmt > table.currentBet) return { action: 'raise', amount: raiseAmt };
  if (toCall === 0) return { action: 'check' };
  return { action: 'call' };
}

const BETTING_STATES = [STATE.PREFLOP, STATE.FLOP, STATE.TURN, STATE.RIVER];

function triggerBotIfNeeded(table) {
  if (!BETTING_STATES.includes(table.state)) return;
  const actor = table.players[table.actionIdx];
  if (!actor || !actor.userId.startsWith('bot_')) return;
  if (actor.folded || actor.allIn) return;
  if (table._botActionPending) return;

  table._botActionPending = true;
  const delay = 1200 + Math.random() * 1000; // 1.2–2.2 s

  setTimeout(() => {
    table._botActionPending = false;

    // Re-verify it's still this bot's turn
    if (!BETTING_STATES.includes(table.state)) return;
    const current = table.players[table.actionIdx];
    if (!current || current.userId !== actor.userId) return;

    const { action, amount } = getBotAction(table, actor);
    const result = table.handleAction(actor.userId, action, amount);
    if (!result.ok) return;

    handlePostAction(table);
  }, delay);
}

// ── Socket.io events ─────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // ── auth: player identifies themselves ─────────────────────
  socket.on('auth', async ({ idToken, userId, username }) => {
    try {
      // Verify Firebase ID token
      const decoded = await admin.auth().verifyIdToken(idToken);
      if (decoded.uid !== userId) { socket.emit('error', 'Auth mismatch'); return; }

      const playerData = await getOrCreatePlayer(userId, username);
      players.set(userId, {
        socketId: socket.id,
        userId,
        username,
        chips:   playerData.chips,
        tableId: null
      });
      socket.data.userId = userId;

      socket.emit('authed', {
        userId,
        username,
        chips:       playerData.chips,
        wins:        playerData.wins || 0,
        gamesPlayed: playerData.gamesPlayed || 0
      });

      // Send current lobby
      const publicTables = [];
      for (const t of tables.values()) {
        if (!t.isPrivate) publicTables.push(t.lobbyEntry());
      }
      socket.emit('lobbyUpdate', publicTables);

    } catch (err) {
      console.error('Auth error:', err.message);
      socket.emit('error', 'Authentication failed');
    }
  });

  // ── createTable ────────────────────────────────────────────
  socket.on('createTable', ({ stakeLevel, isPrivate, tableName }) => {
    const userId = socket.data.userId;
    if (!userId || !players.has(userId)) { socket.emit('error', 'Not authenticated'); return; }
    if (!STAKE_CONFIG[stakeLevel]) { socket.emit('error', 'Invalid stake level'); return; }

    const tableId    = `T${tableCounter++}`;
    const inviteCode = isPrivate ? generateInviteCode() : null;
    const name       = (tableName || `Table ${tableId}`).substring(0, 30);

    const table = new Table({ tableId, name, stakeLevel, isPrivate, inviteCode, hostId: userId });
    tables.set(tableId, table);

    socket.emit('tableCreated', { tableId, inviteCode });
    broadcastLobbyUpdate();
  });

  // ── joinTable ──────────────────────────────────────────────
  socket.on('joinTable', async ({ tableId, inviteCode, buyIn }) => {
    const userId = socket.data.userId;
    if (!userId) { socket.emit('error', 'Not authenticated'); return; }

    // If no tableId, find by invite code
    let table = tableId ? tables.get(tableId) : null;
    if (!table && inviteCode) {
      for (const t of tables.values()) {
        if (t.isPrivate && t.inviteCode === inviteCode.toUpperCase()) {
          table = t;
          break;
        }
      }
    }
    if (!table) { socket.emit('error', 'Table not found'); return; }
    if (table.isPrivate && table.inviteCode !== (inviteCode || '').toUpperCase()) {
      socket.emit('error', 'Invalid invite code');
      return;
    }

    const pdata = players.get(userId);
    if (!pdata) { socket.emit('error', 'Player not found'); return; }

    // Check if already at another table
    if (pdata.tableId && pdata.tableId !== tableId) {
      socket.emit('error', 'Leave your current table first');
      return;
    }

    // ── Buy-in validation (only for new joins, not reconnects) ──
    const isRejoining = table.players.some(p => p.userId === userId);
    let actualBuyIn = pdata.chips; // default: all chips (backward compat / reconnect)
    if (!isRejoining) {
      // Validate and normalise buy-in: min 1000, multiples of 500
      actualBuyIn = Math.round((parseInt(buyIn) || 1000) / 500) * 500;
      actualBuyIn = Math.max(1000, actualBuyIn);
      if (actualBuyIn > pdata.chips) {
        socket.emit('error', 'Not enough chips for that buy-in');
        return;
      }
      // Deduct buy-in from wallet immediately in Firestore
      const walletAfter = pdata.chips - actualBuyIn;
      try {
        await db.collection('users').doc(userId).update({ chips: walletAfter });
      } catch (err) {
        console.error('Could not deduct buy-in:', err);
        socket.emit('error', 'Could not process buy-in');
        return;
      }
      pdata.walletChips = walletAfter;
      pdata.chips       = walletAfter; // lobby balance shown = wallet only
    }

    let result = table.addPlayer({
      userId,
      username:  pdata.username,
      socketId:  socket.id,
      chips:     isRejoining ? undefined : actualBuyIn  // undefined → engine keeps existing
    });

    if (!result.ok) {
      if (result.reason === 'Already seated') {
        // Player navigated from lobby → game page; update their socket ID and continue
        table.updateSocket(userId, socket.id);
      } else {
        socket.emit('error', result.reason);
        return;
      }
    }

    pdata.tableId = tableId;
    socket.join(`table:${tableId}`);
    socket.emit('joinedTable', { tableId });
    broadcastTableState(table);
    broadcastLobbyUpdate();

    // Hook up engine callbacks once per table
    if (!table._handCallbackSet) {
      table._handCallbackSet = true;
      // Fired by engine._dealHand — broadcasts fresh hand state to all clients
      table._onHandStart = () => {
        broadcastTableState(table);
        triggerBotIfNeeded(table);
      };
      // Fired by engine._advanceStreet — broadcasts each new street (used for all-in runouts)
      table._onStreetChange = () => {
        broadcastTableState(table);
      };
      // Fired by engine._startActionTimer when a player's clock runs out
      table._onAutoAction = () => {
        handlePostAction(table);
      };
      // Fired by engine._advanceStreet all-in runout setTimeout when showdown is reached
      table._onShowdown = () => {
        handlePostAction(table);
      };
    }
  });

  // ── leaveTable ─────────────────────────────────────────────
  socket.on('leaveTable', async () => {
    const userId = socket.data.userId;
    if (!userId) return;
    const pdata = players.get(userId);
    if (!pdata || !pdata.tableId) return;

    const table = tables.get(pdata.tableId);
    if (table) {
      // Grab chip count before removing from table
      const p = table.players.find(p => p.userId === userId);

      table.removePlayer(userId);
      socket.leave(`table:${pdata.tableId}`);
      broadcastTableState(table);

      // Cash out: save wallet + table chips, clear wallet reservation
      if (p) {
        await savePlayerChips(userId, p.chips); // savePlayerChips adds walletChips internally
      }
      pdata.walletChips = undefined;

      // Remove bots if no real players remain after this leave
      const remainingReal = table.players.filter(p2 => p2.userId !== userId && !p2.userId.startsWith('bot_'));
      if (remainingReal.length === 0) {
        table.players = []; // clear bots too
      }

      // Delete empty tables
      if (table.players.length === 0) tables.delete(pdata.tableId);
      broadcastLobbyUpdate();
    }
    pdata.tableId = null;
  });

  // ── playerAction ───────────────────────────────────────────
  socket.on('playerAction', ({ action, amount }) => {
    const userId = socket.data.userId;
    if (!userId) return;
    const pdata = players.get(userId);
    if (!pdata || !pdata.tableId) return;

    const table = tables.get(pdata.tableId);
    if (!table) return;

    const result = table.handleAction(userId, action, amount);
    if (!result.ok) { socket.emit('error', result.reason); return; }

    handlePostAction(table);
  });

  // ── addBot ─────────────────────────────────────────────────
  socket.on('addBot', () => {
    const userId = socket.data.userId;
    if (!userId) return;
    const pdata = players.get(userId);
    if (!pdata || !pdata.tableId) return;

    const table = tables.get(pdata.tableId);
    if (!table) return;
    if (table.state !== STATE.WAITING) { socket.emit('error', 'Can only add a bot while waiting'); return; }
    if (table.players.length >= MAX_PLAYERS) { socket.emit('error', 'Table is full'); return; }
    if (table.players.some(p => p.userId.startsWith('bot_'))) { socket.emit('error', 'Bot already at table'); return; }

    const botId       = `bot_${table.tableId}_${Date.now()}`;
    const botChips    = Math.max(2000, table.stakes.bigBlind * 40);
    const botUsername = '🤖 Bot';

    const result = table.addPlayer({ userId: botId, username: botUsername, socketId: null, chips: botChips });
    if (!result.ok) { socket.emit('error', result.reason); return; }

    broadcastTableState(table);
    broadcastLobbyUpdate();
    // _onHandStart callback (set in joinTable) will fire when the engine deals the hand
  });

  // ── getPlayerProfile ───────────────────────────────────────
  socket.on('getPlayerProfile', async ({ userId }) => {
    try {
      const snap = await db.collection('poker_players').doc(userId).get();
      if (!snap.exists) { socket.emit('playerProfile', null); return; }

      // Also get leaderboard rank
      const allSnap = await db.collection('poker_players')
        .orderBy('wins', 'desc')
        .get();
      let rank = 1;
      for (const d of allSnap.docs) {
        if (d.id === userId) break;
        rank++;
      }

      socket.emit('playerProfile', { ...snap.data(), rank });
    } catch (err) {
      console.error('Profile error:', err);
      socket.emit('playerProfile', null);
    }
  });

  // ── getPokerLeaderboard ────────────────────────────────────
  socket.on('getPokerLeaderboard', async () => {
    try {
      const snap = await db.collection('poker_players')
        .orderBy('wins', 'desc')
        .limit(10)
        .get();
      const rows = snap.docs.map((d, i) => ({ rank: i + 1, ...d.data() }));
      socket.emit('pokerLeaderboard', rows);
    } catch (err) {
      console.error('Leaderboard error:', err);
      socket.emit('pokerLeaderboard', []);
    }
  });

  // ── disconnect ─────────────────────────────────────────────
  socket.on('disconnect', async () => {
    const userId = socket.data.userId;
    if (!userId) return;

    const pdata = players.get(userId);
    if (!pdata) return;

    // If the player has already reconnected with a new socket, skip cleanup
    // to avoid wiping out the new session's player entry (race condition fix)
    if (pdata.socketId !== socket.id) return;

    if (pdata.tableId) {
      const table = tables.get(pdata.tableId);
      if (table) {
        // Grab chip count before removing
        const p = table.players.find(p => p.userId === userId);

        table.removePlayer(userId);
        broadcastTableState(table);
        // Save wallet + table chips back to Firestore, clear wallet reservation
        if (p) await savePlayerChips(userId, p.chips);
        pdata.walletChips = undefined;
        if (table.players.length === 0) {
          // Delay deletion so a player navigating lobby→game has time to rejoin
          const emptyTableId = pdata.tableId;
          setTimeout(() => {
            const t = tables.get(emptyTableId);
            if (t && t.players.length === 0) {
              tables.delete(emptyTableId);
              broadcastLobbyUpdate();
            }
          }, 15000);
        }
        broadcastLobbyUpdate();
      }
      pdata.tableId = null;
    }
    players.delete(userId);
  });
});

// ── Start server ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Poker server listening on port ${PORT}`);
});
