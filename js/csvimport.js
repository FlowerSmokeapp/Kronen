/* Budgie – import af kontoudtog fra netbanken (CSV).
   Virker med de fleste danske banker: man eksporterer "Bevægelser" som CSV/Excel-fil
   og vælger filen i Budgie. Kun udgifter (negative beløb) importeres som køb.
   Kolonnerne findes automatisk ud fra overskrifterne (dato, tekst, beløb). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CsvImport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const DATE_HEADS = ['bogført', 'bogfort', 'bogføringsdato', 'dato', 'date', 'booking date', 'posteringsdato', 'transaktionsdato', 'rentedato', 'value date'];
  const TEXT_HEADS = ['tekst', 'text', 'beskrivelse', 'description', 'modtager', 'navn', 'name', 'posteringstekst', 'transaktionstekst', 'besked', 'merchant', 'payee', 'title'];
  const AMOUNT_HEADS = ['beløb', 'belob', 'beløb i dkk', 'amount', 'bevægelse', 'transaktionsbeløb'];

  /** Del en CSV-tekst op i rækker og celler (håndterer "citerede felter", ; , og tab). */
  function parseCSV(text) {
    text = String(text).replace(/^﻿/, '');
    const first = text.split(/\r?\n/).find(l => l.trim()) || '';
    const counts = { ';': (first.match(/;/g) || []).length, ',': (first.match(/,/g) || []).length, '\t': (first.match(/\t/g) || []).length };
    const sep = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === sep) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = ''; if (row.some(c => c.trim())) rows.push(row); row = [];
      } else cell += ch;
    }
    row.push(cell); if (row.some(c => c.trim())) rows.push(row);
    return rows.map(r => r.map(c => c.trim()));
  }
  /** "12.10.2026", "12-10-2026", "12/10/2026", "2026-10-12" → "2026-10-12" */
  function parseDate(s) {
    s = String(s || '').trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/);
    if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
    return null;
  }
  /** "-1.234,56", "−45,00", "-45.00", "1 234,50 kr." → tal (negativ = udgift) */
  function parseNumber(s) {
    s = String(s || '').replace(/\s|kr\.?|dkk/gi, '').replace(/[−–]/g, '-');
    if (!s) return NaN;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    return /^-?\d+(\.\d+)?$/.test(s) ? Math.round(Number(s) * 100) / 100 : NaN;
  }
  const norm = h => String(h || '').toLowerCase().replace(/["']/g, '').trim();
  const findCol = (heads, names) => {
    for (const n of names) { const i = heads.findIndex(h => h === n); if (i >= 0) return i; }
    for (const n of names) { const i = heads.findIndex(h => h.includes(n)); if (i >= 0) return i; }
    return -1;
  };
  /** Gæt kolonnerne ud fra indholdet, hvis der ikke er brugbare overskrifter. */
  function guessCols(rows) {
    const sample = rows.slice(0, 10), n = Math.max(...sample.map(r => r.length));
    const score = f => Array.from({ length: n }, (_, i) => sample.filter(r => f(r[i])).length);
    const ds = score(v => !!parseDate(v)), ns = score(v => !Number.isNaN(parseNumber(v)) && /[\d]/.test(v || '')), ts = score(v => /[a-zæøå]{3,}/i.test(v || ''));
    const date = ds.indexOf(Math.max(...ds));
    const amount = ns.map((v, i) => i === date ? -1 : v).indexOf(Math.max(...ns.map((v, i) => i === date ? -1 : v)));
    const text = ts.map((v, i) => i === date || i === amount ? -1 : v).indexOf(Math.max(...ts.map((v, i) => i === date || i === amount ? -1 : v)));
    return { date, text, amount };
  }

  /** Læs en hel fil. Returnerer { purchases, incomeCount, skipped, cols } */
  function read(text) {
    const rows = parseCSV(text);
    if (!rows.length) throw new Error('The file is empty.');
    const heads = rows[0].map(norm);
    let cols = { date: findCol(heads, DATE_HEADS), text: findCol(heads, TEXT_HEADS), amount: findCol(heads, AMOUNT_HEADS) };
    let body = rows.slice(1);
    if (cols.date < 0 || cols.amount < 0) { cols = guessCols(rows); body = parseDate(rows[0][cols.date]) ? rows : rows.slice(1); }
    if (cols.date < 0 || cols.amount < 0) throw new Error("Couldn't find the date and amount columns in this file.");
    const purchases = [], seen = {}; let incomeCount = 0, skipped = 0;
    for (const r of body) {
      const date = parseDate(r[cols.date]), amount = parseNumber(r[cols.amount]), txt = cols.text >= 0 ? r[cols.text] : '';
      if (!date || Number.isNaN(amount)) { skipped++; continue; }
      if (amount >= 0) { incomeCount++; continue; }
      const base = `csv-${date}-${-amount}-${txt.toLowerCase().replace(/\s+/g, ' ').slice(0, 40)}`;
      seen[base] = (seen[base] || 0) + 1; // to ens køb samme dag er to køb
      purchases.push({ ext: base + '-' + seen[base], date, text: txt || 'Purchase', amount: -amount });
    }
    if (!purchases.length && !incomeCount) throw new Error("Couldn't find any transactions in this file.");
    return { purchases, incomeCount, skipped, cols };
  }

  return { parseCSV, parseDate, parseNumber, read };
});
