/**
 * nav.js — shared sidebar + bottom nav component for root-level pages.
 * Loaded as a plain <script> (not module) so it runs synchronously.
 * Each page's Firebase module calls window.updateSidebarAuth(user, data)
 * after auth resolves.
 */
(function () {
  const sidebar = document.getElementById('sidebar');
  const bottomNav = document.getElementById('bottomNav');

  // Detect active page from URL
  const filename = window.location.pathname.split('/').pop().replace('.html', '') || 'index';

  function active(page) {
    return filename === page || (page === 'index' && (filename === '' || filename === 'index'))
      ? ' active' : '';
  }

  if (sidebar) {
    sidebar.innerHTML = `
      <a href="index.html" class="sidebar-logo">🎮 PlayDen</a>
      <nav class="sidebar-nav">
        <a href="index.html" class="sidebar-link${active('index')}">🏠 Home</a>
        <a href="leaderboard.html" class="sidebar-link${active('leaderboard')}">🏆 Leaderboard</a>
        <a href="account.html" class="sidebar-link${active('account')}">👾 Account</a>
        <a href="about.html" class="sidebar-link${active('about')}">ℹ️ About</a>
      </nav>
      <div class="sidebar-divider"></div>
      <div class="sidebar-section-title">Categories</div>
      <nav class="sidebar-nav">
        <a href="index.html#arcade" class="sidebar-link small">🕹️ Arcade</a>
        <a href="index.html#puzzle" class="sidebar-link small">🧩 Puzzle</a>
        <a href="index.html#card" class="sidebar-link small">🃏 Card</a>
        <a href="index.html#multiplayer" class="sidebar-link small">🌐 Multiplayer</a>
      </nav>
      <div class="sidebar-spacer"></div>
      <div class="sidebar-bottom">
        <div class="sidebar-chips hidden" id="sidebarChips">🪙 <span id="sidebarChipCount">0</span></div>
        <div class="sidebar-user hidden" id="sidebarUser">
          <span class="sidebar-username" id="sidebarUsername"></span>
          <button class="sidebar-logout-btn" id="sidebarLogout">Sign out</button>
        </div>
        <div class="sidebar-auth" id="sidebarGuest">
          <a href="login.html" class="btn-primary sidebar-btn">Log in</a>
          <a href="signup.html" class="btn-secondary sidebar-btn">Sign up</a>
        </div>
      </div>
    `;
  }

  if (bottomNav) {
    // Inject backdrop + sheet + nav into the body
    const backdrop = document.createElement('div');
    backdrop.className = 'games-sheet-backdrop';
    backdrop.id = 'gamesSheetBackdrop';

    const sheet = document.createElement('div');
    sheet.className = 'games-sheet';
    sheet.id = 'gamesSheet';
    sheet.innerHTML = `
      <div class="games-sheet-title">Game Categories</div>
      <div class="games-sheet-grid">
        <a href="index.html#arcade"      class="games-sheet-item"><span class="gs-icon">🕹️</span> Arcade</a>
        <a href="index.html#puzzle"      class="games-sheet-item"><span class="gs-icon">🧩</span> Puzzle</a>
        <a href="index.html#card"        class="games-sheet-item"><span class="gs-icon">🃏</span> Card</a>
        <a href="index.html#multiplayer" class="games-sheet-item"><span class="gs-icon">🌐</span> Multi</a>
      </div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);

    function openSheet() {
      backdrop.classList.add('open');
      sheet.classList.add('open');
    }
    function closeSheet() {
      backdrop.classList.remove('open');
      sheet.classList.remove('open');
    }
    backdrop.addEventListener('click', closeSheet);
    sheet.querySelectorAll('a').forEach(a => a.addEventListener('click', closeSheet));

    bottomNav.innerHTML = `
      <div class="bottom-nav-inner">
        <a href="index.html" class="bottom-nav-item${active('index')}">
          <span class="bn-icon">🏠</span><span>Home</span>
        </a>
        <a href="leaderboard.html" class="bottom-nav-item${active('leaderboard')}">
          <span class="bn-icon">🏆</span><span>Ranks</span>
        </a>
        <button class="bottom-nav-item" id="gamesNavBtn">
          <span class="bn-icon">🎮</span><span>Games</span>
        </button>
        <a href="account.html" class="bottom-nav-item${active('account')}">
          <span class="bn-icon">👾</span><span>Account</span>
        </a>
      </div>
    `;

    document.getElementById('gamesNavBtn').addEventListener('click', function () {
      if (sheet.classList.contains('open')) {
        closeSheet();
      } else {
        openSheet();
      }
    });
  }

  /**
   * Call this from each page's onAuthStateChanged to update sidebar auth state.
   * @param {object|null} user  - Firebase user object or null
   * @param {object|null} data  - Firestore user doc data (chips, username) or null
   * @param {Function} [logoutFn] - Optional logout function to bind to the sign-out button
   */
  window.updateSidebarAuth = function (user, data, logoutFn) {
    const chips    = data ? (data.chips    || 0)  : 0;
    const username = data ? (data.username || '') : '';

    const elChips    = document.getElementById('sidebarChips');
    const elCount    = document.getElementById('sidebarChipCount');
    const elGuest    = document.getElementById('sidebarGuest');
    const elUser     = document.getElementById('sidebarUser');
    const elUsername = document.getElementById('sidebarUsername');
    const elLogout   = document.getElementById('sidebarLogout');

    if (user) {
      if (elChips)    { elChips.classList.remove('hidden'); }
      if (elCount)    { elCount.textContent = chips.toLocaleString(); }
      if (elGuest)    { elGuest.classList.add('hidden'); }
      if (elUser)     { elUser.classList.remove('hidden'); }
      if (elUsername) { elUsername.textContent = '👾 ' + username; }
      if (elLogout && logoutFn) {
        // Remove old handler then add new one
        const fresh = elLogout.cloneNode(true);
        elLogout.parentNode.replaceChild(fresh, elLogout);
        fresh.addEventListener('click', logoutFn);
      }
    } else {
      if (elChips) { elChips.classList.add('hidden'); }
      if (elGuest) { elGuest.classList.remove('hidden'); }
      if (elUser)  { elUser.classList.add('hidden'); }
    }

    // Also update top-bar chip display if present
    const tbChips = document.getElementById('topBarChips');
    const tbCount = document.getElementById('topBarChipCount');
    if (tbChips && tbCount) {
      if (user) {
        tbChips.classList.add('visible');
        tbCount.textContent = chips.toLocaleString();
      } else {
        tbChips.classList.remove('visible');
      }
    }
  };
})();
