// ============================================================
//  GameZone Poker Engine — Texas Hold'em
// ============================================================

// ── Deck ────────────────────────────────────────────────────
const RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const SUITS = ['c','d','h','s']; // clubs, diamonds, hearts, spades

function makeDeck() {
  const deck = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      deck.push({ rank, suit });
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// ── Hand Evaluator ───────────────────────────────────────────
// Returns { rank: 0-8, tiebreakers: [...], name: string }
// Higher rank = better hand. Tiebreakers break ties within same rank.

const HAND_NAMES = [
  'High Card', 'One Pair', 'Two Pair', 'Three of a Kind',
  'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'
];

function rankIndex(r) { return RANKS.indexOf(r); }

function evaluateHand(cards) {
  // cards: array of {rank, suit}, 5–7 cards
  // Return best 5-card hand from all combinations
  if (cards.length === 5) return evaluate5(cards);
  const combos = choose(cards, 5);
  let best = null;
  for (const combo of combos) {
    const ev = evaluate5(combo);
    if (!best || compareEval(ev, best) > 0) best = ev;
  }
  return best;
}

function choose(arr, k) {
  if (k === 0) return [[]];
  if (arr.length === k) return [arr.slice()];
  const [first, ...rest] = arr;
  const withFirst = choose(rest, k - 1).map(c => [first, ...c]);
  const withoutFirst = choose(rest, k);
  return [...withFirst, ...withoutFirst];
}

function evaluate5(cards) {
  const ranks = cards.map(c => rankIndex(c.rank)).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);

  // Straight detection (including A-2-3-4-5)
  let isStraight = false;
  let straightHigh = ranks[0];
  if (ranks[0] - ranks[4] === 4 && new Set(ranks).size === 5) {
    isStraight = true;
  } else if (JSON.stringify(ranks) === JSON.stringify([12,3,2,1,0])) {
    // Wheel (A-2-3-4-5)
    isStraight = true;
    straightHigh = 3; // 5-high straight
  }

  // Count rank occurrences
  const count = {};
  for (const r of ranks) count[r] = (count[r] || 0) + 1;
  const groups = Object.entries(count)
    .map(([r, c]) => ({ r: Number(r), c }))
    .sort((a, b) => b.c - a.c || b.r - a.r); // sort by count desc, then rank desc

  if (isFlush && isStraight) {
    return { rank: 8, tiebreakers: [straightHigh], name: 'Straight Flush' };
  }
  if (groups[0].c === 4) {
    return { rank: 7, tiebreakers: [groups[0].r, groups[1].r], name: 'Four of a Kind' };
  }
  if (groups[0].c === 3 && groups[1].c === 2) {
    return { rank: 6, tiebreakers: [groups[0].r, groups[1].r], name: 'Full House' };
  }
  if (isFlush) {
    return { rank: 5, tiebreakers: ranks, name: 'Flush' };
  }
  if (isStraight) {
    return { rank: 4, tiebreakers: [straightHigh], name: 'Straight' };
  }
  if (groups[0].c === 3) {
    const kickers = groups.slice(1).map(g => g.r);
    return { rank: 3, tiebreakers: [groups[0].r, ...kickers], name: 'Three of a Kind' };
  }
  if (groups[0].c === 2 && groups[1].c === 2) {
    const kicker = groups[2].r;
    return { rank: 2, tiebreakers: [Math.max(groups[0].r, groups[1].r), Math.min(groups[0].r, groups[1].r), kicker], name: 'Two Pair' };
  }
  if (groups[0].c === 2) {
    const kickers = groups.slice(1).map(g => g.r);
    return { rank: 1, tiebreakers: [groups[0].r, ...kickers], name: 'One Pair' };
  }
  return { rank: 0, tiebreakers: ranks, name: 'High Card' };
}

