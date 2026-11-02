/* Budgie – konti.
   PROTOTYPE: Konti gemmes kun på denne enhed (localStorage). Adgangskoden gemmes
   aldrig i klartekst, kun som et PBKDF2-hash med salt.
   Når der kommer en server (fx Firebase), er det kun denne fil, der skal skiftes ud:
   resten af appen bruger bare Auth.signUp / logIn / logOut / current. */
(function () {
  const AK = 'budgie:accounts', SK = 'budgie:session', DEMO = '__demo__';
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { } };
  const readAccounts = () => { try { return JSON.parse(get(AK)) || {}; } catch (e) { return {}; } };
  const writeAccounts = a => set(AK, JSON.stringify(a));
  const normEmail = e => String(e || '').trim().toLowerCase();
  const rand = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');

  async function hash(pw, salt) {
    if (!(crypto && crypto.subtle)) throw new Error('Your browser can’t create accounts here. Open the app over https.');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 120000, hash: 'SHA-256' }, key, 256);
    return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('');
  }
  function fail(msg) { const e = new Error(msg); e.userFacing = true; throw e; }

  async function signUp(name, email, pw) {
    email = normEmail(email); name = String(name || '').trim();
    if (!name) fail('Please enter your first name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fail('That email doesn’t look right.');
    if (String(pw || '').length < 6) fail('Your password needs at least 6 characters.');
    const acc = readAccounts();
    if (acc[email]) fail('There’s already an account with that email on this device. Log in instead.');
    const salt = rand(16);
    acc[email] = { id: 'u_' + rand(8), name, email, salt, hash: await hash(pw, salt), createdAt: new Date().toISOString() };
    writeAccounts(acc); set(SK, email);
    return publicAcc(acc[email]);
  }
  async function logIn(email, pw) {
    email = normEmail(email);
    const a = readAccounts()[email];
    if (!a || (await hash(String(pw || ''), a.salt)) !== a.hash) fail('Wrong email or password.');
    set(SK, email);
    return publicAcc(a);
  }
  function logOut() { set(SK, null); }
  function startDemo() { set(SK, DEMO); }
  function current() {
    const s = get(SK);
    if (!s) return null;
    if (s === DEMO) return { id: 'demo', name: 'Emma', email: '', demo: true };
    const a = readAccounts()[s];
    return a ? publicAcc(a) : null;
  }
  function deleteAccount(email) {
    const acc = readAccounts(); delete acc[normEmail(email)]; writeAccounts(acc); set(SK, null);
  }
  const hasAccounts = () => Object.keys(readAccounts()).length > 0;
  const publicAcc = a => ({ id: a.id, name: a.name, email: a.email, demo: false });

  window.Auth = { signUp, logIn, logOut, startDemo, current, deleteAccount, hasAccounts, LOCAL_ONLY: true };
})();
