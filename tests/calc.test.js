// Kør med:  node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/calc.js');

function state(extra = {}) {
  return Object.assign({
    startMonth: '2026-01', lastMonthSeen: '2026-10',
    incomes: [{ id: 'i1', name: 'Løn', amount: 3200, day: 15 }, { id: 'i2', name: 'Lommepenge', amount: 500, day: 1 }],
    fixed: [{ id: 'f1', name: 'Telefon', amount: 129, day: 5 }, { id: 'f2', name: 'Streaming', amount: 99, day: 31 }],
    cats: [{ id: 'mad', name: 'Mad', limit: 1000 }, { id: 'toej', name: 'Tøj', limit: 400 }, { id: 'fri', name: 'Fritid', limit: 600 }],
    tx: [], goals: [{ id: 'g1', name: 'Ny telefon', target: 4000 }], deposits: [], paid: {}, limitAdjust: {},
    settings: { saveSuggest: true },
  }, extra);
}

test('Tilbage = indtægt − faste − brugt − sparet', () => {
  const s = state({
    tx: [{ id: 't1', date: '2026-10-03', amount: 200, cat: 'mad' }, { id: 't2', date: '2026-09-30', amount: 999, cat: 'mad' }],
    deposits: [{ id: 'd1', goalId: 'g1', amount: 300, date: '2026-10-10' }, { id: 'd2', goalId: 'g1', amount: 1050, date: '2026-08-01' }],
  });
  const m = C.monthSummary(s, '2026-10');
  assert.deepEqual([m.income, m.fixed, m.spent, m.saved, m.left], [3700, 228, 200, 300, 2972]);
});

test('Sparet er det samme tal på Hjem og Mål (begge læser deposits)', () => {
  const s = state({ deposits: [{ id: 'd1', goalId: 'g1', amount: 1350, date: '2026-10-02' }] });
  assert.equal(C.monthSummary(s, '2026-10').saved, 1350);
  assert.equal(C.goalSaved(s, 'g1'), 1350);
  assert.equal(C.totalSaved(s), 1350);
});

test('Sidste dag i måneden: 1 dag tilbage, hele beløbet er "i dag"', () => {
  const d = C.dayInfo('2026-10-31', 2608);
  assert.equal(d.daysLeft, 1);
  assert.equal(d.lastDay, true);
  assert.equal(d.perDay, 2608);
  assert.equal(C.dayInfo('2026-10-01', 3100).daysLeft, 31);
  assert.equal(C.dayInfo('2026-10-01', 3100).perDay, 100);
  assert.equal(C.dayInfo('2026-10-15', -50).perDay, 0);
});

