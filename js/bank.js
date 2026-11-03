/* Budgie – bankforbindelse.
   NU: kun "Demo Bank", som laver eksempel-køb. Der bliver ALDRIG spurgt om rigtige bankoplysninger.
   SENERE: En rigtig bank kræver open banking (PSD2) via en godkendt udbyder (fx Tink,
   Enable Banking eller Mastercard Open Banking) og en lille server, der holder nøglerne.
   Byt `demoProvider` ud med en provider, der kalder jeres server – resten af appen kan blive som den er. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./calc.js'));
  else root.Bank = factory(root.Calc);
})(typeof self !== 'undefined' ? self : this, function (Calc) {

  // ---------- Automatisk sortering i kategorier ----------
  // Hver regel: ord i bankteksten → kategori med det ikon (se config.js → categories)
  const RULES = [
    { icon: 'food', words: ['netto', 'rema', 'føtex', 'fotex', 'lidl', 'meny', 'bilka', 'coop', 'irma', '7-eleven', 'mcdonald', 'burger', 'pizza', 'sushi', 'starbucks', 'joe & the juice', 'kantine', 'wolt', 'just eat'] },
    { icon: 'bus', words: ['dsb', 'rejsekort', 'movia', 'metro', 'midttrafik', 'letbane', 'circle k', 'q8', 'uber', 'bolt', 'donkey'] },
    { icon: 'repeat', words: ['spotify', 'netflix', 'hbo', 'disney', 'viaplay', 'youtube', 'apple.com', 'icloud', 'playstation plus', 'xbox game pass'] },
    { icon: 'shirt', words: ['h&m', 'zalando', 'zara', 'only', 'jack & jones', 'weekday', 'nike', 'adidas', 'vinted', 'asos'] },
    { icon: 'game', words: ['steam', 'biograf', 'nordisk film', 'cinema', 'bowling', 'tivoli', 'ticketmaster', 'billetlugen', 'bar', 'café', 'cafe'] },
  ];
  function categorize(text, cats) {
    const t = String(text || '').toLowerCase();
    for (const r of RULES) {
      if (r.words.some(w => t.includes(w))) {
        const c = cats.find(c => c.icon === r.icon);
        if (c) return c.id;
      }
    }
    const fun = cats.find(c => c.icon === 'game');
    return (fun || cats[0] || {}).id || null;
  }

  // ---------- Demo Bank ----------
  const MERCHANTS = [
    ['NETTO', 35, 180], ['REMA 1000', 40, 220], ['7-ELEVEN', 18, 75], ['JOE & THE JUICE', 45, 75], ['MCDONALDS', 49, 120], ['WOLT', 120, 260],
    ['DSB', 24, 120], ['REJSEKORT', 18, 60], ['MOVIA', 24, 48],
    ['STEAM', 49, 299], ['NORDISK FILM BIOGRAF', 110, 260], ['BOWLING', 90, 180],
    ['H&M', 99, 399], ['ZALANDO', 199, 699], ['VINTED', 60, 250],
    ['APPLE.COM/BILL', 9, 29],
  ];
  /** Tilfældigt men fast tal ud fra en tekst (så samme dag altid giver samme køb). */
  function seeded(str) { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296; }
  function demoDay(iso) {
    const r = seeded('budgie-demo-' + iso), n = r() < 0.35 ? 0 : r() < 0.75 ? 1 : 2, out = [];
    for (let i = 0; i < n; i++) {
      const m = MERCHANTS[Math.floor(r() * MERCHANTS.length)];
      out.push({ ext: `demo-${iso}-${i}`, date: iso, text: m[0], amount: Math.round(m[1] + r() * (m[2] - m[1])) });
    }
    return out;
  }
  const demoProvider = {
    id: 'demo', name: 'Demo Bank', demo: true,
    /** Køb fra og med `from` til og med `to` (ÅÅÅÅ-MM-DD) */
    async fetchTransactions(from, to) {
      await new Promise(r => setTimeout(r, 900)); // som et rigtigt netværkskald
      const out = [];
      for (let d = from; d <= to; d = Calc.addDays(d, 1)) out.push(...demoDay(d));
      return out;
    },
  };
  const PROVIDERS = { demo: demoProvider };

  // Banker, der vises som "kommer senere" (kun navne – der er ingen aftale med dem endnu)
  const COMING = ['Danske Bank', 'Nordea', 'Jyske Bank', 'Nykredit', 'Lunar', 'Sydbank', 'Arbejdernes Landsbank', 'Spar Nord'];

  /** Læg nye bank-køb ind i tilstanden. Returnerer antal nye køb. Dubletter springes over. */
  function merge(s, list, uid) {
    const seen = new Set(s.tx.filter(t => t.ext).map(t => t.ext));
    let added = 0;
    for (const b of list) {
      if (seen.has(b.ext)) continue;
      s.tx.push({ id: uid(), ext: b.ext, date: b.date, amount: b.amount, note: tidy(b.text), cat: categorize(b.text, s.cats), source: 'bank' });
      seen.add(b.ext); added++;
    }
    return added;
  }
  // "NETTO KBH" → "Netto Kbh", men korte forkortelser som DSB og H&M bevares
  const tidy = t => String(t).replace(/\/bill$/i, '').split(/(\s+)/).map(w => /^[A-ZÆØÅ&]{2,3}$/.test(w) ? w : w.toLowerCase().replace(/(^|[&/.-])\S/g, m => m.toUpperCase())).join('');

  // ---------- Rigtige banker via Budgie bank-serveren (server/worker.mjs) ----------
  function apiProvider(base) {
    base = base.replace(/\/$/, '');
    const call = async (path, opts) => {
      const r = await fetch(base + path, opts);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { const e = new Error(d.error || 'Bank error'); e.code = d.code || 'bank_error'; throw e; }
      return d;
    };
    const post = (path, body) => call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return {
      id: 'enable', name: 'Bank', demo: false,
      banks: (country = 'DK') => call('/banks?country=' + country).then(d => d.banks || []),
      /** Returnerer en adresse hos banken, hvor brugeren godkender (MitID). */
      start: (bank, redirect, state) => post('/connect', { bank, country: 'DK', redirect, state }).then(d => d.url),
      /** Når brugeren kommer tilbage fra banken med en kode. */
      finish: code => post('/session', { code }),
      async fetchTransactions(from, to, info) {
        const d = await call(`/transactions?session=${encodeURIComponent(info.session)}&from=${from}`);
        return (d.transactions || []).filter(t => t.date <= to);
      },
      disconnect: info => call('/session?session=' + encodeURIComponent(info.session), { method: 'DELETE' }).catch(() => { }),
    };
  }
  /** Slå rigtige banker til, hvis der er en bank-server i indstillingerne. */
  function init(apiUrl) { if (apiUrl) PROVIDERS.enable = apiProvider(apiUrl); return !!apiUrl; }
  const realBanks = () => !!PROVIDERS.enable;

  /** Dage til bankens godkendelse udløber (EU-regel: højst 180 dage ad gangen). */
  const consentDaysLeft = (s, today) => s.bank && s.bank.consentUntil ? Calc.daysBetween(today, s.bank.consentUntil.slice(0, 10)) : null;

  async function sync(s, today, uid) {
    if (!s.bank) return 0;
    const p = PROVIDERS[s.bank.provider];
    if (!p) return 0;
    const left = consentDaysLeft(s, today);
    if (left !== null && left < 0) { const e = new Error('Your bank approval has run out'); e.code = 'expired'; throw e; }
    // Hent lidt bagud hver gang, så sent bogførte køb også kommer med (dubletter springes over)
    const from = s.bank.lastSync ? Calc.addDays(s.bank.lastSync, -5) : Calc.addDays(today, -59);
    let list;
    try { list = await p.fetchTransactions(from, today, s.bank); }
    catch (e) { if (e.code === 'expired') s.bank.expired = true; throw e; }
    const added = merge(s, list, uid);
    s.bank.lastSync = today; s.bank.lastSyncAt = new Date().toISOString(); s.bank.expired = false;
    return added;
  }
  function connect(s, providerId, today, info = {}) {
    const p = PROVIDERS[providerId];
    const keepTx = s.bank && s.bank.provider === providerId; // fornyelse: behold historik og synk-dato
    s.bank = { provider: p.id, name: info.bank || p.name, demo: !!p.demo, connectedAt: today,
      lastSync: keepTx ? s.bank.lastSync : null, lastSyncAt: keepTx ? s.bank.lastSyncAt : null,
      consentUntil: (info.validUntil || Calc.addDays(today, 180)).slice(0, 10), session: info.session || null, accounts: info.accounts || [] };
  }
  async function disconnect(s, removeTx) {
    const p = s.bank && PROVIDERS[s.bank.provider];
    if (p && p.disconnect) await p.disconnect(s.bank);
    if (removeTx) s.tx = s.tx.filter(t => t.source !== 'bank');
    s.bank = null;
  }

  return { RULES, COMING, PROVIDERS, init, realBanks, consentDaysLeft, categorize, merge, sync, connect, disconnect, demoDay };
});
