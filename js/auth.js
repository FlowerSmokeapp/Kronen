/* Budgie – konti og lagring på kontoen.
   To tilstande:
   • SKY (når js/firebase-config.js er udfyldt): Konto og data gemmes på kontoen i Firebase,
     så man kan logge ind på enhver telefon eller computer. Virker også offline – ændringer
     sendes, når der er net igen.
   • LOKAL (indtil Firebase er sat op): Konto og data gemmes kun på denne enhed.
     Adgangskoden gemmes som et PBKDF2-hash, aldrig i klartekst.
   Resten af appen bruger kun: Auth.init / signUp / logIn / logOut / current / loadData / saveData. */
(function () {
  const FB = window.FIREBASE_CONFIG || {};
  const CLOUD = !!FB.apiKey;
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const AK = 'budgie:accounts', SK = 'budgie:session', SEEN = 'budgie:seen', DEMO = '__demo__';
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { } };
  const normEmail = e => String(e || '').trim().toLowerCase();
  function fail(msg) { const e = new Error(msg); e.userFacing = true; throw e; }
  function check(name, email, pw, signup) {
    if (signup && !String(name || '').trim()) fail('Please enter your first name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normEmail(email))) fail('That email doesn’t look right.');
    if (String(pw || '').length < 6) fail('Your password needs at least 6 characters.');
  }

  // =================================================================
  //  SKY (Firebase)
  // =================================================================
  let fbUser = null, db = null, cloudReady = false;
  const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); });
  const FB_ERRORS = {
    'auth/email-already-in-use': 'There’s already an account with that email. Log in instead.',
    'auth/invalid-email': 'That email doesn’t look right.',
    'auth/weak-password': 'Your password needs at least 6 characters.',
    'auth/invalid-credential': 'Wrong email or password.', 'auth/wrong-password': 'Wrong email or password.', 'auth/user-not-found': 'Wrong email or password.',
    'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
    'auth/network-request-failed': 'No internet connection. Check your connection and try again.',
    'auth/requires-recent-login': 'For your safety, log out and in again – then delete the account.',
    'auth/operation-not-allowed': 'Email login isn’t switched on in Firebase yet (see the setup guide).',
  };
  const fbFail = e => fail(FB_ERRORS[e && e.code] || 'Something went wrong. Please try again.');

  async function initCloud() {
    for (const f of ['firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-firestore-compat.js']) await loadScript(SDK + f);
    firebase.initializeApp(FB);
    db = firebase.firestore();
    try { await db.enablePersistence({ synchronizeTabs: true }); } catch (e) { /* fx flere faner – virker stadig */ }
    await new Promise(r => { const off = firebase.auth().onAuthStateChanged(u => { fbUser = u; off(); r(); }); });
    firebase.auth().onAuthStateChanged(u => { fbUser = u; });
    cloudReady = true;
  }
  const doc = uid => db.collection('users').doc(uid);

  // =================================================================
  //  LOKAL
  // =================================================================
  const readAccounts = () => { try { return JSON.parse(get(AK)) || {}; } catch (e) { return {}; } };
  const writeAccounts = a => set(AK, JSON.stringify(a));
  const rand = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');
  async function hash(pw, salt) {
    if (!(crypto && crypto.subtle)) fail('Your browser can’t create accounts here. Open the app over https.');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 120000, hash: 'SHA-256' }, key, 256);
    return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('');
  }
  const publicAcc = a => ({ id: a.id, name: a.name, email: a.email, demo: false, cloud: false });

  // =================================================================
  //  Fælles API
  // =================================================================
  const Auth = {
    CLOUD, get LOCAL_ONLY() { return !CLOUD; },
    /** Skal kaldes én gang ved opstart. */
    async init() { if (CLOUD) await initCloud(); },
    get cloudReady() { return cloudReady; },

    async signUp(name, email, pw) {
      check(name, email, pw, true); name = String(name).trim(); email = normEmail(email);
      set(SEEN, '1');
      if (CLOUD) {
        try {
          const c = await firebase.auth().createUserWithEmailAndPassword(email, pw);
          await c.user.updateProfile({ displayName: name }).catch(() => { });
          fbUser = c.user; set(SK, null);
          return { id: c.user.uid, name, email, demo: false, cloud: true };
        } catch (e) { fbFail(e); }
      }
      const acc = readAccounts();
      if (acc[email]) fail('There’s already an account with that email on this device. Log in instead.');
      const salt = rand(16);
      acc[email] = { id: 'u_' + rand(8), name, email, salt, hash: await hash(pw, salt), createdAt: new Date().toISOString() };
      writeAccounts(acc); set(SK, email);
      return publicAcc(acc[email]);
    },
    async logIn(email, pw) {
      email = normEmail(email); set(SEEN, '1');
      if (CLOUD) {
        try { const c = await firebase.auth().signInWithEmailAndPassword(email, pw); fbUser = c.user; set(SK, null); return Auth.current(); }
        catch (e) { fbFail(e); }
      }
      const a = readAccounts()[email];
      if (!a || (await hash(String(pw || ''), a.salt)) !== a.hash) fail('Wrong email or password.');
      set(SK, email);
      return publicAcc(a);
    },
    async resetPassword(email) {
      if (!CLOUD) fail('Accounts are stored on this device, so the password can’t be reset. Restore a backup in a new account instead.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normEmail(email))) fail('Type your email first, then tap “Forgot password?”.');
      try { await firebase.auth().sendPasswordResetEmail(normEmail(email)); } catch (e) { fbFail(e); }
    },
    async logOut() {
      const s = get(SK); set(SK, null);
      if (CLOUD && cloudReady && s !== DEMO) await firebase.auth().signOut().catch(() => { });
      fbUser = null;
    },
    startDemo() { set(SK, DEMO); },
    current() {
      const s = get(SK);
      if (s === DEMO) return { id: 'demo', name: 'Emma', email: '', demo: true, cloud: false };
      if (CLOUD) return fbUser ? { id: fbUser.uid, name: fbUser.displayName || '', email: fbUser.email, demo: false, cloud: true } : null;
      const a = s && readAccounts()[s];
      return a ? publicAcc(a) : null;
    },
    async deleteAccount(acc) {
      if (CLOUD && acc.cloud) {
        try { await doc(acc.id).delete(); await fbUser.delete(); } catch (e) { fbFail(e); }
        fbUser = null; return;
      }
      const all = readAccounts(); delete all[normEmail(acc.email)]; writeAccounts(all); set(SK, null);
    },
    /** Har nogen brugt Budgie på denne enhed før? (så vises "Log ind" i stedet for "Opret") */
    hasAccounts: () => !!get(SEEN) || Object.keys(readAccounts()).length > 0,

    // ---------- Data på kontoen ----------
    /** Henter kontoens data. undefined = ingen data endnu. Kaster en fejl, hvis der ikke er forbindelse og intet i cachen. */
    async loadData(acc) {
      if (!acc.cloud) return undefined;
      const snap = await doc(acc.id).get();
      if (!snap.exists) return undefined;
      const d = snap.data();
      return d && d.data ? JSON.parse(d.data) : undefined;
    },
    async saveData(acc, state) {
      if (!acc.cloud) return;
      // Gemmes som tekst, så Firestore ikke stiller krav til felternes form
      await doc(acc.id).set({ data: JSON.stringify(state), updatedAt: firebase.firestore.FieldValue.serverTimestamp(), v: state.version || 3 });
    },
  };
  window.Auth = Auth;
})();
