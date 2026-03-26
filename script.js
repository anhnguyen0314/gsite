// GameZone — main script

// ─── PASTE YOUR FIREBASE CONFIG HERE ─────────────────────────────────────────
// Copy the same config you used in login.html and signup.html
const firebaseConfig = {
  apiKey:            "AIzaSyDT810ckpGIr0ExRp3S_bAO_NBnSGr5ALY",
  authDomain:        "gamezone-6487a.firebaseapp.com",
  projectId:         "gamezone-6487a",
  storageBucket:     "gamezone-6487a.firebasestorage.app",
  messagingSenderId: "266519256159",
  appId:             "1:266519256159:web:34d6be085083cda5ff4fea"
};
// ─────────────────────────────────────────────────────────────────────────────

// Dynamically load Firebase and watch auth state
(async () => {
  try {
    const { initializeApp }           = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    const { getAuth, onAuthStateChanged, signOut } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');

    const app  = initializeApp(firebaseConfig);
    const auth = getAuth(app);

    const navAuth = document.querySelector('.nav-auth');

    onAuthStateChanged(auth, (user) => {
      if (user) {
        // User is logged in — show their name + a Log Out button
        const displayName = user.displayName || user.email.split('@')[0];
        // Detect if we're in a subdirectory (games/xxx/) to use correct path
        const depth = window.location.pathname.split('/').filter(Boolean).length;
        const root  = depth >= 3 ? '../../' : '';
        navAuth.innerHTML = `
          <a href="${root}account.html" class="nav-username" style="text-decoration:none;">👾 ${displayName}</a>
          <button class="btn-secondary" id="logoutBtn">Log out</button>
        `;
        document.getElementById('logoutBtn').addEventListener('click', async () => {
          await signOut(auth);
          window.location.reload();
        });
      } else {
        // User is logged out — show Log in / Sign up
        navAuth.innerHTML = `
          <a href="login.html" class="btn-secondary">Log in</a>
          <a href="signup.html" class="btn-primary">Sign up</a>
        `;
      }
    });
  } catch (err) {
    // Firebase failed to load (e.g. no internet) — silently keep default nav
    console.warn('GameZone: Firebase auth could not be loaded.', err);
  }
})();
