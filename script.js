// PlayDen — main script (auth state + daily chip bonus + sidebar update)

const firebaseConfig = {
  apiKey:            "AIzaSyDT810ckpGIr0ExRp3S_bAO_NBnSGr5ALY",
  authDomain:        "gamezone-6487a.firebaseapp.com",
  projectId:         "gamezone-6487a",
  storageBucket:     "gamezone-6487a.firebasestorage.app",
  messagingSenderId: "266519256159",
  appId:             "1:266519256159:web:34d6be085083cda5ff4fea"
};

function showToast(message, duration = 4000) {
  let toast = document.getElementById('gz-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'gz-toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = '1';
  toast.style.display = 'block';
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => { toast.style.opacity = '0'; }, duration);
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

    const doLogout = async () => {
      await signOut(auth);
      window.location.reload();
    };

    onAuthStateChanged(auth, async (user) => {
      if (user) {
        const displayName = user.displayName || user.email.split('@')[0];

        try {
          const userRef  = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          const today    = new Date().toDateString();

          let chipCount = 0;
          let userData  = null;

          if (!userSnap.exists()) {
            await setDoc(userRef, {
              userId:         user.uid,
              username:       displayName,
              chips:          1000,
              lastDailyBonus: today,
              createdAt:      serverTimestamp()
            });
            chipCount = 1000;
            userData  = { chips: 1000, username: displayName };
            showToast('🎉 Welcome to PlayDen! You start with 1,000 chips.');
          } else {
            const data = userSnap.data();
            userData   = data;
            if (data.lastDailyBonus !== today) {
              await updateDoc(userRef, {
                chips:          increment(500),
                lastDailyBonus: today
              });
              chipCount        = (data.chips || 0) + 500;
              userData         = { ...data, chips: chipCount };
              showToast('🪙 Daily bonus! +500 chips added to your account.');
            } else {
              chipCount = data.chips || 0;
            }
          }

          if (window.updateSidebarAuth) {
            window.updateSidebarAuth(user, userData, doLogout);
          }

        } catch (err) {
          console.warn('PlayDen: Could not process daily bonus:', err);
          if (window.updateSidebarAuth) {
            window.updateSidebarAuth(user, { chips: 0, username: displayName }, doLogout);
          }
        }

      } else {
        if (window.updateSidebarAuth) {
          window.updateSidebarAuth(null, null);
        }
      }
    });

  } catch (err) {
    console.warn('PlayDen: Firebase auth could not be loaded.', err);
  }
})();
