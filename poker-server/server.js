// ============================================================
//  GameZone Poker Server — Socket.io + Express
// ============================================================
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const admin      = require('firebase-admin');
const { Table, STATE, STAKE_CONFIG, MAX_PLAYERS, STARTING_CHIPS } = require('./engine');

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

async function savePlayerChips(userId, chips) {
  await db.collection('users').doc(userId).update({ chips });
}

async function recordWin(userId) {
  await db.collection('poker_players').doc(userId).update({
    wins:        admin.firestore.FieldValue.increment(1),
    gamesPlayed: admin.firestore.FieldValue.increment(1)
  });
}

async function recordGamePlayed(userId) {
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
  socket.on('joinTable', async ({ tableId, inviteCode }) => {
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

    let result = table.addPlayer({
      userId,
      username:  pdata.username,
      socketId:  socket.id,
      chips:     pdata.chips
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

    // Hook up next-hand callback once
    if (!table._handCallbackSet) {
      table._handCallbackSet = true;
      table._onHandDone = async (result, winnerIds) => {
        // Save chip counts and record wins
        for (const p of table.players) {
          await savePlayerChips(p.userId, p.chips);
          const pinfo = players.get(p.userId);
          if (pinfo) pinfo.chips = p.chips;
        }
        if (winnerIds) {
          for (const uid of winnerIds) await recordWin(uid);
        }
        broadcastTableState(table);
        broadcastLobbyUpdate();
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
      table.removePlayer(userId);
      socket.leave(`table:${pdata.tableId}`);
      broadcastTableState(table);

      // Save chips
      const p = table.players.find(p => p.userId === userId);
      if (p) {
        await savePlayerChips(userId, p.chips);
        pdata.chips = p.chips;
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

    // After action: check if showdown/hand ended
    if (table.state === STATE.SHOWDOWN) {
      const winnerIds = table.players
        .filter(p => p.chips > 0)
        .map(p => p.userId);

      broadcastTableState(table);
      io.to(`table:${table.tableId}`).emit('handResult', {
        winners: table.players.filter(p => !p.folded && p.sitting).map(p => ({
          userId:   p.userId,
          username: p.username,
          handName: p.handEval ? p.handEval.name : 'Last standing',
          cards:    p.cards
        })),
        community: table.community
      });

      // Save and schedule next hand
      table.scheduleNextHand(async (info) => {
        for (const p of table.players) {
          await savePlayerChips(p.userId, p.chips);
          const pinfo = players.get(p.userId);
          if (pinfo) pinfo.chips = p.chips;
        }
        for (const uid of winnerIds) await recordWin(uid);
        broadcastTableState(table);
        broadcastLobbyUpdate();
      });
    } else {
      broadcastTableState(table);
    }
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
        table.removePlayer(userId);
        broadcastTableState(table);
        // Save chips back to Firestore
        const p = table.players.find(p => p.userId === userId);
        if (p) await savePlayerChips(userId, p.chips);
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
