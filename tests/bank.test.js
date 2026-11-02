// Kør med:  npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const Bank = require('../js/bank.js');

const cats = [{ id: 'food', icon: 'food' }, { id: 'bus', icon: 'bus' }, { id: 'fun', icon: 'game' }, { id: 'clo', icon: 'shirt' }, { id: 'sub', icon: 'repeat' }];

test('Bank-tekster sorteres i de rigtige kategorier', () => {
  assert.equal(Bank.categorize('NETTO KBH', cats), 'food');
  assert.equal(Bank.categorize('DSB billet', cats), 'bus');
  assert.equal(Bank.categorize('Spotify P1234', cats), 'sub');
  assert.equal(Bank.categorize('ZALANDO SE', cats), 'clo');
  assert.equal(Bank.categorize('Ukendt butik', cats), 'fun'); // ukendt → Fun
});

test('Samme køb importeres ikke to gange', () => {
  let n = 0; const uid = () => 'id' + (n++);
  const s = { tx: [], cats };
  const list = [{ ext: 'a', date: '2026-11-01', text: 'NETTO', amount: 50 }, { ext: 'b', date: '2026-11-01', text: 'DSB', amount: 24 }];
  assert.equal(Bank.merge(s, list, uid), 2);
  assert.equal(Bank.merge(s, list, uid), 0);
  assert.equal(s.tx.length, 2);
  assert.equal(s.tx[0].source, 'bank');
  assert.equal(s.tx[0].note, 'Netto');
});

test('Demo Bank giver de samme køb for samme dag', () => {
  assert.deepEqual(Bank.demoDay('2026-10-12'), Bank.demoDay('2026-10-12'));
});

test('Synkronisering henter kun nye dage og kan afbrydes', async () => {
  let n = 0; const uid = () => 'id' + (n++);
  const s = { tx: [], cats, bank: null };
  Bank.connect(s, 'demo', '2026-11-02');
  assert.equal(s.bank.consentUntil, '2027-05-01');
  const first = await Bank.sync(s, '2026-11-02', uid);
  assert.ok(first > 10, 'henter ca. 60 dages køb');
  assert.equal(await Bank.sync(s, '2026-11-02', uid), 0);
  s.tx.push({ id: 'manual', source: 'manual' });
  Bank.disconnect(s, true);
  assert.deepEqual(s.tx.map(t => t.id), ['manual']);
  assert.equal(s.bank, null);
});
