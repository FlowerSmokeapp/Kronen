/* Budgie – alle beregninger samlet ét sted.
   Filen har ingen afhængigheder og kan testes med Node: `node --test tests/`
   Datoer er tekster i formatet "ÅÅÅÅ-MM-DD" og måneder "ÅÅÅÅ-MM" (dansk tid). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const TZ = 'Europe/Copenhagen';
  const DAY = 86400000;

  // ---------- Datoer ----------
  /** Dags dato i dansk tid som "ÅÅÅÅ-MM-DD". */
  function todayISO(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  }
  const ymOf = iso => iso.slice(0, 7);
  const dayOf = iso => Number(iso.slice(8, 10));
  const pad = n => String(n).padStart(2, '0');
  function daysInMonth(ym) {
    const [y, m] = ym.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }
  function addMonths(ym, n) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1);
  }
  function addDays(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d) + n * DAY);
    return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate());
  }
  const lastDayISO = ym => ym + '-' + pad(daysInMonth(ym));
  /** Ugedag: 1 = mandag … 7 = søndag */
  function weekday(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
  }
  /** ISO-uge som "ÅÅÅÅ-Uxx" */
  function weekKey(iso) {
    const thursday = addDays(iso, 4 - weekday(iso));
    const [y] = thursday.split('-').map(Number);
    const jan1 = Date.UTC(y, 0, 1);
    const [ty, tm, td] = thursday.split('-').map(Number);
    const week = Math.floor((Date.UTC(ty, tm - 1, td) - jan1) / DAY / 7) + 1;
    return y + '-U' + pad(week);
  }
  const daysBetween = (a, b) => {
    const [ay, am, ad] = a.split('-').map(Number), [by, bm, bd] = b.split('-').map(Number);
    return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY);
  };

  // ---------- Tal ----------
  const sum = (arr, f) => arr.reduce((s, x) => s + (f ? f(x) : x), 0);
  const round2 = n => Math.round(n * 100) / 100;
  /** Læser et beløb skrevet af en bruger: "45", "45,50", "1.250", "1.250,5", "12.5" */
  function parseAmount(input) {
    let s = String(input ?? '').trim().replace(/\s|kr\.?/gi, '');
    if (!s) return NaN;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
    const n = round2(Number(s));
    return n > 0 ? n : NaN;
  }

  // ---------- Måned ----------
  /** Er måneden med i budgettet? (Måneder før brugeren startede tæller ikke indtægt/faste med.) */
  const isActive = (s, ym) => !s.startMonth || ym >= s.startMonth;
  const incomeTotal = (s, ym) => (ym && !isActive(s, ym)) ? 0 : sum(s.incomes, i => i.amount);
  const fixedTotal = (s, ym) => (ym && !isActive(s, ym)) ? 0 : sum(s.fixed, f => f.amount);
  const txInMonth = (s, ym) => s.tx.filter(t => t.date.startsWith(ym));
  const spentInMonth = (s, ym) => sum(txInMonth(s, ym), t => t.amount);
  const savedInMonth = (s, ym) => sum(s.deposits.filter(d => d.date.startsWith(ym)), d => d.amount);
  const goalSaved = (s, goalId) => round2(sum(s.deposits.filter(d => d.goalId === goalId), d => d.amount));
  const totalSaved = s => round2(sum(s.deposits, d => d.amount));

  /** DEN centrale formel: Tilbage = indtægt − faste udgifter − brugt − sparet (denne måned). */
  function monthSummary(s, ym) {
    const income = incomeTotal(s, ym), fixed = fixedTotal(s, ym), spent = round2(spentInMonth(s, ym)), saved = round2(savedInMonth(s, ym));
    return { ym, income, fixed, spent, saved, left: round2(income - fixed - spent - saved) };
  }

  /** "Om dagen"-tal. daysLeft tæller i dag med. */
  function dayInfo(today, left) {
    const ym = ymOf(today), dim = daysInMonth(ym), day = dayOf(today);
    const daysLeft = dim - day + 1;
    return { daysLeft, dim, day, lastDay: daysLeft === 1, perDay: left > 0 ? round2(left / daysLeft) : 0 };
  }

  // ---------- Kategorier ----------
  const catAdjust = (s, catId, ym) => (s.limitAdjust && s.limitAdjust[ym] && s.limitAdjust[ym][catId]) || 0;
  const catLimit = (s, cat, ym) => Math.max(0, (cat.limit || 0) + catAdjust(s, cat.id, ym));
  const catSpent = (s, catId, ym) => round2(sum(txInMonth(s, ym).filter(t => t.cat === catId), t => t.amount));
  function catStatus(s, ym) {
    return s.cats.map(cat => {
      const spent = catSpent(s, cat.id, ym), limit = catLimit(s, cat, ym);
      return { cat, spent, limit, pct: limit ? spent / limit : 0, over: limit > 0 && spent > limit, remaining: round2(limit - spent) };
    });
  }
  /** Find en kategori, der har plads nok til at dække et overforbrug. */
  function suggestMove(s, ym, overCatId, amount) {
    const donors = catStatus(s, ym).filter(x => x.cat.id !== overCatId && x.limit > 0 && x.remaining >= amount);
    donors.sort((a, b) => b.remaining - a.remaining);
    return donors[0] ? donors[0].cat : null;
  }
  /** Advarsler, vigtigste først. */
  function warnings(s, ym) {
    const out = [], sum0 = monthSummary(s, ym);
    if (sum0.income > 0 && sum0.left < 0) out.push({ level: 'bad', type: 'total', amount: -sum0.left });
    for (const x of catStatus(s, ym)) {
      if (x.over) {
        const amount = round2(x.spent - x.limit);
        out.push({ level: 'bad', type: 'over', cat: x.cat, amount, from: suggestMove(s, ym, x.cat.id, amount) });
      } else if (x.limit > 0 && x.pct >= 0.8) out.push({ level: 'warn', type: 'near', cat: x.cat, pct: x.pct, remaining: x.remaining });
    }
    return out;
  }
  function topCategory(s, ym) {
    const list = catStatus(s, ym).filter(x => x.spent > 0).sort((a, b) => b.spent - a.spent);
    return list[0] || null;
  }
  /** Kategorier sorteret efter brug de sidste 60 dage (mest brugte først). */
  function usageOrder(s, today) {
    const from = addDays(today, -60), count = {};
    for (const t of s.tx) if (t.date >= from) count[t.cat] = (count[t.cat] || 0) + 1;
    return s.cats.map((c, i) => ({ c, i, n: count[c.id] || 0 })).sort((a, b) => b.n - a.n || a.i - b.i).map(x => x.c);
  }

  // ---------- Sammenligning ----------
  function compareMonths(s, ym) {
    const prev = addMonths(ym, -1);
    const a = monthSummary(s, ym), b = monthSummary(s, prev);
    const cur = a.spent, before = b.spent;
    return { prev, spent: cur, prevSpent: before, diff: round2(cur - before), pct: before > 0 ? (cur - before) / before : null,
      perCat: s.cats.map(c => ({ cat: c, spent: catSpent(s, c.id, ym), prev: catSpent(s, c.id, prev) })) };
  }
  /** Sidste hele uge (mandag–søndag) før den uge, `today` ligger i. */
  function lastWeek(s, today) {
    const monday = addDays(today, 1 - weekday(today));
    const start = addDays(monday, -7), end = addDays(monday, -1);
    const pstart = addDays(start, -7), pend = addDays(start, -1);
    const inR = (a, b) => s.tx.filter(t => t.date >= a && t.date <= b);
    const list = inR(start, end), prevList = inR(pstart, pend);
    const byCat = {};
    for (const t of list) byCat[t.cat] = (byCat[t.cat] || 0) + t.amount;
    const topId = Object.keys(byCat).sort((x, y) => byCat[y] - byCat[x])[0];
    return { start, end, spent: round2(sum(list, t => t.amount)), prevSpent: round2(sum(prevList, t => t.amount)), count: list.length,
      top: topId ? { cat: s.cats.find(c => c.id === topId), amount: round2(byCat[topId]) } : null };
  }

  // ---------- Sparemål ----------
  /** Hvor mange kr. lægger brugeren til side om måneden til målet? (fast beløb, ellers gennemsnit af de sidste 3 måneder) */
  function goalPerMonth(s, goal, today) {
    if (goal.monthly > 0) return goal.monthly;
    const ym = ymOf(today), months = [addMonths(ym, -2), addMonths(ym, -1), ym];
    const total = sum(s.deposits.filter(d => d.goalId === goal.id && months.includes(ymOf(d.date))), d => d.amount);
    return total > 0 ? round2(total / 3) : 0;
  }
  /** Forventet måned, hvor målet nås – eller null. */
  function goalETA(s, goal, today) {
    const remaining = goal.target - goalSaved(s, goal.id);
    if (remaining <= 0) return { done: true };
    const per = goalPerMonth(s, goal, today);
    if (!per) return null;
    const months = Math.ceil(remaining / per);
    return { done: false, perMonth: per, months, ym: addMonths(ymOf(today), months) };
  }

  // ---------- Faste udgifter ----------
  /** Ubetalte faste udgifter, der forfalder inden for `within` dage (0 = i dag). */
  function dueFixed(s, today, within) {
    const ym = ymOf(today), dim = daysInMonth(ym), day = dayOf(today), paid = (s.paid && s.paid[ym]) || [];
    return s.fixed.filter(f => !paid.includes(f.id))
      .map(f => ({ f, dueDay: Math.min(f.day || 1, dim), diff: Math.min(f.day || 1, dim) - day }))
      .filter(x => x.diff >= 0 && x.diff <= within).sort((a, b) => a.diff - b.diff);
  }

  // ---------- Månedsskifte ----------
  /** Er der startet en ny måned, siden appen sidst blev åbnet? */
  function rollover(s, today) {
    const ym = ymOf(today);
    if (!s.lastMonthSeen || s.lastMonthSeen >= ym) return null;
    const from = s.lastMonthSeen;
    return { from, to: ym, summary: monthSummary(s, from), depositDate: lastDayISO(from) };
  }

  // ---------- Forslag ----------
  /** Fordel et beløb på kategorier efter deres andel (round til nærmeste 50 kr.). */
  function suggestLimits(available, cats, savePct = 20) {
    const pool = Math.max(0, available * (1 - savePct / 100));
    const total = sum(cats, c => c.share || 1);
    return cats.map(c => Math.max(0, Math.floor((pool * (c.share || 1) / total) / 50) * 50));
  }
  /** Forslag om at lægge X % til side, når lønnen er kommet. */
  function saveSuggestion(s, today, pct) {
    const ym = ymOf(today), day = dayOf(today);
    if (!s.settings || !s.settings.saveSuggest || !s.goals.length) return null;
    if (s.settings.saveSuggestDismissed === ym) return null;
    if (savedInMonth(s, ym) > 0) return null;
    // Kun løn, der er kommet efter brugeren startede (ellers er lønnen nok allerede brugt)
    const startedThisMonth = s.createdAt && s.createdAt.startsWith(ym) ? dayOf(s.createdAt) : 0;
    const paidIncome = s.incomes.filter(i => (i.day || 1) <= day && (i.day || 1) >= startedThisMonth);
    if (!paidIncome.length) return null;
    const amount = Math.max(10, Math.round(sum(paidIncome, i => i.amount) * pct / 100 / 10) * 10);
    if (monthSummary(s, ym).left < amount) return null;
    return { amount, goal: s.goals[0] };
  }

  return { TZ, todayISO, ymOf, dayOf, daysInMonth, addMonths, addDays, lastDayISO, weekday, weekKey, daysBetween,
    sum, round2, parseAmount, isActive, incomeTotal, fixedTotal, txInMonth, spentInMonth, savedInMonth, goalSaved, totalSaved,
    monthSummary, dayInfo, catLimit, catSpent, catStatus, suggestMove, warnings, topCategory, usageOrder,
    compareMonths, lastWeek, goalPerMonth, goalETA, dueFixed, rollover, suggestLimits, saveSuggestion };
});
