// PlayDen — main script (auth state + daily chip bonus + nav chip display)

const firebaseConfig = {
  apiKey:            "AIzaSyDT810ckpGIr0ExRp3S_bAO_NBnSGr5ALY",
  authDomain:        "gamezone-6487a.firebaseapp.com",
  projectId:         "gamezone-6487a",
  storageBucket:     "gamezone-6487a.firebasestorage.app",
  messagingSenderId: "266519256159",
  appId:             "1:266519256159:web:34d6be085083cda5ff4fea"
};

// Toast notification (used for daily bonus)
function showToast(message, duration = 4000) {
  let toast = document.getElementById('gz-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'gz-toast';
    toast.style.cssText = `
      position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
      background:#1a1a2e; border:1px solid #7c3aed; border-radius:12px;
      color:#e0e0e0; font-family:'Segoe UI',sans-serif; font-size:15px;
      padding:12px 24px; z-index:9999; box-shadow:0 4px 24px rgba(0,0,0,0.5);
      opacity:0; transition:opacity 0.3s; white-space:nowrap; pointer-events:none;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = '1';
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => { toast.style.opacity = '0'; }, duration);
}

function setNavChips(amount) {
  const pill  = document.getElementById('navChips');
  const count = document.getElementById('navChipCount');
  if (!pill || !count) return;
  count.textContent = Number(amount).toLocaleString();
  pill.classList.remove('hidden');
}

(async () => {
  try {
    const { initializeApp }  = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    const { getAuth, onAuthStateChanged, signOut }
      = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
    const { getFirestore, doc, getDoc, setDoc, updateDoc, increment, serverTimestamp }
      = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');

    const app  = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db   = getFirestore(app);

    // Support both old .nav-auth and new #navAuth selectors
    const navAuth = document.getElementById('navAuth') || document.querySelector('.nav-auth');

    // Detect depth for correct path back to root
    const depth = window.location.pathname.split('/').filter(Boolean).length;
    const root  = depth >= 3 ? '../../' : '';

    onAuthStateChanged(auth, async (user) => {
      if (user) {
        const displayName = user.displayName || user.email.split('@')[0];

        if (navAuth) {
          navAuth.innerHTML = `
            <a href="${root}account.html" class="nav-username" style="text-decoration:none;">👾 ${displayName}</a>
            <button class="btn-secondary" id="logoutBtn">Log out</button>
          `;
          document.getElementById('logoutBtn').addEventListener('click', async () => {
            await signOut(auth);
            window.location.reload();
          });
        }
        // Hide sign-up hero CTA when already signed in
        const heroNote = document.querySelector('.hero-note');
        const heroActions = document.querySelector('.hero-actions');
        if (heroNote) heroNote.style.display = 'none';
        if (heroActions) {
          heroActions.innerHTML = `<a href="${root}leaderboard.html" class="btn-primary btn-large">🏆 View Leaderboard</a><a href="#arcade" class="btn-secondary btn-large">Browse Games</a>`;
        }

        // ── Daily login bonus & chip display ──────────────────
        try {
          const userRef  = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          const today    = new Date().toDateString();

          if (!userSnap.exists()) {
            // Brand new user — create their account doc
            await setDoc(userRef, {
              userId:         user.uid,
              username:       displayName,
              chips:          1000,
              lastDailyBonus: today,
              createdAt:      serverTimestamp()
            });
            setNavChips(1000);
            showToast('🎉 Welcome to PlayDen! You start with 1,000 chips.');
          } else {
            const data = userSnap.data();
            if (data.lastDailyBonus !== today) {
              // Award daily bonus
              await updateDoc(userRef, {
                chips:          increment(500),
                lastDailyBonus: today
              });
              setNavChips((data.chips || 0) + 500);
              showToast('🪙 Daily bonus! +500 chips added to your account.');
            } else {
              setNavChips(data.chips || 0);
            }
          }
        } catch (err) {
          console.warn('PlayDen: Could not process daily bonus:', err);
        }

      } else {
        if (navAuth) {
          navAuth.innerHTML = `
            <a href="${root}login.html" class="btn-secondary">Log in</a>
            <a href="${root}signup.html" class="btn-primary">Sign up</a>
          `;
        }
        // Hide chip pill when logged out
        const pill = document.getElementById('navChips');
        if (pill) pill.classList.add('hidden');
      }
    });

  } catch (err) {
    console.warn('PlayDen: Firebase auth could not be loaded.', err);
  }
})();
