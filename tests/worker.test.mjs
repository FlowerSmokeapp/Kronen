// Tester bank-serveren med en falsk Enable Banking (intet rigtigt netværk)
import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { mapTx, makeJWT } from '../server/worker.mjs';

const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64');
const env = { EB_APP_ID: 'app-123', EB_PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----\n${pkcs8}\n-----END PRIVATE KEY-----`, ALLOWED_ORIGIN: 'https://dani-gh1.github.io' };
const ORIGIN = { Origin: 'https://dani-gh1.github.io' };
const b64 = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

test('JWT er signeret korrekt (RS256, kid = app-id)', async () => {
  const [h, p, sig] = (await makeJWT(env, 1000)).split('.');
  assert.deepEqual(JSON.parse(b64(h)), { typ: 'JWT', alg: 'RS256', kid: 'app-123' });
  assert.deepEqual(JSON.parse(b64(p)), { iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: 1000, exp: 4600 });
  assert.ok(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', pair.publicKey, b64(sig), new TextEncoder().encode(h + '.' + p)));
});

test('Kun bogførte udgifter bliver til køb', () => {
  assert.equal(mapTx({ credit_debit_indicator: 'CRDT', transaction_amount: { amount: '3200' }, booking_date: '2026-11-01' }, 'a'), null);
  assert.equal(mapTx({ credit_debit_indicator: 'DBIT', status: 'PDNG', transaction_amount: { amount: '10' }, booking_date: '2026-11-01' }, 'a'), null);
  assert.deepEqual(mapTx({ credit_debit_indicator: 'DBIT', status: 'BOOK', entry_reference: 'X1', transaction_amount: { amount: '-123.50' }, booking_date: '2026-11-01', creditor: { name: 'NETTO' } }, 'acc1'),
    { ext: 'eb-acc1-X1', date: '2026-11-01', text: 'NETTO', amount: 123.5 });
  const seen = {};
  const a = mapTx({ credit_debit_indicator: 'DBIT', transaction_amount: { amount: '25' }, booking_date: '2026-11-01', remittance_information: ['Kaffe'] }, 'acc1', seen);
  const b = mapTx({ credit_debit_indicator: 'DBIT', transaction_amount: { amount: '25' }, booking_date: '2026-11-01', remittance_information: ['Kaffe'] }, 'acc1', seen);
  assert.equal(a.text, 'Kaffe'); assert.notEqual(a.ext, b.ext);
});

test('Hele forløbet: banker → godkend → session → køb (med flere sider)', async () => {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', auth: opts.headers && opts.headers.Authorization, body: opts.body });
    const u = new URL(url), r = d => new Response(JSON.stringify(d), { status: 200 });
    if (u.pathname === '/aspsps') return r({ aspsps: [{ name: 'Nordea', country: 'DK', psu_types: ['personal', 'business'] }, { name: 'Erhverv', country: 'DK', psu_types: ['business'] }] });
    if (u.pathname === '/auth') return r({ url: 'https://bank.example/approve?x=1', authorization_id: 'a1' });
    if (u.pathname === '/sessions' && opts.method === 'POST') return r({ session_id: 'S1', accounts: [{ uid: 'acc1', name: 'Lønkonto' }], aspsp: { name: 'Nordea' }, access: { valid_until: '2027-05-01T00:00:00Z' } });
    if (u.pathname === '/sessions/S1') return r({ accounts: ['acc1'], access: { valid_until: '2027-05-01T00:00:00Z' } });
    if (u.pathname === '/accounts/acc1/transactions') {
      return u.searchParams.get('continuation_key')
        ? r({ transactions: [{ credit_debit_indicator: 'DBIT', entry_reference: 'T2', transaction_amount: { amount: '59' }, booking_date: '2026-11-02', creditor: { name: 'Spotify' } }] })
        : r({ transactions: [{ credit_debit_indicator: 'DBIT', entry_reference: 'T1', transaction_amount: { amount: '24' }, booking_date: '2026-11-01', creditor: { name: 'DSB' } }], continuation_key: 'next' });
    }
    return new Response('{}', { status: 404 });
  };
  const call = (path, init = {}) => worker.fetch(new Request('https://w.example' + path, { ...init, headers: { ...ORIGIN, 'Content-Type': 'application/json' } }), env).then(r => r.json());

  assert.deepEqual((await call('/banks?country=DK')).banks.map(b => b.name), ['Nordea']);
  const c = await call('/connect', { method: 'POST', body: JSON.stringify({ bank: 'Nordea', redirect: 'https://dani-gh1.github.io/Kronen/app.html', state: 'st1' }) });
  assert.equal(c.url, 'https://bank.example/approve?x=1');
  const authBody = JSON.parse(calls.find(x => x.url.endsWith('/auth')).body);
  assert.equal(authBody.psu_type, 'personal'); assert.equal(authBody.aspsp.name, 'Nordea'); assert.equal(authBody.state, 'st1');
  assert.ok(new Date(authBody.access.valid_until) - Date.now() <= 180 * 86400000);
  const s = await call('/session', { method: 'POST', body: JSON.stringify({ code: 'CODE' }) });
  assert.deepEqual(s, { session: 'S1', validUntil: '2027-05-01T00:00:00Z', bank: 'Nordea', accounts: [{ uid: 'acc1', name: 'Lønkonto' }] });
  const t = await call('/transactions?session=S1&from=2026-10-01');
  assert.deepEqual(t.transactions.map(x => x.text), ['DSB', 'Spotify']);
  assert.ok(calls.every(x => x.auth && x.auth.startsWith('Bearer ')));
});

test('Andre hjemmesider må ikke bruge serveren', async () => {
  const r = await worker.fetch(new Request('https://w.example/banks', { headers: { Origin: 'https://evil.example' } }), env);
  assert.equal(r.status, 403);
});
