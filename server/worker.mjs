/* Budgie bank-server – en lille Cloudflare Worker (gratis: 100.000 kald om dagen).
   Den taler med Enable Banking (open banking / PSD2), så bankens nøgle aldrig ligger i appen.
   Appen kalder:
     GET    /banks?country=DK              → liste over banker
     POST   /connect  {bank, country, redirect, state}  → { url }  (brugeren godkender i sin bank)
     POST   /session  {code}               → { session, validUntil, bank, accounts }
     GET    /transactions?session=…&from=ÅÅÅÅ-MM-DD → { transactions: [{ext,date,text,amount}] }
     DELETE /session?session=…             → afbryd forbindelsen
   Hemmeligheder (sættes med `wrangler secret put`): EB_APP_ID, EB_PRIVATE_KEY
   Indstilling (wrangler.toml): ALLOWED_ORIGIN = "https://dani-gh1.github.io" */

const API = 'https://api.enablebanking.com';
const enc = s => new TextEncoder().encode(s);
const b64u = buf => {
  const bytes = typeof buf === 'string' ? enc(buf) : new Uint8Array(buf);
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

let keyCache = null;
async function privateKey(pem) {
  if (keyCache && keyCache.pem === pem) return keyCache.key;
  if (/BEGIN RSA PRIVATE KEY/.test(pem)) throw new Error('Key is PKCS#1. Convert it: openssl pkcs8 -topk8 -nocrypt -in key.pem -out key-pkcs8.pem');
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, '')), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  keyCache = { pem, key };
  return key;
}
/** Enable Banking kræver et JWT signeret med appens private nøgle (RS256). */
export async function makeJWT(env, now = Math.floor(Date.now() / 1000)) {
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: env.EB_APP_ID }));
  const body = b64u(JSON.stringify({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: now, exp: now + 3600 }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await privateKey(env.EB_PRIVATE_KEY), enc(head + '.' + body));
  return head + '.' + body + '.' + b64u(sig);
}
async function eb(env, path, opts = {}) {
  const r = await fetch(API + path, {
    ...opts,
    headers: { Authorization: 'Bearer ' + await makeJWT(env), 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const text = await r.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }
  if (!r.ok) { const e = new Error((data && (data.message || data.error)) || ('Bank API error ' + r.status)); e.status = r.status; throw e; }
  return data;
}

/** Bank-postering → Budgie-køb. Kun penge ud (DBIT) og kun bogførte. */
export function mapTx(t, accountUid, seen = {}) {
  if ((t.credit_debit_indicator || '').toUpperCase() !== 'DBIT') return null;
  if (t.status && !['BOOK', 'BOOKED'].includes(String(t.status).toUpperCase())) return null;
  const amount = Math.abs(parseFloat((t.transaction_amount || {}).amount));
  const date = (t.booking_date || t.value_date || t.transaction_date || '').slice(0, 10);
  if (!amount || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const info = Array.isArray(t.remittance_information) ? t.remittance_information.join(' ') : (t.remittance_information || '');
  const text = ((t.creditor && t.creditor.name) || info || 'Purchase').replace(/\s+/g, ' ').trim().slice(0, 60);
  let id = t.entry_reference || t.transaction_id;
  if (!id) { const k = `${date}|${amount}|${text}`; seen[k] = (seen[k] || 0) + 1; id = k + '|' + seen[k]; }
  return { ext: `eb-${accountUid}-${id}`, date, text, amount: Math.round(amount * 100) / 100 };
}

function cors(env, req) {
  const origin = req.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : (allowed[0] || ''),
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin',
  };
}
const json = (h, data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...h, 'Content-Type': 'application/json' } });

export default {
  async fetch(req, env) {
    const h = cors(env, req), url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: h });
    const origin = req.headers.get('Origin');
    if (origin && env.ALLOWED_ORIGIN && !env.ALLOWED_ORIGIN.split(',').map(s => s.trim()).includes(origin)) return json(h, { error: 'Origin not allowed' }, 403);
    try {
      if (url.pathname === '/banks' && req.method === 'GET') {
        const country = (url.searchParams.get('country') || 'DK').toUpperCase();
        const d = await eb(env, '/aspsps?country=' + encodeURIComponent(country));
        const banks = (d.aspsps || []).filter(a => !a.psu_types || a.psu_types.includes('personal')).map(a => ({ name: a.name, country: a.country, logo: a.logo || null }));
        return json(h, { banks });
      }
      if (url.pathname === '/connect' && req.method === 'POST') {
        const b = await req.json();
        const valid = new Date(Date.now() + 179 * 86400000).toISOString(); // max. 180 dage
        const d = await eb(env, '/auth', { method: 'POST', body: JSON.stringify({
          access: { valid_until: valid }, aspsp: { name: b.bank, country: b.country || 'DK' },
          state: b.state, redirect_url: b.redirect, psu_type: 'personal' }) });
        return json(h, { url: d.url });
      }
      if (url.pathname === '/session' && req.method === 'POST') {
        const b = await req.json();
        const d = await eb(env, '/sessions', { method: 'POST', body: JSON.stringify({ code: b.code }) });
        return json(h, { session: d.session_id, validUntil: d.access && d.access.valid_until, bank: d.aspsp && d.aspsp.name,
          accounts: (d.accounts || []).map(a => ({ uid: a.uid, name: a.name || (a.account_id && a.account_id.iban) || 'Account' })) });
      }
      if (url.pathname === '/transactions' && req.method === 'GET') {
        const session = url.searchParams.get('session'), from = url.searchParams.get('from');
        if (!session) return json(h, { error: 'Missing session' }, 400);
        const s = await eb(env, '/sessions/' + encodeURIComponent(session));
        const out = [];
        for (const acc of (s.accounts || [])) {
          const uid = typeof acc === 'string' ? acc : acc.uid;
          let key = null, pages = 0; const seen = {};
          do {
            const q = new URLSearchParams(); if (from) q.set('date_from', from); if (key) q.set('continuation_key', key);
            const d = await eb(env, `/accounts/${encodeURIComponent(uid)}/transactions?` + q);
            for (const t of (d.transactions || [])) { const m = mapTx(t, uid, seen); if (m) out.push(m); }
            key = d.continuation_key; pages++;
          } while (key && pages < 20);
        }
        return json(h, { transactions: out, validUntil: s.access && s.access.valid_until });
      }
      if (url.pathname === '/session' && req.method === 'DELETE') {
        await eb(env, '/sessions/' + encodeURIComponent(url.searchParams.get('session') || ''), { method: 'DELETE' }).catch(() => { });
        return json(h, { ok: true });
      }
      return json(h, { error: 'Not found' }, 404);
    } catch (e) {
      return json(h, { error: e.message, code: e.status === 401 || e.status === 403 ? 'expired' : 'bank_error' }, e.status && e.status < 500 ? e.status : 502);
    }
  },
};
