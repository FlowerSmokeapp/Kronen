const test = require('node:test');
const assert = require('node:assert/strict');
const Csv = require('../js/csvimport.js');

test('Dansk netbank-CSV med semikolon og komma-decimaler', () => {
  const file = '﻿"Dato";"Tekst";"Beløb";"Saldo"\r\n"12.10.2026";"NETTO KBH";"-123,50";"4.876,50"\r\n"13.10.2026";"Løn";"3.200,00";"8.076,50"\r\n"14.10.2026";"DSB";"-24,00";"8.052,50"\r\n';
  const r = Csv.read(file);
  assert.equal(r.purchases.length, 2);
  assert.equal(r.incomeCount, 1);
  assert.deepEqual(r.purchases[0], { ext: r.purchases[0].ext, date: '2026-10-12', text: 'NETTO KBH', amount: 123.5 });
});

test('Engelsk format og ISO-datoer', () => {
  const r = Csv.read('Booking date,Description,Amount\n2026-10-02,"Spotify, Premium",-59.00\n2026-10-03,Refund,20.00\n');
  assert.equal(r.purchases.length, 1);
  assert.equal(r.purchases[0].text, 'Spotify, Premium');
  assert.equal(r.purchases[0].amount, 59);
});

test('Uden overskrifter gættes kolonnerne', () => {
  const r = Csv.read('01-11-2026;Rema 1000;-89,95\n02-11-2026;Steam;-149,00\n');
  assert.deepEqual(r.purchases.map(p => [p.date, p.text, p.amount]), [['2026-11-01', 'Rema 1000', 89.95], ['2026-11-02', 'Steam', 149]]);
});

test('To ens køb samme dag giver to forskellige id’er (og samme fil to gange giver samme id’er)', () => {
  const f = 'Dato;Tekst;Beløb\n01.11.2026;Kaffe;-25,00\n01.11.2026;Kaffe;-25,00\n';
  const a = Csv.read(f), b = Csv.read(f);
  assert.notEqual(a.purchases[0].ext, a.purchases[1].ext);
  assert.deepEqual(a.purchases.map(p => p.ext), b.purchases.map(p => p.ext));
});

test('Tal og datoer', () => {
  assert.equal(Csv.parseNumber('-1.234,56'), -1234.56);
  assert.equal(Csv.parseNumber('−45,00 kr.'), -45);
  assert.equal(Csv.parseDate('5/1/26'), '2026-01-05');
  assert.throws(() => Csv.read('hej\nmed dig'));
});