function compareEval(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.max(a.tiebreakers.length, b.tiebreakers.length); i++) {
    const diff = (a.tiebreakers[i] || 0) - (b.tiebreakers[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// ── Table constants ──────────────────────────────────────────
const STAKE_CONFIG = {
  low:  { smallBlind: 25,  bigBlind: 50  },
  mid:  { smallBlind: 100, bigBlind: 200 },
  high: { smallBlind: 500, bigBlind: 1000 }
};

const MAX_PLAYERS   = 5;
const STARTING_CHIPS = 10000;
const ACTION_TIMEOUT = 30000; // 30 seconds per action

// ── Table states ─────────────────────────────────────────────
const STATE = {
  WAITING:   'waiting',   // not enough players
  STARTING:  'starting',  // countdown before deal
  PREFLOP:   'preflop',
  FLOP:      'flop',
  TURN:      'turn',
  RIVER:     'river',
  SHOWDOWN:  'showdown'
};

// ── Table class ──────────────────────────────────────────────
class Table {
  constructor({ tableId, name, stakeLevel, isPrivate, inviteCode, hostId }) {
    this.tableId    = tableId;
    this.name       = name;
    this.stakeLevel = stakeLevel;          // 'low' | 'mid' | 'high'
    this.isPrivate  = isPrivate;
    this.inviteCode = inviteCode || null;  // 6-char code for private tables
    this.hostId     = hostId;

    this.players    = [];   // { userId, username, socketId, chips, cards, bet, folded, allIn, sitting }
    this.state      = STATE.WAITING;
    this.deck       = [];
    this.community  = [];   // up to 5 community cards
    this.pot        = 0;
    this.sidePots   = [];
    this.dealerIdx  = -1;
    this.actionIdx  = -1;   // index of player whose turn it is
    this.currentBet = 0;    // highest bet this round
    this.actionTimer = null;
    this.handNumber  = 0;
    this.startTimer  = null;
  }

  get stakes() { return STAKE_CONFIG[this.stakeLevel]; }

  // Public snapshot — what everyone can see
  publicState(viewerUserId = null) {
    return {
      tableId:    this.tableId,
      name:       this.name,
      stakeLevel: this.stakeLevel,
      isPrivate:  this.isPrivate,
      state:      this.state,
      pot:        this.pot,
      sidePots:   this.sidePots,
      community:  this.community,
      currentBet: this.currentBet,
      dealerIdx:  this.dealerIdx,
      actionIdx:  this.actionIdx,
      handNumber: this.handNumber,
      players: this.players.map((p, i) => ({
        userId:   p.userId,
        username: p.username,
        chips:    p.chips,
        bet:      p.bet,
        folded:   p.folded,
        allIn:    p.allIn,
        sitting:  p.sitting,
        // Only show cards to the player themselves, or at showdown
        cards: (p.userId === viewerUserId || this.state === STATE.SHOWDOWN)
          ? p.cards
          : p.cards.map(() => ({ rank: '?', suit: '?' }))
      }))
    };
  }

  lobbyEntry() {
    return {
      tableId:    this.tableId,
      name:       this.name,
      stakeLevel: this.stakeLevel,
      isPrivate:  this.isPrivate,
      playerCount: this.players.filter(p => p.sitting).length,
      maxPlayers:  MAX_PLAYERS,
      state:       this.state,
      blinds:      `${this.stakes.smallBlind}/${this.stakes.bigBlind}`
    };
  }

  // ── Player management ──────────────────────────────────────
  addPlayer({ userId, username, socketId, chips }) {
    if (this.players.length >= MAX_PLAYERS) return { ok: false, reason: 'Table full' };
    if (this.players.find(p => p.userId === userId)) return { ok: false, reason: 'Already seated' };

    this.players.push({
      userId, username, socketId,
      chips:  chips || STARTING_CHIPS,
      cards:  [],
      bet:    0,
      folded: false,
      allIn:  false,
      sitting: true
    });

    this._checkStart();
    return { ok: true };
  }

  removePlayer(userId) {
    const idx = this.players.findIndex(p => p.userId === userId);
    if (idx === -1) return;

    const inHand = this.state !== STATE.WAITING && this.state !== STATE.STARTING;
    if (inHand) {
      // Fold them out if mid-hand
      this.players[idx].folded  = true;
      this.players[idx].sitting = false;
      if (this.actionIdx === idx) this._nextAction();
    } else {
      this.players.splice(idx, 1);
    }

    // If only 1 player left mid-hand, end the hand
    const active = this.players.filter(p => p.sitting && !p.folded);
    if (inHand && active.length === 1) {
      this._awardPot([active[0]]);
    }

    if (this.players.filter(p => p.sitting).length < 2) {
      this.state = STATE.WAITING;
      clearTimeout(this.startTimer);
      clearTimeout(this.actionTimer);
    }
  }

  updateSocket(userId, socketId) {
    const p = this.players.find(p => p.userId === userId);
    if (p) p.socketId = socketId;
  }

  // ── Game flow ──────────────────────────────────────────────
  _checkStart() {
    const seated = this.players.filter(p => p.sitting).length;
    if (seated >= 2 && this.state === STATE.WAITING) {
      this.state = STATE.STARTING;
      this.startTimer = setTimeout(() => this._dealHand(), 3000);
    }
  }

  _dealHand() {
    const seated = this.players.filter(p => p.sitting);
    if (seated.length < 2) { this.state = STATE.WAITING; return; }

    this.handNumber++;
    this.deck      = shuffle(makeDeck());
    this.community = [];
    this.pot       = 0;
    this.sidePots  = [];
    this.currentBet = 0;

    // Reset player hand state
    for (const p of this.players) {
      p.cards  = [];
      p.bet    = 0;
      p.folded = false;
      p.allIn  = false;
    }

    // Advance dealer button (only among sitting players)
    const sittingIdx = this.players
      .map((p, i) => p.sitting ? i : -1)
      .filter(i => i >= 0);

    const prevDealerPos = sittingIdx.indexOf(this.dealerIdx);
    this.dealerIdx = sittingIdx[(prevDealerPos + 1) % sittingIdx.length];

    // Deal 2 hole cards each
    for (let i = 0; i < 2; i++)
      for (const p of this.players.filter(p => p.sitting))
        p.cards.push(this.deck.pop());

    // Post blinds
    const sbIdx = this._nextSittingAfter(this.dealerIdx);
    const bbIdx = this._nextSittingAfter(sbIdx);
    this._postBlind(sbIdx, this.stakes.smallBlind);
    this._postBlind(bbIdx, this.stakes.bigBlind);
    this.currentBet = this.stakes.bigBlind;

    this.state = STATE.PREFLOP;
    // Action starts left of big blind
    this.actionIdx = this._nextSittingAfter(bbIdx);
    this._startActionTimer();
    return { sbIdx, bbIdx };
  }

  _postBlind(playerIdx, amount) {
    const p = this.players[playerIdx];
    const actual = Math.min(amount, p.chips);
    p.chips -= actual;
    p.bet   += actual;
    this.pot += actual;
    if (p.chips === 0) p.allIn = true;
  }

  _nextSittingAfter(idx) {
    const len = this.players.length;
    for (let i = 1; i <= len; i++) {
      const next = (idx + i) % len;
      if (this.players[next].sitting && !this.players[next].folded) return next;
    }
    return idx;
  }

  // ── Actions ────────────────────────────────────────────────
  handleAction(userId, action, amount) {
    const p = this.players[this.actionIdx];
    if (!p || p.userId !== userId) return { ok: false, reason: 'Not your turn' };
    if (p.folded || p.allIn) return { ok: false, reason: 'Cannot act' };

    clearTimeout(this.actionTimer);

    switch (action) {
      case 'fold':
        p.folded = true;
        break;

      case 'check':
        if (p.bet < this.currentBet) return { ok: false, reason: 'Cannot check — must call or raise' };
        break;

      case 'call': {
        const toCall = Math.min(this.currentBet - p.bet, p.chips);
        p.chips -= toCall;
        p.bet   += toCall;
        this.pot += toCall;
        if (p.chips === 0) p.allIn = true;
        break;
      }

      case 'raise': {
        const minRaise = this.currentBet + this.stakes.bigBlind;
        if (amount < minRaise && amount < p.chips + p.bet) return { ok: false, reason: `Minimum raise is ${minRaise}` };
        const extra = Math.min(amount - p.bet, p.chips);
        p.chips -= extra;
        p.bet   += extra;
        this.pot += extra;
        this.currentBet = p.bet;
        if (p.chips === 0) p.allIn = true;
        break;
      }

      case 'allin': {
        const allInAmt = p.chips;
        p.chips  = 0;
        p.bet   += allInAmt;
        this.pot += allInAmt;
        if (p.bet > this.currentBet) this.currentBet = p.bet;
        p.allIn = true;
        break;
      }

      default:
        return { ok: false, reason: 'Unknown action' };
    }

    this._nextAction();
    return { ok: true };
  }

  _nextAction() {
    // Check if betting round is over
    if (this._bettingRoundOver()) {
      this._advanceStreet();
      return;
    }

    // Find next player who can act
    const len = this.players.length;
    let next = (this.actionIdx + 1) % len;
    for (let i = 0; i < len; i++) {
      const p = this.players[next];
      if (p.sitting && !p.folded && !p.allIn) {
        this.actionIdx = next;
        this._startActionTimer();
        return;
      }
      next = (next + 1) % len;
    }
    // All remaining players are all-in or folded — run out the board
    this._advanceStreet();
  }

  _bettingRoundOver() {
    const active = this.players.filter(p => p.sitting && !p.folded && !p.allIn);
    if (active.length === 0) return true;
    // Everyone has matched the current bet (or folded/all-in)
    return active.every(p => p.bet === this.currentBet);
  }

  _advanceStreet() {
    clearTimeout(this.actionTimer);

    // Check if only one player left
    const nonFolded = this.players.filter(p => p.sitting && !p.folded);
    if (nonFolded.length === 1) {
      this._awardPot(nonFolded);
      return;
    }

    // Reset bets for new street
    for (const p of this.players) p.bet = 0;
    this.currentBet = 0;

    if (this.state === STATE.PREFLOP) {
      this.community.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
      this.state = STATE.FLOP;
    } else if (this.state === STATE.FLOP) {
      this.community.push(this.deck.pop());
      this.state = STATE.TURN;
    } else if (this.state === STATE.TURN) {
      this.community.push(this.deck.pop());
      this.state = STATE.RIVER;
    } else if (this.state === STATE.RIVER) {
      this._showdown();
      return;
    }

    // Set action to first active player left of dealer
    this.actionIdx = this._nextSittingAfter(this.dealerIdx);
    this._startActionTimer();
  }

  _showdown() {
    this.state = STATE.SHOWDOWN;
    const contenders = this.players.filter(p => p.sitting && !p.folded);

    // Evaluate all hands
    for (const p of contenders) {
      p.handEval = evaluateHand([...p.cards, ...this.community]);
    }

    // Simple pot award (no side pot splitting for now — keep it simple)
    contenders.sort((a, b) => compareEval(b.handEval, a.handEval));
    const winners = [contenders[0]];
    // Handle ties
    for (let i = 1; i < contenders.length; i++) {
      if (compareEval(contenders[i].handEval, contenders[0].handEval) === 0)
        winners.push(contenders[i]);
    }

    this._awardPot(winners);
  }

  _awardPot(winners) {
    const share = Math.floor(this.pot / winners.length);
    const remainder = this.pot - share * winners.length;
    for (const w of winners) w.chips += share;
    if (remainder > 0) winners[0].chips += remainder; // extra chip to first winner

    this.state = STATE.SHOWDOWN;

    // Return result snapshot (caller should emit this then schedule next hand)
    const result = {
      winners: winners.map(w => ({
        userId:   w.userId,
        username: w.username,
        handName: w.handEval ? w.handEval.name : 'Last standing',
        won:      share
      })),
      pot: this.pot
    };

    this.pot = 0;
    return result;
  }

  _startActionTimer() {
    clearTimeout(this.actionTimer);
    this.actionTimer = setTimeout(() => {
      // Auto-fold on timeout
      const p = this.players[this.actionIdx];
      if (p) p.folded = true;
      this._nextAction();
    }, ACTION_TIMEOUT);
  }

  // Called by server after showdown to set up next hand
  scheduleNextHand(callback, delay = 5000) {
    setTimeout(() => {
      // Remove broke players (0 chips)
      this.players = this.players.filter(p => {
        if (p.chips === 0) { p.sitting = false; return false; }
        return true;
      });
      if (this.players.filter(p => p.sitting).length >= 2) {
        const info = this._dealHand();
        callback(info);
      } else {
        this.state = STATE.WAITING;
        callback(null);
      }
    }, delay);
  }
}

module.exports = { Table, STATE, STAKE_CONFIG, MAX_PLAYERS, STARTING_CHIPS, evaluateHand };
