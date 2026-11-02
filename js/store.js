/* Budgie – lagring på enheden, backup (JSON) og eksempeldata. */
(function () {
  const LEGACY_KEY = 'budgie:v2';
  let KEY = LEGACY_KEY;
  const VERSION = 3;
  const uid = () => Math.random().toString(36).slice(2, 10);
  let memory = null; // reserve, hvis localStorage er slået fra

  function blank(today) {
    const C = window.Calc;
    return {
      version: VERSION, createdAt: today, startMonth: C.ymOf(today), lastMonthSeen: C.ymOf(today),
      name: '', demo: false, premium: false,
      incomes: [], fixed: [], tx: [], goals: [], deposits: [], paid: {}, limitAdjust: {}, bank: null, budgetSet: false,
      // Kategorierne findes fra start (så bank-køb kan sorteres), grænserne sættes i "Set up your budget"
      cats: window.BUDGIE_CONFIG.categories.map(c => ({ id: uid(), name: c.name, icon: c.icon, color: c.color, limit: 0 })),
      settings: { saveSuggest: true, lastCat: null, lastBackupAt: null, backupNudgeAt: null, weekSeen: null, saveSuggestDismissed: null },
      events: {}, waitlist: null, savedAt: null,
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) { /* fx privat browsing */ }
    return memory;
  }
  // ---------- Gem på kontoen (sky) ----------
  // remote = funktion, der gemmer på kontoen. Kaldes lidt forsinket, så mange små ændringer bliver ét kald.
  let remote = null, timer = null, pending = null, onStatus = () => { };
  function setRemote(fn, statusCb) { remote = fn; onStatus = statusCb || (() => { }); }
  async function flush() {
    clearTimeout(timer); timer = null;
    if (!remote || !pending) return;
    const s = pending; pending = null;
    onStatus('saving');
    try { await remote(s); onStatus(navigator.onLine === false ? 'offline' : 'saved'); }
    catch (e) { pending = pending || s; onStatus('error'); }
  }
  function save(s) {
    s.savedAt = new Date().toISOString();
    memory = s;
    let ok = true;
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { ok = false; } // lokal kopi = hurtig start og offline
    if (remote) { pending = s; clearTimeout(timer); timer = setTimeout(flush, 700); }
    return ok;
  }
  // Gem med det samme, hvis appen lukkes / skjules
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  if (typeof window !== 'undefined') window.addEventListener('online', () => { if (pending) flush(); });
  function clear() { memory = null; try { localStorage.removeItem(KEY); } catch (e) {} }
  /** Skift til en kontos egne data. Første konto på enheden overtager evt. data fra før der var konti. */
  function useAccount(id, adoptLegacy) {
    KEY = 'budgie:data:' + id; memory = null;
    if (!adoptLegacy) return;
    try {
      const old = localStorage.getItem(LEGACY_KEY);
      if (old && !localStorage.getItem(KEY)) { localStorage.setItem(KEY, old); localStorage.removeItem(LEGACY_KEY); }
    } catch (e) { }
  }

  /** Udfyld manglende felter (så ældre backups stadig virker). */
  function normalize(s) {
    if (!s || typeof s !== 'object') return null;
    const b = blank(s.createdAt || window.Calc.todayISO());
    const out = Object.assign(b, s);
    out.settings = Object.assign(b.settings, s.settings || {});
    for (const k of ['incomes', 'fixed', 'cats', 'tx', 'goals', 'deposits']) if (!Array.isArray(out[k])) out[k] = [];
    out.events = out.events || {}; out.paid = out.paid || {}; out.limitAdjust = out.limitAdjust || {};
    if (s.budgetSet === undefined) out.budgetSet = (s.incomes || []).length > 0;
    out.version = VERSION;
    return out;
  }

  // ---------- Backup ----------
  function exportJSON(s) {
    return JSON.stringify({ app: 'budgie', exportedAt: new Date().toISOString(), data: s }, null, 2);
  }
  /** Returnerer en gyldig tilstand eller kaster en fejl med en dansk forklaring. */
  function importJSON(text) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { throw new Error("Couldn't read the file. Is it a Budgie backup (.json)?"); }
    const data = obj && obj.app === 'budgie' ? obj.data : obj;
    if (!data || !Array.isArray(data.tx) || !Array.isArray(data.cats)) throw new Error("This file doesn't look like a Budgie backup.");
    return normalize(data);
  }

  // ---------- Eksempeldata ----------
  function demo(today) {
    const C = window.Calc, cfg = window.BUDGIE_CONFIG;
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; // samme data hver gang
    const s = blank(today);
    const ym = C.ymOf(today);
    s.demo = true; s.name = 'Emma'; s.budgetSet = true; s.startMonth = C.addMonths(ym, -9); s.lastMonthSeen = ym; s.createdAt = C.addDays(today, -60);
    s.settings.lastBackupAt = today;
    s.incomes = [{ id: uid(), name: 'Part-time job', kind: 'Salary', amount: 3200, day: 15 }, { id: uid(), name: 'Pocket money', kind: 'Pocket money', amount: 500, day: 1 }];
    s.fixed = [{ id: uid(), name: 'Phone', amount: 129, day: 5, icon: 'phone' }, { id: uid(), name: 'Streaming', amount: 99, day: 12, icon: 'play' },
      { id: uid(), name: 'Fitness', amount: 149, day: Math.min(28, C.dayOf(today) + 2), icon: 'dumbbell' }];
    const limits = [900, 300, 500, 350, 150];
    s.cats = cfg.categories.map((c, i) => ({ id: uid(), name: c.name, icon: c.icon, color: c.color, limit: limits[i] || 300 }));
    const notes = [['Netto', 'Canteen', 'Pizza', '7-Eleven', 'Rema 1000'], ['Bus ticket', 'Train'], ['Cinema', 'Concert', 'Bowling', 'Game'], ['Sneakers', 'Hoodie', 'T-shirt'], ['App', 'Game pass']];
    const weights = [0.45, 0.12, 0.25, 0.12, 0.06];
    const pick = () => { let r = rnd(), i = 0; while (r > weights[i] && i < weights.length - 1) { r -= weights[i]; i++; } return i; };
    for (let back = 9; back >= 0; back--) {
      const m = C.addMonths(ym, -back), max = back === 0 ? C.dayOf(today) : C.daysInMonth(m);
      const n = back === 0 ? Math.max(4, Math.round(C.dayOf(today) / 3)) : 11 + Math.floor(rnd() * 5);
      for (let i = 0; i < n; i++) {
        const k = pick(), cat = s.cats[k];
        s.tx.push({ id: uid(), date: m + '-' + String(1 + Math.floor(rnd() * max)).padStart(2, '0'), cat: cat.id,
          amount: Math.round(25 + rnd() * (k === 3 ? 260 : 140)), note: notes[k][Math.floor(rnd() * notes[k].length)], source: 'manual' });
      }
    }
    // Sørg for en tydelig advarsel: Tøj lidt over grænsen denne måned
    const toej = s.cats[3];
    const toejSpent = C.catSpent(s, toej.id, ym);
    if (toejSpent <= toej.limit) s.tx.push({ id: uid(), date: today, cat: toej.id, amount: toej.limit - toejSpent + 105, note: 'Jacket', source: 'manual' });
    const goal = { id: uid(), name: 'New phone', target: 4000, monthly: 250, icon: 'phone' };
    s.goals = [goal];
    [[-5, 300], [-4, 250], [-3, 250], [-2, 300], [-1, 250]].forEach(([b, a]) => s.deposits.push({ id: uid(), goalId: goal.id, amount: a, date: C.addMonths(ym, b) + '-16' }));
    return s;
  }

  window.Store = { uid, blank, load, save, flush, setRemote, clear, useAccount, normalize, exportJSON, importJSON, demo };
})();