test('Skudår: februar har 29 dage i 2028, 28 i 2026', () => {
  assert.equal(C.daysInMonth('2028-02'), 29);
  assert.equal(C.daysInMonth('2026-02'), 28);
  assert.equal(C.dayInfo('2028-02-29', 100).lastDay, true);
  assert.equal(C.dayInfo('2028-02-28', 100).daysLeft, 2);
  assert.equal(C.addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(C.addDays('2028-02-29', 1), '2028-03-01');
});

test('Dansk tid: 23:30 UTC den 31. oktober er allerede 1. november i København', () => {
  assert.equal(C.todayISO(new Date('2026-10-31T23:30:00Z')), '2026-11-01');
  assert.equal(C.todayISO(new Date('2026-10-31T22:59:00Z')), '2026-10-31');
  // sommertid: UTC+2
  assert.equal(C.todayISO(new Date('2026-06-30T22:30:00Z')), '2026-07-01');
});

test('Månedsskifte: forrige måneds overskud og ny måned starter forfra', () => {
  const s = state({ tx: [{ id: 't1', date: '2026-10-20', amount: 1000, cat: 'mad' }] });
  const r = C.rollover(s, '2026-11-01');
  assert.equal(r.from, '2026-10');
  assert.equal(r.to, '2026-11');
  assert.equal(r.summary.left, 3700 - 228 - 1000);
  assert.equal(r.depositDate, '2026-10-31');
  // Lægges overskuddet i et mål på månedens sidste dag, går oktober i 0 – november er urørt
  s.deposits.push({ id: 'd', goalId: 'g1', amount: r.summary.left, date: r.depositDate });
  assert.equal(C.monthSummary(s, '2026-10').left, 0);
  assert.equal(C.monthSummary(s, '2026-11').left, 3700 - 228);
  assert.equal(C.rollover(s, '2026-10-31'), null);
  assert.equal(C.addMonths('2026-12', 1), '2027-01');
});

test('Overskredet kategori giver advarsel med flytte-forslag', () => {
  const s = state({ tx: [{ id: 't1', date: '2026-10-05', amount: 505, cat: 'toej' }, { id: 't2', date: '2026-10-06', amount: 100, cat: 'fri' }] });
  const w = C.warnings(s, '2026-10');
  const over = w.find(x => x.type === 'over');
  assert.equal(over.cat.id, 'toej');
  assert.equal(over.amount, 105);
  assert.equal(over.from.id, 'mad'); // Mad har 1000 tilbage – mest plads
  // Efter flytning er Tøj ikke længere over
  s.limitAdjust = { '2026-10': { toej: 105, mad: -105 } };
  assert.equal(C.warnings(s, '2026-10').some(x => x.type === 'over'), false);
});

test('80 %-advarsel', () => {
  const s = state({ tx: [{ id: 't1', date: '2026-10-05', amount: 330, cat: 'toej' }] });
  const near = C.warnings(s, '2026-10').find(x => x.type === 'near');
  assert.equal(near.cat.id, 'toej');
  assert.equal(near.remaining, 70);
});

test('Brugerens beløb læses dansk', () => {
  assert.equal(C.parseAmount('45'), 45);
  assert.equal(C.parseAmount('45,50'), 45.5);
  assert.equal(C.parseAmount('1.250'), 1250);
  assert.equal(C.parseAmount('1.250,75'), 1250.75);
  assert.equal(C.parseAmount('12.5'), 12.5);
  assert.equal(C.parseAmount(' 99 kr. '), 99);
  assert.ok(Number.isNaN(C.parseAmount('')));
  assert.ok(Number.isNaN(C.parseAmount('0')));
  assert.ok(Number.isNaN(C.parseAmount('abc')));
});

test('Sparemål: forventet dato', () => {
  const s = state();
  s.goals[0].monthly = 250;
  s.deposits.push({ id: 'd', goalId: 'g1', amount: 1350, date: '2026-10-01' });
  const eta = C.goalETA(s, s.goals[0], '2026-10-31');
  assert.equal(eta.months, 11); // (4000-1350)/250 = 10,6 → 11
  assert.equal(eta.ym, '2027-09');
  s.deposits.push({ id: 'd2', goalId: 'g1', amount: 3000, date: '2026-10-02' });
  assert.equal(C.goalETA(s, s.goals[0], '2026-10-31').done, true);
});

test('Faste udgifter: forfald og betalt', () => {
  const s = state();
  // Streaming har dag 31 – i november (30 dage) forfalder den d. 30.
  assert.deepEqual(C.dueFixed(s, '2026-11-28', 3).map(x => [x.f.id, x.dueDay]), [['f2', 30]]);
  s.paid = { '2026-11': ['f2'] };
  assert.equal(C.dueFixed(s, '2026-11-28', 3).length, 0);
  assert.deepEqual(C.dueFixed(s, '2026-11-03', 3).map(x => x.f.id), ['f1']);
});

test('Uger og forslag', () => {
  assert.equal(C.weekday('2026-11-02'), 1); // mandag
  assert.equal(C.weekKey('2026-11-02'), '2026-U45');
  assert.equal(C.weekKey('2027-01-01'), '2026-U53');
  const s = state({ tx: [{ id: 'a', date: '2026-10-27', amount: 80, cat: 'mad' }, { id: 'b', date: '2026-10-20', amount: 50, cat: 'fri' }] });
  const w = C.lastWeek(s, '2026-11-02');
  assert.deepEqual([w.start, w.end, w.spent, w.prevSpent, w.top.cat.id], ['2026-10-26', '2026-11-01', 80, 50, 'mad']);
  assert.deepEqual(C.suggestLimits(3000, [{ share: 50 }, { share: 30 }, { share: 20 }]), [1200, 700, 450]);
  const sug = C.saveSuggestion(s, '2026-10-16', 10);
  assert.equal(sug.amount, 370);
  assert.equal(C.saveSuggestion(s, '2026-10-16', 10) && true, true);
  // Startede brugeren efter lønnen kom denne måned, foreslås intet
  assert.equal(C.saveSuggestion(Object.assign({}, s, { createdAt: '2026-10-16' }), '2026-10-20', 10), null);
  s.settings.saveSuggest = false;
  assert.equal(C.saveSuggestion(s, '2026-10-16', 10), null);
});

test('Måneder før start tæller ikke indtægt med', () => {
  const s = state({ startMonth: '2026-10' });
  assert.equal(C.monthSummary(s, '2026-09').income, 0);
  assert.equal(C.monthSummary(s, '2026-10').income, 3700);
});
