/* Budgie – skærme og interaktion.
   Beregninger: js/calc.js · Lagring: js/store.js · Indstillinger/tekster: js/config.js */
(function () {
  const CFG = window.BUDGIE_CONFIG, Cx = window.Calc, St = window.Store;
  const uid = St.uid;
  let S = null;
  let today = Cx.todayISO(), curYM = today.slice(0, 7);

  // =====================================================================
  //  Hjælpere
  // =====================================================================
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf0 = new Intl.NumberFormat(CFG.locale || 'en-DK', { maximumFractionDigits: 0 });
  const nf2 = new Intl.NumberFormat(CFG.locale || 'en-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const kr = n => { const r = Math.round(n * 100) / 100; return (Number.isInteger(r) ? nf0.format(r) : nf2.format(r)) + ' ' + CFG.currency; };
  const amountInput = n => (n === '' || n == null) ? '' : String(n).replace('.', ',');
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const monthLong = (ym, year = true) => new Date(ym + '-15T12:00:00').toLocaleDateString('en-GB', year ? { month: 'long', year: 'numeric' } : { month: 'long' });
  const monthShort = ym => new Date(ym + '-15T12:00:00').toLocaleDateString('en-GB', { month: 'short' });
  const fmtDate = (iso, opts) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', opts);
  function dateLabel(iso) {
    if (iso === today) return 'Today';
    if (iso === Cx.addDays(today, -1)) return 'Yesterday';
    return fmtDate(iso, { weekday: 'short', day: 'numeric', month: 'short' });
  }
  const tint = (hex, a = 0.14) => `color-mix(in srgb, ${hex} ${Math.round(a * 100)}%, transparent)`;
  const catById = id => S.cats.find(c => c.id === id) || { id, name: 'Other', icon: 'sparkle', color: '#64748b' };
  const isPremium = () => !!S.premium;
  const reminderDays = () => isPremium() ? CFG.premium.reminderDays : CFG.free.reminderDays;
  const framed = window.self !== window.top;
  if (framed) document.documentElement.classList.add('framed');
  const icoBox = (name, color) => `<div class="ico" style="background:${tint(color)};color:${color}">${icon(name)}</div>`;

  function save() { St.save(S); const el = $('#savedAt'); if (el) el.innerHTML = savedAtText(); }
  function savedAtText() {
    const t = S.savedAt ? new Date(S.savedAt) : null;
    return `${icon('shield')} Saved on this device${t ? ' · ' + t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}`;
  }

  // ---------- Måling (GoatCounter – kun anonyme hændelser) ----------
  function loadAnalytics() {
    if (!CFG.goatcounter) return;
    const s = document.createElement('script');
    s.async = true; s.src = 'https://gc.zgo.at/count.js';
    s.dataset.goatcounter = `https://${CFG.goatcounter}.goatcounter.com/count`;
    document.head.appendChild(s);
  }
  function track(name) { try { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: name, title: name, event: true }); } catch (e) { } }
  function trackOnce(name) {
    if (!S || S.demo || S.events[name]) return;
    S.events[name] = today; save(); track(name);
  }

  // ---------- Toast med Fortryd ----------
  let toastTimer = null, toastUndo = null;
  function toast(msg, undo) {
    const t = $('#toast');
    toastUndo = undo || null;
    t.innerHTML = `<span class="msg">${msg}</span>${undo ? '<button type="button" id="undoBtn">Undo</button>' : ''}`;
    if (undo) $('#undoBtn').onclick = () => { const f = toastUndo; toastUndo = null; t.classList.remove('show'); f && f(); };
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.classList.remove('show'); toastUndo = null; }, undo ? 5000 : 2600);
  }
  /** Gem et øjebliksbillede, så ændringen kan fortrydes. */
  function withUndo(msg, change) {
    const snap = JSON.stringify(S);
    change(); save(); render();
    toast(msg, () => { S = St.normalize(JSON.parse(snap)); save(); render(); toast('Restored'); });
  }

  // ---------- Ark (bottom sheet) ----------
  let sheetClose = null;
  function openSheet(title, html, onClose) {
    $('#sheet').innerHTML = `<div class="grab"></div><div class="head"><h3>${title}</h3><button class="icon-btn" type="button" data-close aria-label="Close">${icon('x')}</button></div>${html}`;
    $('#modal').classList.add('open');
    $('#sheet [data-close]').onclick = closeSheet;
    sheetClose = onClose || null;
  }
  function closeSheet() { $('#modal').classList.remove('open'); const f = sheetClose; sheetClose = null; f && f(); }
  function confirmSheet(title, text, okLabel, onOk, danger = true) {
    openSheet(title, `<p class="muted" style="margin:0 0 16px">${text}</p>
      <div class="btns"><button class="btn soft" data-close>Cancel</button><button class="btn ${danger ? 'danger' : ''}" id="okBtn">${okLabel}</button></div>`);
    $('#sheet .btns [data-close]').onclick = closeSheet;
    $('#okBtn').onclick = () => { closeSheet(); onOk(); };
  }

  // ---------- Konfetti ----------
  function confetti() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = document.createElement('div'); box.className = 'confetti';
    const cols = CFG.colors;
    for (let i = 0; i < 60; i++) {
      const p = document.createElement('i');
      p.style.left = Math.random() * 100 + '%'; p.style.background = cols[i % cols.length];
      p.style.animationDelay = Math.random() * 0.5 + 's'; p.style.animationDuration = 1.4 + Math.random() * 1.2 + 's';
      box.appendChild(p);
    }
    document.body.appendChild(box); setTimeout(() => box.remove(), 3200);
  }

  // =====================================================================
  //  Velkomst & onboarding
  // =====================================================================
  // ---------- Konto: opret / log ind ----------
  function showAuth(mode = 'signup') {
    document.body.classList.remove('has-nav');
    const signup = mode === 'signup';
    $('#root').innerHTML = `<div class="flow auth">
      <img class="logo" src="icons/icon-192.png" alt="">
      <h1>${signup ? 'Create your account' : 'Welcome back'}</h1>
      <p class="lead">${signup ? esc(CFG.texts.welcomeText) : 'Log in to see your budget.'}</p>
      <form id="authForm" novalidate>
        ${signup ? `<label class="f">First name<input name="name" autocomplete="given-name" placeholder="e.g. Emma" required></label>` : ''}
        <label class="f">Email<input name="email" type="email" autocomplete="email" inputmode="email" placeholder="you@email.com" required></label>
        <label class="f">Password<span class="pw"><input name="pw" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" placeholder="${signup ? 'At least 6 characters' : ''}" required minlength="6">
          <button type="button" class="icon-btn" id="pwEye" aria-label="Show password">${icon('eye')}</button></span></label>
        <p class="small" id="authErr" role="alert" style="color:var(--bad);margin:0;min-height:1.2em"></p>
        <button class="btn" id="authBtn">${signup ? 'Create account' : 'Log in'}</button>
      </form>
      <div class="foot">
        <button class="btn line" id="swap">${signup ? 'I already have an account' : 'Create a new account'}</button>
        <button class="btn sm soft" id="demo" style="align-self:center;background:none">Look around with sample data first</button>
        <p class="small muted" style="text-align:center;margin:0">${icon('shield', 'tiny')} ${Auth.LOCAL_ONLY ? 'Your account is stored securely on this device.' : 'Your account is stored securely.'}</p>
      </div></div>`;
    $('#swap').onclick = () => showAuth(signup ? 'login' : 'signup');
    $('#pwEye').onclick = () => { const i = $('#authForm [name=pw]'); i.type = i.type === 'password' ? 'text' : 'password'; };
    $('#demo').onclick = () => { Auth.startDemo(); enterApp(Auth.current(), false); };
    $('#authForm').onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(e.target), btn = $('#authBtn'); btn.disabled = true; $('#authErr').textContent = '';
      try {
        const acc = signup ? await Auth.signUp(f.get('name'), f.get('email'), f.get('pw')) : await Auth.logIn(f.get('email'), f.get('pw'));
        if (signup) track('signup');
        enterApp(acc, true, signup);
      } catch (err) { $('#authErr').textContent = err.userFacing ? err.message : 'Something went wrong. Please try again.'; btn.disabled = false; }
    };
    setTimeout(() => { const i = $('#authForm input'); if (i) i.focus(); }, 60);
  }

  /** Åbn en kontos data. Efter oprettelse/login vises Premium-tilbuddet først. */
  function enterApp(acc, showOffer, isNew) {
    St.useAccount(acc.id, isNew && !acc.demo);
    S = St.load();
    if (!S) {
      if (acc.demo) S = St.demo(today);
      else { S = St.blank(today); S.name = acc.name; }
      save();
    }
    if (!acc.demo && acc.name && !S.name) S.name = acc.name;
    if (showOffer && !S.premium && !acc.demo) premiumOffer(); else startApp();
  }

  // ---------- Premium-tilbud (første skærm efter login) ----------
  function premiumOffer() {
    track('premium-offer-shown');
    document.body.classList.remove('has-nav');
    let plan = 'year';
    const saving = Math.round((1 - CFG.prices.year / (CFG.prices.month * 12)) * 100);
    const feats = [
      ['wallet', 'Unlimited categories', `Free has ${CFG.free.categories}`],
      ['target', 'Unlimited savings goals', `Free has ${CFG.free.goals}`],
      ['chart', 'Year overview', 'See all 12 months in one chart'],
      ['bell', 'Bill reminders a week ahead', `Free reminds you ${CFG.free.reminderDays} days before`],
      ['file', 'Export to Excel & PDF', 'Take your numbers anywhere'],
      ['sparkle', 'Widgets & themes', 'Coming soon'],
    ];
    $('#root').innerHTML = `<div class="flow offer">
      <button class="icon-btn round close" id="offerX" aria-label="Close and continue with Free">${icon('x')}</button>
      <span class="pro" style="align-self:flex-start">PREMIUM</span>
      <h1>Get more out of Budgie</h1>
      <p class="lead">Everything in Free, plus:</p>
      <div class="offer-list">${feats.map(f => `<div class="feat"><div class="ico">${icon(f[0])}</div><div><b>${f[1]}</b><small>${f[2]}</small></div></div>`).join('')}</div>
      <div class="seg" id="plans" style="margin-top:14px"><button data-plan="month">${CFG.prices.month} kr.<small>per month</small></button><button class="on" data-plan="year">${CFG.prices.year} kr.<small>per year · save ${saving}%</small></button></div>
      <div class="foot" id="offerAct" style="padding-top:4px">
        <button class="btn" id="offerTry">Try Premium free for 14 days</button>
        <button class="btn sm soft" id="offerSkip" style="align-self:center;background:none">Continue with Free</button>
        <p class="small muted" style="text-align:center;margin:0">Premium isn't open yet – nothing is charged. Tapping “Try” just tells us you're interested.</p>
      </div></div>`;
    document.querySelectorAll('#plans [data-plan]').forEach(b => b.onclick = () => { plan = b.dataset.plan; document.querySelectorAll('#plans button').forEach(x => x.classList.toggle('on', x === b)); });
    const go = () => { track('premium-offer-closed'); startApp(); };
    $('#offerX').onclick = go; $('#offerSkip').onclick = go;
    $('#offerTry').onclick = () => {
      track('premium-trial-' + plan); S.events['premium-interest'] = today; save();
      $('#offerAct').innerHTML = `<div class="note ok">${icon('check')}<div class="body">Thanks! Premium isn't open yet – we'll use this to decide when to launch it.</div></div><button class="btn" id="offerGo">Continue to Budgie</button>`;
      $('#offerGo').onclick = startApp;
    };
  }

  let OB = null;
  /** "Set up your budget": indtægt → faste udgifter → grænser → sparemål. Kan åbnes igen fra appen. */
  function startOnboarding() {
    const shareOf = c => (CFG.categories.find(x => x.icon === c.icon || x.name === c.name) || {}).share || 10;
    const fixedSug = CFG.fixedSuggestions.filter(f => !S.fixed.some(x => x.name.toLowerCase() === f.name.toLowerCase())).map(f => ({ ...f, amount: String(f.amount) }));
    OB = {
      step: 2, first: 2,
      incomes: S.incomes.length ? S.incomes.map(i => ({ id: i.id, kind: i.kind, amount: String(i.amount), day: i.day || 1 })) : [{ kind: CFG.incomeTypes[0], amount: '', day: 1 }],
      fixed: [...S.fixed.map(f => ({ id: f.id, name: f.name, amount: String(f.amount), day: f.day, icon: f.icon, on: true })), ...fixedSug],
      cats: S.budgetSet ? S.cats.map(c => ({ id: c.id, name: c.name, icon: c.icon, color: c.color, share: shareOf(c), limit: String(c.limit || '') })) : null,
      goal: { name: CFG.goalSuggestions[0], target: '', monthly: '' },
    };
    document.body.classList.remove('has-nav');
    obRender();
  }
  const obIncome = () => Cx.sum(OB.incomes, i => Cx.parseAmount(i.amount) || 0);
  const obFixed = () => Cx.sum(OB.fixed.filter(f => f.on), f => Cx.parseAmount(f.amount) || 0);
  const obAvail = () => Math.max(0, obIncome() - obFixed());
  const obLimits = () => Cx.sum(OB.cats || [], c => Cx.parseAmount(c.limit) || 0);
  const STEPS = 5;

  function obRender() {
    const n = OB.step, total = STEPS - OB.first + 1, nr = n - OB.first + 1;
    const progress = Array.from({ length: total }, (_, i) => `<i class="${i < nr ? 'on' : ''}"></i>`).join('');
    let body = '', foot = '';
    if (n === 1) {
      body = `<h1>What should we call you?</h1><p class="lead">Just your first name. It stays on your phone.</p>
        <label class="f">First name<input id="obName" autocomplete="given-name" value="${esc(OB.name)}" placeholder="e.g. Emma" enterkeyhint="next"></label>`;
      foot = `<button class="btn" data-next>Next</button>`;
    } else if (n === 2) {
      body = `<h1>How much money do you get each month?</h1><p class="lead">Salary, pocket money or a student grant. A rough number is fine.</p>
        ${OB.incomes.map((inc, i) => `<div class="card">
          <div class="chips" style="margin-bottom:12px">${CFG.incomeTypes.map(k => `<button type="button" class="chip ${k === inc.kind ? 'on' : ''}" data-kind="${i}|${esc(k)}">${esc(k)}</button>`).join('')}</div>
          <div class="two">
            <label class="f">Amount per month<span class="money"><input inputmode="decimal" data-inc-amt="${i}" value="${esc(amountInput(inc.amount))}" placeholder="0"></span></label>
            <label class="f">Payday (day of month)<input type="number" inputmode="numeric" min="1" max="31" data-inc-day="${i}" value="${inc.day}"></label>
          </div>
          ${OB.incomes.length > 1 ? `<button type="button" class="btn sm soft" style="margin-top:10px" data-inc-del="${i}">Remove</button>` : ''}
        </div>`).join('')}
        <button type="button" class="btn soft" id="addInc">${icon('plus')} Add another income</button>
        <p class="small muted" id="obErr" style="color:var(--bad);min-height:1.2em"></p>`;
      foot = `<button class="btn" data-next>Next</button><button class="btn sm soft" style="background:none" id="noInc">I don't have a fixed income</button>`;
    } else if (n === 3) {
      body = `<h1>Fixed expenses</h1><p class="lead">Money that leaves your account by itself every month. Tick the ones you have.</p>
        <div class="card" style="padding:6px 14px">${OB.fixed.map((f, i) => `<div class="sug">
          <button type="button" class="check ${f.on ? 'on' : ''}" data-fx-on="${i}" aria-pressed="${!!f.on}" aria-label="${esc(f.name || 'Expense')}">${icon('check')}</button>
          <div class="g">${f.custom ? `<input data-fx-name="${i}" value="${esc(f.name)}" placeholder="Name" style="min-height:44px">` : esc(f.name)}</div>
          <span class="money"><input inputmode="decimal" data-fx-amt="${i}" value="${esc(amountInput(f.amount))}" placeholder="0"></span></div>`).join('')}</div>
        <button type="button" class="btn soft" id="addFx">${icon('plus')} Add another</button>
        <p class="muted" style="text-align:center">Total: <b id="fxTotal" class="num">${kr(obFixed())}</b> a month</p>`;
      foot = `<button class="btn" data-next>Next</button>`;
    } else if (n === 4) {
      if (!OB.cats) {
        const base = S.cats.map(c => ({ id: c.id, name: c.name, icon: c.icon, color: c.color, share: (CFG.categories.find(x => x.icon === c.icon || x.name === c.name) || {}).share || 10 }));
        const lim = Cx.suggestLimits(obAvail(), base, CFG.savePctDefault);
        OB.cats = base.map((c, i) => ({ ...c, limit: String(lim[i]) }));
      }
      body = `<h1>Your monthly budget</h1><p class="lead">After fixed expenses you have <b>${kr(obAvail())}</b> a month to spend and save.</p>
        <div class="tip"><b>Rule of thumb:</b> put about ${CFG.savePctDefault}% aside, and split the rest between things you need and things that are fun. You can change it all later.</div>
        <div class="card" style="padding:6px 14px">${OB.cats.map((c, i) => `<div class="sug">${icoBox(c.icon, c.color)}<div class="g">${esc(c.name)}</div>
          <span class="money"><input inputmode="decimal" data-cat-lim="${i}" value="${esc(amountInput(c.limit))}" placeholder="0" aria-label="Limit for ${esc(c.name)}"></span></div>`).join('')}</div>
        <p class="muted" style="text-align:center">Left to save: <b id="leftSave" class="num">${kr(obAvail() - obLimits())}</b> a month</p>`;
      foot = `<button class="btn" data-next>Next</button>`;
    } else if (n === 5) {
      if (!OB.goal.monthly) OB.goal.monthly = String(Math.max(0, Math.floor((obAvail() - obLimits()) / 50) * 50) || '');
      const hasGoal = S.goals.length > 0;
      body = hasGoal ? `<h1>You're all set</h1><p class="lead">You already have a savings goal: <b>${esc(S.goals[0].name)}</b>. You can change it under Goals.</p>` : `<h1>What are you saving for?</h1><p class="lead">A goal makes it easier to stick to the plan.</p>
        <div class="chips" style="margin-bottom:14px">${CFG.goalSuggestions.map(g => `<button type="button" class="chip ${g === OB.goal.name ? 'on' : ''}" data-goal="${esc(g)}">${esc(g)}</button>`).join('')}</div>
        <form id="obGoal" onsubmit="return false">
          <label class="f">Goal<input id="gName" value="${esc(OB.goal.name)}" placeholder="e.g. New phone"></label>
          <div class="two">
            <label class="f">Price<span class="money"><input id="gTarget" inputmode="decimal" value="${esc(amountInput(OB.goal.target))}" placeholder="0"></span></label>
            <label class="f">Save per month<span class="money"><input id="gMonthly" inputmode="decimal" value="${esc(amountInput(OB.goal.monthly))}" placeholder="0"></span></label>
          </div></form>
        <p class="muted" id="gEta" style="text-align:center;min-height:1.4em"></p>`;
      foot = hasGoal ? `<button class="btn" id="skipGoal">Finish</button>` : `<button class="btn" id="finish">Finish</button><button class="btn sm soft" style="background:none" id="skipGoal">Skip for now</button>`;
    }
    $('#root').innerHTML = `<div class="flow"><div class="flow-top"><button class="icon-btn" id="back" aria-label="Back">${icon('left')}</button><div class="progress" aria-label="Step ${nr} of ${total}">${progress}</div><span class="small muted nowrap" style="min-width:44px;text-align:right">${nr}/${total}</span></div>
      <div class="grow">${body}</div><div class="foot">${foot}</div></div>`;
    window.scrollTo(0, 0);
    obBind();
  }

  function obBind() {
    const n = OB.step, root = $('#root');
    $('#back').onclick = () => { if (OB.step === OB.first) { OB = null; startApp(); } else { OB.step--; obRender(); } };
    const next = root.querySelector('[data-next]');
    if (next) next.onclick = obNext;
    if (n === 1) { const i = $('#obName'); i.oninput = () => OB.name = i.value; i.onkeydown = e => { if (e.key === 'Enter') obNext(); }; setTimeout(() => i.focus(), 50); }
    if (n === 2) {
      root.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => { const [i, k] = b.dataset.kind.split('|'); OB.incomes[i].kind = k; obRender(); });
      root.querySelectorAll('[data-inc-amt]').forEach(el => el.oninput = () => OB.incomes[el.dataset.incAmt].amount = el.value);
      root.querySelectorAll('[data-inc-day]').forEach(el => el.oninput = () => OB.incomes[el.dataset.incDay].day = clamp(parseInt(el.value) || 1, 1, 31));
      root.querySelectorAll('[data-inc-del]').forEach(b => b.onclick = () => { OB.incomes.splice(+b.dataset.incDel, 1); obRender(); });
      $('#addInc').onclick = () => { OB.incomes.push({ kind: CFG.incomeTypes[1] || CFG.incomeTypes[0], amount: '', day: 1 }); obRender(); };
      $('#noInc').onclick = () => { OB.incomes = []; OB.step = 3; obRender(); };
    }
    if (n === 3) {
      const upd = () => $('#fxTotal').textContent = kr(obFixed());
      root.querySelectorAll('[data-fx-on]').forEach(b => b.onclick = () => { const f = OB.fixed[b.dataset.fxOn]; f.on = !f.on; b.classList.toggle('on', f.on); b.setAttribute('aria-pressed', f.on); upd(); });
      root.querySelectorAll('[data-fx-amt]').forEach(el => el.oninput = () => { const f = OB.fixed[el.dataset.fxAmt]; f.amount = el.value; if (Cx.parseAmount(el.value) > 0 && !f.on) { f.on = true; root.querySelector(`[data-fx-on="${el.dataset.fxAmt}"]`).classList.add('on'); } upd(); });
      root.querySelectorAll('[data-fx-name]').forEach(el => el.oninput = () => OB.fixed[el.dataset.fxName].name = el.value);
      $('#addFx').onclick = () => { OB.fixed.push({ name: '', amount: '', day: 1, icon: 'repeat', on: true, custom: true }); obRender(); const ins = root.querySelectorAll('[data-fx-name]'); ins[ins.length - 1]?.focus(); };
      if (!S.budgetSet) OB.cats = null; // genberegn forslag, hvis tallene ændres
    }
    if (n === 4) root.querySelectorAll('[data-cat-lim]').forEach(el => el.oninput = () => { OB.cats[el.dataset.catLim].limit = el.value; $('#leftSave').textContent = kr(obAvail() - obLimits()); });
    if (n === 5 && S.goals.length) { $('#skipGoal').onclick = () => obFinish(false); return; }
    if (n === 5) {
      const eta = () => {
        const t = Cx.parseAmount(OB.goal.target), m = Cx.parseAmount(OB.goal.monthly);
        $('#gEta').innerHTML = t > 0 && m > 0 ? `At ${kr(m)} a month you'll get there in <b>${monthLong(Cx.addMonths(curYM, Math.ceil(t / m)))}</b>.` : '';
      };
      root.querySelectorAll('[data-goal]').forEach(b => b.onclick = () => { OB.goal.name = b.dataset.goal; obRender(); });
      $('#gName').oninput = e => { OB.goal.name = e.target.value; root.querySelectorAll('[data-goal]').forEach(b => b.classList.toggle('on', b.dataset.goal === e.target.value)); };
      $('#gTarget').oninput = e => { OB.goal.target = e.target.value; eta(); };
      $('#gMonthly').oninput = e => { OB.goal.monthly = e.target.value; eta(); };
      eta();
      $('#finish').onclick = () => obFinish(true);
      $('#skipGoal').onclick = () => obFinish(false);
    }
  }
  function obNext() {
    if (OB.step === 2) {
      if (!(obIncome() > 0)) { $('#obErr').textContent = "Add at least one amount – or tap \"I don't have a fixed income\"."; return; }
    }
    OB.step++; obRender();
  }
  function obFinish(withGoal) {
    if (withGoal && !(Cx.parseAmount(OB.goal.target) > 0 && OB.goal.name.trim())) { toast('Add a name and a price – or tap "Skip for now"'); return; }
    const prev = S.incomes;
    S.incomes = OB.incomes.filter(i => Cx.parseAmount(i.amount) > 0).map(i => {
      const old = prev.find(x => x.id === i.id);
      return { id: i.id || uid(), kind: i.kind, name: old && old.name !== old.kind ? old.name : i.kind, amount: Cx.parseAmount(i.amount), day: +i.day || 1 };
    });
    S.fixed = OB.fixed.filter(f => f.on && Cx.parseAmount(f.amount) > 0).map(f => ({ id: f.id || uid(), name: (f.name || 'Fixed expense').trim(), amount: Cx.parseAmount(f.amount), day: f.day || 1, icon: f.icon || 'repeat' }));
    if (OB.cats) for (const c of OB.cats) { const t = S.cats.find(x => x.id === c.id); if (t) t.limit = Cx.parseAmount(c.limit) || 0; }
    if (withGoal) S.goals.push({ id: uid(), name: OB.goal.name.trim(), target: Cx.parseAmount(OB.goal.target), monthly: Cx.parseAmount(OB.goal.monthly) || 0, icon: 'star' });
    const first = !S.budgetSet;
    S.budgetSet = true;
    OB = null; save(); trackOnce('onboarding-done');
    startApp(); if (first) confetti(); toast(first ? 'Your budget is ready!' : 'Budget updated');
  }

  // =====================================================================
  //  App-skal og navigation
  // =====================================================================
  const VIEWS = ['home', 'budget', 'goals', 'report'];
  let view = 'home';
  function startApp() {
    const h = location.hash.slice(1); view = VIEWS.includes(h) ? h : 'home';
    document.body.classList.add('has-nav');
    $('#root').innerHTML = `<div class="app"><div id="install"></div><main id="view"></main></div>
      <nav class="bottom" aria-label="Menu"><div class="in">
        <button data-v="home">${icon('home')}<span>Home</span></button>
        <button data-v="budget">${icon('wallet')}<span>Budget</span></button>
        <button class="add" id="addBtn" aria-label="Add purchase">${icon('plus')}</button>
        <button data-v="goals">${icon('target')}<span>Goals</span></button>
        <button data-v="report">${icon('chart')}<span>Stats</span></button>
      </div></nav>`;
    document.querySelectorAll('nav [data-v]').forEach(b => b.onclick = () => go(b.dataset.v));
    $('#addBtn').onclick = () => openTx();
    if (!S.demo && Cx.daysBetween(S.createdAt, today) >= 7) trackOnce('return-7d');
    showInstall();
    render();
    monthCheck();
    if (S.bank && S.bank.lastSync !== today) syncBank(false);
  }
  function go(v, opts = {}) {
    view = v; if (opts.tab) budgetTab = opts.tab;
    history.replaceState(null, '', '#' + v); render(); window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (S && VIEWS.includes(v) && $('#view')) { view = v; render(); } });

  let lastRing = null;
  function render() {
    if (!S || !$('#view')) return;
    document.querySelectorAll('nav [data-v]').forEach(b => { const on = b.dataset.v === view; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
    $('#view').innerHTML = ({ home: vHome, budget: vBudget, goals: vGoals, report: vReport })[view]();
    bindView();
    const arc = $('.ring .arc');
    if (arc) requestAnimationFrame(() => requestAnimationFrame(() => { arc.style.strokeDashoffset = arc.dataset.to; lastRing = arc.dataset.to; }));
  }
  /** Knapper med data-act="navn|arg1|arg2" kalder ACT[navn](arg1, arg2). */
  function bindView() {
    document.querySelectorAll('#view [data-act]').forEach(el => {
      el.onclick = e => { e.preventDefault(); const [a, ...args] = el.dataset.act.split('|'); ACT[a](...args); };
    });
    if (view === 'budget' && budgetTab === 'purchases') bindTxList();
  }

  // Ny dag / ny måned, mens appen er åben
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const t = Cx.todayISO();
    if (t !== today) { const newMonth = t.slice(0, 7) !== curYM; today = t; curYM = t.slice(0, 7); if (newMonth) { repYM = null; txFilter.ym = null; } if (S && $('#view')) { render(); monthCheck(); } }
  });

  // =====================================================================
  //  Månedsskifte
  // =====================================================================
  function monthCheck() {
    const r = Cx.rollover(S, today);
    if (!r) return;
    S.lastMonthSeen = curYM; save();
    if (S.demo) return;
    const left = r.summary.left, from = monthLong(r.from, false);
    const carry = '<p class="small muted" style="margin:12px 0 0">Your income and fixed expenses carry over automatically.</p>';
    if (left > 0 && S.goals.length) {
      openSheet(`Hello, ${monthLong(curYM, false)}!`, `<p style="margin:0 0 14px">You had <b>${kr(left)}</b> left over in ${from}. Nice work! Want to put it aside?</p>
        <div style="display:flex;flex-direction:column;gap:10px">${S.goals.map(g => `<button class="btn" data-goal="${g.id}">${icon('piggy')} Put it in “${esc(g.name)}”</button>`).join('')}
        <button class="btn soft" data-close>No thanks</button></div>${carry}`);
      $('#sheet .btns, #sheet button.soft[data-close]') && ($('#sheet button.soft[data-close]').onclick = closeSheet);
      document.querySelectorAll('#sheet [data-goal]').forEach(b => b.onclick = () => {
        const g = S.goals.find(x => x.id === b.dataset.goal);
        addDeposit(g, left, r.depositDate); closeSheet();
      });
    } else if (left > 0) {
      openSheet(`Hello, ${monthLong(curYM, false)}!`, `<p style="margin:0 0 14px">You had <b>${kr(left)}</b> left over in ${from}. Create a savings goal to put money like that aside.</p>
        <div class="btns"><button class="btn soft" data-close>Close</button><button class="btn" id="mkGoal">Create a goal</button></div>${carry}`);
      $('#sheet .btns [data-close]').onclick = closeSheet;
      $('#mkGoal').onclick = () => { closeSheet(); go('goals'); goalSheet(); };
    } else {
      openSheet(`Hello, ${monthLong(curYM, false)}!`, `<p style="margin:0 0 14px">${left < 0 ? `${from} went <b>${kr(-left)}</b> over budget. ` : ''}New month, fresh start – your budget has been reset.</p>
        <button class="btn" data-close>Let's go</button>${carry}`);
      $('#sheet button.btn[data-close]').onclick = closeSheet;
    }
  }

  // =====================================================================
  //  HJEM
  // =====================================================================
  function header(title, sub, right = '') {
    return `<header class="top"><div><small>${sub || ''}</small><h1>${title}</h1></div>${right}</header>`;
  }
  const gearBtn = () => `<button class="icon-btn round" data-act="settings" aria-label="Settings">${icon('gear')}</button>`;

  function vHome() {
    const m = Cx.monthSummary(S, curYM), d = Cx.dayInfo(today, m.left);
    const noIncome = !S.incomes.length;
    const pct = m.income > 0 ? clamp(m.left / m.income, 0, 1) : 0;
    const col = m.left < 0 ? 'var(--bad)' : pct < 0.15 ? 'var(--warn)' : 'var(--brand)';
    const R = 100, Cc = 2 * Math.PI * R, to = Cc * (1 - pct), from = lastRing ?? Cc;
    let sub;
    if (noIncome) sub = 'Add your income in Budget';
    else if (d.lastDay) sub = m.left > 0 ? 'Last day of the month.<br>What’s left can go to savings.' : 'Last day of the month';
    else if (m.left <= 0) sub = `${plural(d.daysLeft, 'day', 'days')} left · budget used up`;
    else sub = `${plural(d.daysLeft, 'day', 'days')} left<br>about ${kr(Math.floor(d.perDay))} a day`;
    const mon = monthLong(curYM, false);
    const total = Cx.totalSaved(S);
    const recent = S.tx.filter(t => t.date <= today).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);

    const top = Cx.topCategory(S, curYM), goal = S.goals[0];
    const notice = warningCards(1) || dueCard() || saveTipCard() || weekCard() || backupCard();
    const hero = !S.budgetSet
      ? `<section class="card setup"><div class="ico big">${icon('wallet')}</div><h2>Let's set up your budget</h2>
          <p class="muted">Tell Budgie what comes in and what goes out. It takes about 2 minutes.</p>
          <button class="btn" data-act="setup">Set up your budget</button>
          <button class="btn line" data-act="bank">${icon('bank')} Import from your bank</button></section>`
      : `<section class="card hero" aria-label="Money left this month">
        <div class="ring"><svg viewBox="0 0 230 230" aria-hidden="true"><circle cx="115" cy="115" r="${R}" fill="none" stroke="var(--soft)" stroke-width="16"/>
          <circle class="arc" cx="115" cy="115" r="${R}" fill="none" stroke="${col}" stroke-width="16" stroke-linecap="round" stroke-dasharray="${Cc}" stroke-dashoffset="${from}" data-to="${to}"/></svg>
          <div class="c"><div class="l">Left in ${mon}</div>
            <div class="a" style="${m.left < 0 ? 'color:var(--bad)' : ''}">${kr(m.left)}</div>
            <div class="d">${sub}</div></div></div>
        <div class="trio"><div><small>Income</small><b>${kr(m.income)}</b></div><div><small>Spent</small><b>${kr(m.fixed + m.spent)}</b></div><div><small>Saved</small><b>${kr(total)}</b></div></div>
      </section>`;
    const tile = (ic, title, sub, act, color) => `<button class="tile" data-act="${act}"><span class="ico" style="background:${tint(color)};color:${color}">${icon(ic)}</span><b>${title}</b><small>${sub}</small></button>`;
    const goalPct = goal ? Math.round(clamp(Cx.goalSaved(S, goal.id) / goal.target, 0, 1) * 100) : 0;
    const tiles = `<section class="tiles" aria-label="Features">
      ${tile('wallet', 'Budget', S.budgetSet ? `${plural(S.cats.length, 'category', 'categories')}` : 'Set it up', S.budgetSet ? 'go|budget|categories' : 'setup', '#4f46e5')}
      ${tile('chart', 'Statistics', top ? `Most on ${esc(top.cat.name)}` : 'Where money goes', 'go|report', '#0284c7')}
      ${tile('target', 'Goals', goal ? `${goalPct}% of ${esc(goal.name)}` : 'Save for something', 'go|goals', '#059669')}
      ${tile('bank', S.bank ? esc(S.bank.name) : 'Connect bank', S.bank ? (S.bank.lastSyncAt ? 'Synced ' + dateLabel(S.bank.lastSync).toLowerCase() : 'Connected') : 'Import purchases', 'bank', '#ea580c')}
    </section>`;

    return header(`Hi${S.name ? ', ' + esc(S.name) : ''}`, monthLong(curYM), gearBtn()) +
      demoBanner() + hero + notice + tiles +
      `<section class="card"><div class="sec"><h2>Latest purchases</h2>${S.tx.length ? `<button class="link" data-act="go|budget|purchases">See all</button>` : ''}</div>
        ${recent.length ? recent.map(txRow).join('') : `<p class="empty">No purchases yet. Tap <b>+</b> to add one – it takes 3 seconds.</p>`}</section>
      <p class="saved-at" id="savedAt">${savedAtText()}</p>`;
  }

  function demoBanner() {
    if (!S.demo) return '';
    return `<div class="note info">${icon('info')}<div class="body">You're looking at <b>sample data</b>. Have a look around!
      <div class="acts"><button class="btn sm" data-act="startOwn">Start with my own numbers</button></div></div></div>`;
  }
  function warningCards(max = 2) {
    const w = Cx.warnings(S, curYM).slice(0, max);
    return w.map(x => {
      if (x.type === 'total') return `<div class="note bad" role="alert">${icon('alert')}<div class="body">You've spent <b>${kr(x.amount)}</b> more than you have this month. Try to hold back until next month.</div></div>`;
      if (x.type === 'over') return `<div class="note bad" role="alert">${icon('alert')}<div class="body"><b>${esc(x.cat.name)}</b> is ${kr(x.amount)} over budget.
        ${x.from ? `<div class="acts"><button class="btn sm on-note" data-act="moveLimit|${x.cat.id}|${x.from.id}|${x.amount}">${icon('move')} Move ${kr(x.amount)} from ${esc(x.from.name)}</button></div>` : ' Go easy on it for the rest of the month.'}</div></div>`;
      return `<div class="note warn">${icon('alert')}<div class="body"><b>${esc(x.cat.name)}</b>: ${Math.round(x.pct * 100)}% used – ${kr(x.remaining)} left.</div></div>`;
    }).join('');
  }
  function dueCard() {
    const due = Cx.dueFixed(S, today, reminderDays());
    if (!due.length) return '';
    return `<section class="card"><div class="sec"><h2>Coming up</h2><span class="meta">Next ${plural(reminderDays(), 'day', 'days')}</span></div>
      ${due.map(x => `<div class="row">${icoBox(x.f.icon || 'repeat', '#ea580c')}<div class="g"><div class="t">${esc(x.f.name)}</div>
        <div class="s">${x.diff === 0 ? 'Due today' : x.diff === 1 ? 'Due tomorrow' : `Due in ${x.diff} days`} · ${kr(x.f.amount)}</div></div>
        <button class="btn sm soft" data-act="togglePaid|${x.f.id}">${icon('check')} Paid</button></div>`).join('')}</section>`;
  }
  function saveTipCard() {
    const s = Cx.saveSuggestion(S, today, CFG.saveSuggestionPct);
    if (!s) return '';
    return `<div class="note ok">${icon('piggy')}<div class="body">Payday! Put ${CFG.saveSuggestionPct}% (<b>${kr(s.amount)}</b>) aside for “${esc(s.goal.name)}”?
      <div class="acts"><button class="btn sm on-note" data-act="saveTip|${s.amount}">Put it aside</button><button class="btn sm on-note" data-act="dismissTip">Not now</button></div></div></div>`;
  }
  function weekCard() {
    if (Cx.weekday(today) > 3 || S.settings.weekSeen === Cx.weekKey(today)) return '';
    const w = Cx.lastWeek(S, today);
    if (!w.count) return '';
    const diff = w.spent - w.prevSpent;
    const cmp = w.prevSpent > 0 ? (diff <= 0 ? `That's ${kr(-diff)} less than the week before.` : `That's ${kr(diff)} more than the week before.`) : '';
    return `<section class="card"><div class="sec"><h2>Your week</h2><button class="icon-btn" data-act="dismissWeek" aria-label="Hide" style="margin:-10px -10px -10px 0">${icon('x')}</button></div>
      <p style="margin:0 0 4px" class="muted small">${fmtDate(w.start, { day: 'numeric', month: 'short' })} – ${fmtDate(w.end, { day: 'numeric', month: 'short' })}</p>
      <p style="margin:0">You spent <b>${kr(w.spent)}</b> on ${plural(w.count, 'purchase', 'purchases')}. ${cmp}</p>
      ${w.top ? `<p class="muted" style="margin:6px 0 0">Most went to ${esc(w.top.cat ? w.top.cat.name : 'Other')} (${kr(w.top.amount)}).</p>` : ''}</section>`;
  }
  function backupCard() {
    if (S.demo) return '';
    const last = S.settings.lastBackupAt || S.createdAt, nudge = S.settings.backupNudgeAt;
    if (Cx.daysBetween(last, today) < CFG.backupRemindDays || (nudge && Cx.daysBetween(nudge, today) < CFG.backupRemindDays)) return '';
    return `<div class="note info">${icon('download')}<div class="body">Time for a backup! Save a copy so you never lose your numbers.
      <div class="acts"><button class="btn sm" data-act="backup">Back up now</button><button class="btn sm on-note" data-act="dismissBackup">Later</button></div></div></div>`;
  }
  function txRow(t) {
    const c = catById(t.cat);
    return `<button class="row" data-act="openTx|${t.id}" id="tx-${t.id}">${icoBox(c.icon, c.color)}
      <div class="g"><div class="t">${esc(t.note || c.name)}</div><div class="s">${t.note ? esc(c.name) + ' · ' : ''}${dateLabel(t.date)}${t.source === 'bank' ? ' · ' + icon('bank', 'tiny') + ' Bank' : ''}</div></div>
      <div class="v">−${kr(t.amount)}</div></button>`;
  }

  // =====================================================================
  //  NYT KØB (maks. 3 tryk: + → beløb → Save)
  // =====================================================================
  let txDraft = null;
  function openTx(id) {
    const t = id ? S.tx.find(x => x.id === id) : null;
    const order = Cx.usageOrder(S, today);
    const defCat = t ? t.cat : (S.settings.lastCat && S.cats.some(c => c.id === S.settings.lastCat) ? S.settings.lastCat : (order[0] || {}).id);
    txDraft = { id: t ? t.id : null, cat: defCat, date: t ? t.date : today };
    openSheet(t ? 'Edit purchase' : 'New purchase', `<form id="txForm" novalidate>
      <div class="big-amount"><input id="amt" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="done" placeholder="0" aria-label="Amount in kroner" value="${t ? esc(amountInput(t.amount)) : ''}"><span>kr.</span></div>
      <p id="txErr" class="small" style="color:var(--bad);margin:-4px 0 0;min-height:1em" role="alert"></p>
      <div class="chips scroll" role="radiogroup" aria-label="Category">${order.map(c => `<button type="button" class="chip ${c.id === txDraft.cat ? 'on' : ''}" role="radio" aria-checked="${c.id === txDraft.cat}" data-cat="${c.id}">${icon(c.icon)}${esc(c.name)}</button>`).join('')}</div>
      <input id="note" placeholder="What was it? (optional)" value="${t ? esc(t.note || '') : ''}" autocomplete="off" enterkeyhint="done">
      <div class="chips" id="dates">${dateChips()}</div>
      <input type="date" id="dateIn" value="${txDraft.date}" max="${today}" style="display:${[today, Cx.addDays(today, -1)].includes(txDraft.date) ? 'none' : 'block'}" aria-label="Date">
      ${t ? `<div class="btns"><button type="button" class="btn danger" id="delTx">${icon('trash')} Delete</button><button class="btn" type="submit">Save changes</button></div>`
        : `<div class="btns"><button type="button" class="btn soft" id="saveNext">Save &amp; add next</button><button class="btn" type="submit">Save</button></div>`}
    </form>`);
    const amt = $('#amt');
    amt.focus(); // i samme tryk, så tastaturet åbner på mobil
    if (t) amt.select();
    $('#txForm').onsubmit = e => { e.preventDefault(); saveTx(false); };
    $('#note').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); saveTx(false); } };
    if ($('#saveNext')) $('#saveNext').onclick = () => saveTx(true);
    if ($('#delTx')) $('#delTx').onclick = () => { closeSheet(); deleteTx(t.id); };
    document.querySelectorAll('#sheet [data-cat]').forEach(b => b.onclick = () => {
      txDraft.cat = b.dataset.cat;
      document.querySelectorAll('#sheet [data-cat]').forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); });
    });
    bindDates();
  }
  function dateChips() {
    const y = Cx.addDays(today, -1), d = txDraft.date;
    return `<button type="button" class="chip ${d === today ? 'on' : ''}" data-date="${today}">Today</button>
      <button type="button" class="chip ${d === y ? 'on' : ''}" data-date="${y}">Yesterday</button>
      <button type="button" class="chip ${d !== today && d !== y ? 'on' : ''}" data-date="pick">${icon('calendar')}${d !== today && d !== y ? fmtDate(d, { day: 'numeric', month: 'short' }) : 'Other day'}</button>`;
  }
  function bindDates() {
    document.querySelectorAll('#dates [data-date]').forEach(b => b.onclick = () => {
      const di = $('#dateIn');
      if (b.dataset.date === 'pick') { di.style.display = 'block'; try { di.showPicker(); } catch (e) { di.focus(); } return; }
      txDraft.date = b.dataset.date; di.value = txDraft.date; di.style.display = 'none';
      $('#dates').innerHTML = dateChips(); bindDates();
    });
    $('#dateIn').onchange = e => { if (e.target.value) { txDraft.date = e.target.value; $('#dates').innerHTML = dateChips(); bindDates(); } };
  }
  function saveTx(addNext) {
    const amount = Cx.parseAmount($('#amt').value);
    if (!(amount > 0)) { $('#txErr').textContent = 'Enter an amount, e.g. 45 or 45,50'; $('#amt').focus(); return; }
    const cat = catById(txDraft.cat), note = $('#note').value.trim();
    const before = Cx.catSpent(S, cat.id, curYM);
    let newId = null;
    if (txDraft.id) Object.assign(S.tx.find(x => x.id === txDraft.id), { amount, cat: cat.id, note, date: txDraft.date });
    else { newId = uid(); S.tx.push({ id: newId, amount, cat: cat.id, note, date: txDraft.date, source: 'manual' }); trackOnce('first-purchase'); }
    S.settings.lastCat = cat.id;
    save();
    const after = Cx.catSpent(S, cat.id, curYM), limit = Cx.catLimit(S, cat, curYM), left = Cx.monthSummary(S, curYM).left;
    let msg = txDraft.id ? 'Changes saved' : `Saved · ${kr(left)} left`;
    if (!txDraft.id && txDraft.date.startsWith(curYM)) {
      if (limit && after > limit && before <= limit) msg = `${esc(cat.name)} is now over budget`;
      else if (limit && after >= limit * .8 && before < limit * .8) msg = `Heads up: ${Math.round(after / limit * 100)}% of ${esc(cat.name)} used`;
    }
    if (addNext) {
      $('#amt').value = ''; $('#note').value = ''; $('#txErr').textContent = ''; $('#amt').focus();
      toast(msg); render(); return;
    }
    closeSheet(); render(); toast(msg);
    if (newId) { const el = document.getElementById('tx-' + newId); if (el) el.classList.add('flash'); }
  }
  function deleteTx(id) {
    withUndo('Purchase deleted', () => { S.tx = S.tx.filter(x => x.id !== id); });
  }

  // =====================================================================
  //  BUDGET
  // =====================================================================
  let budgetTab = 'categories';
  let txFilter = { q: '', cat: 'all', ym: null };
  function vBudget() {
    const T = { categories: 'Categories', income: 'Income', fixed: 'Fixed', purchases: 'Purchases' };
    const tabs = `<div class="tabs" role="tablist">${Object.keys(T).map(k => `<button role="tab" aria-selected="${k === budgetTab}" class="${k === budgetTab ? 'on' : ''}" data-act="tab|${k}">${T[k]}</button>`).join('')}</div>`;
    let b = '';
    if (budgetTab === 'categories') {
      const max = !isPremium() && S.cats.length >= CFG.free.categories;
      b = `<section class="card"><div class="sec"><h2>Categories</h2><span class="meta">${isPremium() ? 'Unlimited' : `${S.cats.length} of ${CFG.free.categories}`}</span></div>
        <p class="small muted" style="margin:0 0 4px">The limit is what you plan to spend per month. Tap to edit.</p>
        ${S.cats.map(c => { const sp = Cx.catSpent(S, c.id, curYM), lim = Cx.catLimit(S, c, curYM);
          const pc = lim ? Math.min(1, sp / lim) : 0, over = lim && sp > lim;
          return `<button class="row" data-act="catSheet|${c.id}">${icoBox(c.icon, c.color)}<div class="g"><div style="display:flex;justify-content:space-between;gap:8px"><span class="t">${esc(c.name)}</span>
          <span class="small nowrap"><b class="num" style="color:${over ? 'var(--bad)' : 'var(--ink)'}">${kr(sp)}</b><span class="muted">${lim ? ' of ' + kr(lim) : ' · no limit'}</span></span></div>
          <div class="bar"><i style="width:${pc * 100}%;background:${over ? 'var(--bad)' : pc >= .8 ? 'var(--warn)' : c.color}"></i></div></div></button>`; }).join('')}
        <div style="margin-top:10px">${max ? `<button class="btn soft" data-act="premium">${icon('lock')} More with Premium</button>` : `<button class="btn soft" data-act="catSheet">${icon('plus')} New category</button>`}</div></section>`;
    } else if (budgetTab === 'income') {
      b = `<section class="card"><div class="sec"><h2>Income</h2><span class="meta">${kr(Cx.incomeTotal(S))} / month</span></div>
        ${S.incomes.map(i => `<button class="row" data-act="incomeSheet|${i.id}">${icoBox('coin', '#059669')}<div class="g"><div class="t">${esc(i.name)}</div><div class="s">${esc(i.kind)} · arrives on the ${ordinal(i.day || 1)}</div></div><div class="v" style="color:var(--ok)">+${kr(i.amount)}</div></button>`).join('') || '<p class="empty">Add your salary, pocket money or student grant.</p>'}
        <button class="btn soft" style="margin-top:10px" data-act="incomeSheet">${icon('plus')} Add income</button></section>`;
    } else if (budgetTab === 'fixed') {
      const paid = S.paid[curYM] || [];
      b = `<section class="card"><div class="sec"><h2>Fixed expenses</h2><span class="meta">${kr(Cx.fixedTotal(S))} / month</span></div>
        <p class="small muted" style="margin:0 0 4px">Tick the circle when it's been paid this month.</p>
        ${S.fixed.map(f => { const p = paid.includes(f.id); return `<div class="row">
          <button class="icon-btn" data-act="togglePaid|${f.id}" aria-pressed="${p}" aria-label="${p ? 'Paid' : 'Mark as paid'}: ${esc(f.name)}" style="color:${p ? 'var(--ok)' : 'var(--faint)'}">${icon(p ? 'checkCircle' : 'circle')}</button>
          <button class="row" style="padding:0;min-height:48px" data-act="fixedSheet|${f.id}"><div class="g"><div class="t">${esc(f.name)}</div><div class="s">${p ? 'Paid in ' + monthLong(curYM, false) : 'Due on the ' + ordinal(f.day || 1)}</div></div><div class="v">−${kr(f.amount)}</div></button></div>`; }).join('') || '<p class="empty">For example phone, streaming or a travel card.</p>'}
        <button class="btn soft" style="margin-top:10px" data-act="fixedSheet">${icon('plus')} Add fixed expense</button></section>`;
    } else {
      if (!txFilter.ym) txFilter.ym = curYM;
      b = `<section class="card"><div style="display:flex;align-items:center;justify-content:space-between;margin:-6px -6px 6px">
          <button class="icon-btn" data-act="txMonth|-1" aria-label="Previous month">${icon('left')}</button><b>${monthLong(txFilter.ym)}</b>
          <button class="icon-btn" data-act="txMonth|1" aria-label="Next month" ${txFilter.ym >= curYM ? 'disabled style="opacity:.3"' : ''}>${icon('right')}</button></div>
        <label class="sr" for="q">Search</label>
        <div style="position:relative"><input id="q" type="search" placeholder="Search by name or amount" value="${esc(txFilter.q)}" style="padding-left:42px" autocomplete="off">
          <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--faint);display:flex">${icon('search')}</span></div>
        <div class="chips scroll" style="margin-top:10px">${[{ id: 'all', name: 'All' }, ...S.cats].map(c => `<button class="chip ${txFilter.cat === c.id ? 'on' : ''}" data-act="txCat|${c.id}">${c.icon ? icon(c.icon) : ''}${esc(c.name)}</button>`).join('')}</div>
        <div id="txList"></div></section>`;
    }
    return header('Budget', monthLong(curYM)) + tabs + b;
  }
  const ordinal = n => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
  function bindTxList() {
    const q = $('#q'); if (!q) return;
    q.oninput = () => { txFilter.q = q.value; renderTxList(); };
    renderTxList();
  }
  function renderTxList() {
    const q = txFilter.q.trim().toLowerCase();
    const list = Cx.txInMonth(S, txFilter.ym).filter(t => (txFilter.cat === 'all' || t.cat === txFilter.cat) &&
      (!q || (t.note || '').toLowerCase().includes(q) || catById(t.cat).name.toLowerCase().includes(q) || amountInput(t.amount).includes(q.replace('.', ','))))
      .sort((a, b) => b.date.localeCompare(a.date));
    const days = {};
    list.forEach(t => (days[t.date] = days[t.date] || []).push(t));
    const html = Object.keys(days).map(d => `<div class="day-head"><span>${dateLabel(d)}</span><span class="num">−${kr(Cx.sum(days[d], t => t.amount))}</span></div>${days[d].map(txRow).join('')}`).join('');
    $('#txList').innerHTML = html ? `<p class="small muted" style="margin:12px 0 0">${plural(list.length, 'purchase', 'purchases')} · ${kr(Cx.sum(list, t => t.amount))}</p>` + html
      : `<p class="empty" style="text-align:center;padding:24px 0">${q || txFilter.cat !== 'all' ? 'No purchases match.' : 'No purchases this month.'}</p>`;
    document.querySelectorAll('#txList [data-act]').forEach(el => el.onclick = e => { e.preventDefault(); const [a, ...args] = el.dataset.act.split('|'); ACT[a](...args); });
  }

  // ---------- Kategori-ark ----------
  function catSheet(id) {
    const c = id ? S.cats.find(x => x.id === id) : { name: '', limit: '', icon: CFG.icons[S.cats.length % CFG.icons.length], color: CFG.colors[S.cats.length % CFG.colors.length] };
    const pick = { icon: c.icon || 'sparkle', color: c.color };
    const adj = id ? (S.limitAdjust[curYM] || {})[id] || 0 : 0;
    openSheet(id ? 'Edit category' : 'New category', `<form id="catForm">
      <label class="f">Name<input name="name" required value="${esc(c.name)}" placeholder="e.g. Coffee" maxlength="24"></label>
      <label class="f">Limit per month<span class="money"><input name="limit" inputmode="decimal" value="${esc(amountInput(c.limit || ''))}" placeholder="e.g. 500"></span></label>
      ${adj ? `<p class="small muted" style="margin:-4px 0 0">This month: ${adj > 0 ? '+' : '−'}${kr(Math.abs(adj))} moved ${adj > 0 ? 'in' : 'out'}.</p>` : ''}
      <div class="f" style="font-size:.8125rem;color:var(--muted);font-weight:600">Icon</div>
      <div class="iconpick" id="iconPick">${CFG.icons.map(n => `<button type="button" class="${n === pick.icon ? 'on' : ''}" data-icon="${n}" aria-label="${n}">${icon(n)}</button>`).join('')}</div>
      <div class="f" style="font-size:.8125rem;color:var(--muted);font-weight:600">Colour</div>
      <div class="swatches" id="colPick">${CFG.colors.map(p => `<button type="button" class="${p === pick.color ? 'on' : ''}" data-color="${p}" style="background:${p}" aria-label="Colour ${p}"></button>`).join('')}</div>
      <div class="btns" style="margin-top:6px">${id && S.cats.length > 1 ? `<button type="button" class="btn danger" id="delCat">${icon('trash')} Delete</button>` : ''}<button class="btn">Save</button></div>
    </form>`);
    document.querySelectorAll('#iconPick [data-icon]').forEach(b => b.onclick = () => { pick.icon = b.dataset.icon; document.querySelectorAll('#iconPick button').forEach(x => x.classList.toggle('on', x === b)); });
    document.querySelectorAll('#colPick [data-color]').forEach(b => b.onclick = () => { pick.color = b.dataset.color; document.querySelectorAll('#colPick button').forEach(x => x.classList.toggle('on', x === b)); });
    $('#catForm').onsubmit = e => {
      e.preventDefault(); const f = new FormData(e.target), name = f.get('name').trim();
      if (!name) return;
      const d = { name, limit: Cx.parseAmount(f.get('limit')) || 0, icon: pick.icon, color: pick.color };
      if (id) Object.assign(S.cats.find(x => x.id === id), d); else S.cats.push({ id: uid(), ...d });
      save(); closeSheet(); render(); toast(id ? 'Category saved' : 'Category added');
    };
    if ($('#delCat')) $('#delCat').onclick = () => {
      const other = S.cats.find(x => x.id !== id); closeSheet();
      withUndo(`Deleted · purchases moved to ${esc(other.name)}`, () => { S.tx.forEach(t => { if (t.cat === id) t.cat = other.id; }); S.cats = S.cats.filter(x => x.id !== id); });
    };
  }
  // ---------- Indtægt / fast udgift ----------
  function incomeSheet(id) {
    const i = id ? S.incomes.find(x => x.id === id) : { kind: CFG.incomeTypes[0], name: '', amount: '', day: 1 };
    let kind = i.kind;
    openSheet(id ? 'Edit income' : 'Add income', `<form id="incForm">
      <div class="chips" id="kinds">${CFG.incomeTypes.map(k => `<button type="button" class="chip ${k === kind ? 'on' : ''}" data-k="${esc(k)}">${esc(k)}</button>`).join('')}</div>
      <div class="two"><label class="f">Amount per month<span class="money"><input name="amount" inputmode="decimal" required value="${esc(amountInput(i.amount))}" placeholder="0"></span></label>
      <label class="f">Arrives on day<input name="day" type="number" inputmode="numeric" min="1" max="31" value="${i.day || 1}"></label></div>
      <label class="f">Name (optional)<input name="name" value="${esc(i.name === i.kind ? '' : i.name)}" placeholder="e.g. Part-time job"></label>
      <div class="btns">${id ? `<button type="button" class="btn danger" id="delInc">${icon('trash')} Delete</button>` : ''}<button class="btn">Save</button></div></form>`);
    document.querySelectorAll('#kinds [data-k]').forEach(b => b.onclick = () => { kind = b.dataset.k; document.querySelectorAll('#kinds .chip').forEach(x => x.classList.toggle('on', x === b)); });
    $('#incForm').onsubmit = e => {
      e.preventDefault(); const f = new FormData(e.target), amount = Cx.parseAmount(f.get('amount'));
      if (!(amount > 0)) { toast('Enter an amount'); return; }
      const d = { kind, name: f.get('name').trim() || kind, amount, day: clamp(parseInt(f.get('day')) || 1, 1, 31) };
      if (id) Object.assign(S.incomes.find(x => x.id === id), d); else S.incomes.push({ id: uid(), ...d });
      save(); closeSheet(); render(); toast('Income saved');
    };
    if ($('#delInc')) $('#delInc').onclick = () => { closeSheet(); withUndo('Income deleted', () => { S.incomes = S.incomes.filter(x => x.id !== id); }); };
  }
  function fixedSheet(id) {
    const fx = id ? S.fixed.find(x => x.id === id) : { name: '', amount: '', day: 1, icon: 'repeat' };
    openSheet(id ? 'Edit fixed expense' : 'Add fixed expense', `<form id="fxForm">
      <label class="f">Name<input name="name" required value="${esc(fx.name)}" placeholder="e.g. Phone"></label>
      <div class="two"><label class="f">Amount per month<span class="money"><input name="amount" inputmode="decimal" required value="${esc(amountInput(fx.amount))}" placeholder="0"></span></label>
      <label class="f">Due on day<input name="day" type="number" inputmode="numeric" min="1" max="31" value="${fx.day || 1}"></label></div>
      <div class="btns">${id ? `<button type="button" class="btn danger" id="delFx">${icon('trash')} Delete</button>` : ''}<button class="btn">Save</button></div></form>`);
    $('#fxForm').onsubmit = e => {
      e.preventDefault(); const f = new FormData(e.target), amount = Cx.parseAmount(f.get('amount'));
      if (!(amount > 0) || !f.get('name').trim()) { toast('Enter a name and an amount'); return; }
      const d = { name: f.get('name').trim(), amount, day: clamp(parseInt(f.get('day')) || 1, 1, 31) };
      if (id) Object.assign(S.fixed.find(x => x.id === id), d); else S.fixed.push({ id: uid(), icon: 'repeat', ...d });
      save(); closeSheet(); render(); toast('Fixed expense saved');
    };
    if ($('#delFx')) $('#delFx').onclick = () => { closeSheet(); withUndo('Fixed expense deleted', () => { S.fixed = S.fixed.filter(x => x.id !== id); }); };
  }

  // =====================================================================
  //  SPAREMÅL
  // =====================================================================
  function vGoals() {
    const max = !isPremium() && S.goals.length >= CFG.free.goals;
    const total = Cx.totalSaved(S);
    return header('Goals', `Set aside in total: ${kr(total)}`) +
      (S.goals.map(g => {
        const saved = Cx.goalSaved(S, g.id), p = clamp(saved / g.target, 0, 1), eta = Cx.goalETA(S, g, today), done = eta && eta.done;
        let etaTxt;
        if (done) etaTxt = `<b style="color:var(--ok)">You reached your goal!</b>`;
        else if (eta) etaTxt = `At ${kr(eta.perMonth)} a month you'll get there in <b>${monthLong(eta.ym)}</b>.`;
        else etaTxt = 'Add a monthly amount to see when you’ll get there.';
        return `<section class="card ${done ? 'pop' : ''}">
          <div style="display:flex;align-items:center;gap:12px">${icoBox(done ? 'check' : (g.icon || 'star'), done ? '#059669' : '#4f46e5')}
            <div style="flex:1;min-width:0"><div class="t" style="font-weight:700">${esc(g.name)}</div><div class="small muted">${done ? 'Done' : kr(Math.max(0, g.target - saved)) + ' to go'}</div></div>
            <button class="icon-btn" data-act="goalSheet|${g.id}" aria-label="Edit goal">${icon('edit')}</button></div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:14px;gap:8px"><b style="font-size:1.4rem;letter-spacing:-.02em" class="num">${kr(saved)}</b><span class="small muted nowrap">of ${kr(g.target)} · ${Math.round(p * 100)}%</span></div>
          <div class="bar" style="height:10px"><i style="width:${p * 100}%;background:${done ? 'var(--ok)' : 'var(--brand)'}"></i></div>
          <p class="small muted" style="margin:10px 0 12px">${etaTxt}</p>
          ${done ? '' : `<div class="chips">${[50, 100, 250].map(a => `<button class="chip" data-act="deposit|${g.id}|${a}">+${a}&nbsp;kr.</button>`).join('')}<button class="chip" data-act="depositOther|${g.id}">Other amount</button></div>`}
        </section>`;
      }).join('') || `<div class="card"><p class="empty">What are you dreaming of? Create a goal – like a new phone, a festival ticket or a rainy day fund.</p></div>`) +
      (max ? lockCard('More savings goals', `Free has ${plural(CFG.free.goals, 'goal', 'goals')}. With Premium you can save for several things at once.`)
        : `<button class="btn soft" data-act="goalSheet">${icon('plus')} New savings goal</button>`) +
      `<p class="small muted" style="text-align:center;margin-top:16px">Money you put aside is subtracted from “Left” in the month you save it.</p>`;
  }
  function lockCard(title, text) {
    return `<div class="card lockcard"><div class="ico">${icon('lock')}</div><b>${title}</b><p>${text}</p><button class="btn sm" data-act="premium">See Premium</button></div>`;
  }
  function goalSheet(id) {
    const g = id ? S.goals.find(x => x.id === id) : { name: '', target: '', monthly: '' };
    openSheet(id ? 'Edit goal' : 'New savings goal', `<form id="goalForm">
      ${id ? '' : `<div class="chips">${CFG.goalSuggestions.map(s => `<button type="button" class="chip" data-sug="${esc(s)}">${esc(s)}</button>`).join('')}</div>`}
      <label class="f">What are you saving for?<input name="name" required value="${esc(g.name)}" placeholder="e.g. New phone"></label>
      <div class="two"><label class="f">Price<span class="money"><input name="target" inputmode="decimal" required value="${esc(amountInput(g.target))}" placeholder="0"></span></label>
      <label class="f">Save per month<span class="money"><input name="monthly" inputmode="decimal" value="${esc(amountInput(g.monthly || ''))}" placeholder="0"></span></label></div>
      <div class="btns">${id ? `<button type="button" class="btn danger" id="delGoal">${icon('trash')} Delete</button>` : ''}<button class="btn">Save</button></div></form>`);
    document.querySelectorAll('#sheet [data-sug]').forEach(b => b.onclick = () => { $('#goalForm [name=name]').value = b.dataset.sug; });
    $('#goalForm').onsubmit = e => {
      e.preventDefault(); const f = new FormData(e.target), target = Cx.parseAmount(f.get('target'));
      if (!(target > 0) || !f.get('name').trim()) { toast('Enter a name and a price'); return; }
      const d = { name: f.get('name').trim(), target, monthly: Cx.parseAmount(f.get('monthly')) || 0 };
      if (id) Object.assign(S.goals.find(x => x.id === id), d); else S.goals.push({ id: uid(), icon: 'star', ...d });
      save(); closeSheet(); render(); toast(id ? 'Goal saved' : 'Goal created');
    };
    if ($('#delGoal')) $('#delGoal').onclick = () => { closeSheet(); withUndo('Goal deleted', () => { S.goals = S.goals.filter(x => x.id !== id); S.deposits = S.deposits.filter(d => d.goalId !== id); }); };
  }
  function addDeposit(g, amount, date = today) {
    const wasDone = Cx.goalSaved(S, g.id) >= g.target;
    const left = Cx.monthSummary(S, curYM).left;
    withUndo(`+${kr(amount)} to ${esc(g.name)}`, () => { S.deposits.push({ id: uid(), goalId: g.id, amount, date }); });
    if (date.startsWith(curYM) && amount > left) setTimeout(() => toast(`Saved – but that's more than you have left this month`), 2200);
    if (!wasDone && Cx.goalSaved(S, g.id) >= g.target) celebrate(g);
  }
  function celebrate(g) {
    confetti();
    openSheet('You did it!', `<p style="margin:0 0 16px">You've saved <b>${kr(g.target)}</b> for “${esc(g.name)}”. That's seriously impressive.</p><button class="btn" data-close>Yay!</button>`);
    $('#sheet button.btn[data-close]').onclick = closeSheet;
  }
  function depositOther(id) {
    const g = S.goals.find(x => x.id === id);
    openSheet(`Add to “${esc(g.name)}”`, `<form id="depForm"><div class="big-amount"><input id="depAmt" inputmode="decimal" placeholder="0" autocomplete="off" aria-label="Amount"><span>kr.</span></div><button class="btn">Put aside</button></form>`);
    $('#depAmt').focus();
    $('#depForm').onsubmit = e => { e.preventDefault(); const a = Cx.parseAmount($('#depAmt').value); if (!(a > 0)) { toast('Enter an amount'); return; } closeSheet(); addDeposit(g, a); };
  }

  // =====================================================================
  //  RAPPORT
  // =====================================================================
  let repYM = null;
  function vReport() {
    if (!repYM || repYM > curYM) repYM = curYM;
    const m = Cx.monthSummary(S, repYM), cmp = Cx.compareMonths(S, repYM);
    const parts = Cx.catStatus(S, repYM).filter(x => x.spent > 0).map(x => ({ name: x.cat.name, col: x.cat.color, v: x.spent, prev: Cx.catSpent(S, x.cat.id, cmp.prev) }));
    if (m.fixed) parts.push({ name: 'Fixed expenses', col: '#94a3b8', v: m.fixed, prev: Cx.monthSummary(S, cmp.prev).fixed });
    parts.sort((a, b) => b.v - a.v);
    const tot = Cx.sum(parts, p => p.v);
    let ang = 0; const R = 78, P = a => [100 + R * Math.sin(a), 100 - R * Math.cos(a)];
    const arcs = parts.length === 1 ? `<circle cx="100" cy="100" r="${R}" fill="none" stroke="${parts[0].col}" stroke-width="22"/>` : parts.map(p => {
      const a0 = ang, a1 = ang + p.v / tot * Math.PI * 2; ang = a1;
      const [x0, y0] = P(a0 + .02), [x1, y1] = P(a1 - .02);
      return `<path d="M${x0},${y0} A${R},${R} 0 ${(a1 - a0) > Math.PI ? 1 : 0} 1 ${x1},${y1}" fill="none" stroke="${p.col}" stroke-width="22"><title>${esc(p.name)}: ${kr(p.v)}</title></path>`;
    }).join('');
    const prevName = monthLong(cmp.prev, false);
    let cmpTxt = '';
    if (cmp.prevSpent > 0) cmpTxt = cmp.diff <= 0 ? `${icon('down')}<span>You spent <b>${kr(-cmp.diff)} less</b> on purchases than in ${prevName}.</span>` : `${icon('up')}<span>You spent <b>${kr(cmp.diff)} more</b> on purchases than in ${prevName}.</span>`;
    const top = Cx.topCategory(S, repYM);

    const monthCard = `<section class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin:-6px -6px 8px">
        <button class="icon-btn" data-act="repMonth|-1" aria-label="Previous month">${icon('left')}</button><b>${monthLong(repYM)}</b>
        <button class="icon-btn" data-act="repMonth|1" aria-label="Next month" ${repYM >= curYM ? 'disabled style="opacity:.3"' : ''}>${icon('right')}</button></div>
      <table class="calc-table"><tr><td>Income</td><td>+${kr(m.income)}</td></tr><tr><td>Fixed expenses</td><td>−${kr(m.fixed)}</td></tr>
        <tr><td>Purchases</td><td>−${kr(m.spent)}</td></tr><tr><td>Saved</td><td>−${kr(m.saved)}</td></tr>
        <tr class="total"><td>${m.left >= 0 ? 'Left over' : 'Over budget'}</td><td style="color:${m.left >= 0 ? 'var(--ok)' : 'var(--bad)'}">${kr(m.left)}</td></tr></table>
      <p class="small muted" style="margin:8px 0 0">“Left over” is what's left after fixed expenses, purchases and savings.</p>
      ${cmpTxt ? `<div class="note ${cmp.diff <= 0 ? 'ok' : 'warn'}" style="margin:12px 0 0;align-items:center">${cmpTxt}</div>` : ''}
    </section>
    <section class="card"><div class="sec"><h2>Where your money went</h2></div>
      ${tot ? `<div style="display:flex;justify-content:center"><svg viewBox="0 0 200 200" width="190" height="190" role="img" aria-label="Spending by category">${arcs}
        <text x="100" y="94" text-anchor="middle" style="fill:var(--muted);font:500 11px Inter,sans-serif">Spent</text>
        <text x="100" y="116" text-anchor="middle" style="fill:var(--ink);font:800 18px Inter,sans-serif">${kr(tot)}</text></svg></div>
      ${parts.map(p => { const d = p.v - (p.prev || 0); return `<div class="row" style="min-height:48px"><div class="dot" style="background:${p.col}"></div><div class="g"><div style="font-weight:500">${esc(p.name)}</div>
        ${p.prev ? `<div class="s">${d === 0 ? 'Same as' : (d > 0 ? '+' : '−') + kr(Math.abs(d)) + ' vs'} ${prevName}</div>` : ''}</div>
        <span class="small muted">${Math.round(p.v / tot * 100)}%</span><div class="v" style="min-width:76px;text-align:right">${kr(p.v)}</div></div>`; }).join('')}
      ${top ? `<p class="small muted" style="margin:10px 0 0">You spent the most on <b>${esc(top.cat.name)}</b>.</p>` : ''}`
      : '<p class="empty" style="text-align:center;padding:24px 0">No spending this month.</p>'}
    </section>`;

    let extra;
    if (isPremium()) {
      const yr = curYM.slice(0, 4), ms = [];
      for (let i = 1; i <= 12; i++) { const k = yr + '-' + String(i).padStart(2, '0'); const x = Cx.monthSummary(S, k); ms.push({ i, k, sp: k > curYM || !Cx.isActive(S, k) ? 0 : x.fixed + x.spent, inc: x.income }); }
      const inc = Cx.incomeTotal(S), max = Math.max(inc, ...ms.map(x => x.sp)) * 1.12 || 1, W = 320, H = 140, bw = W / 12;
      const bars = ms.map(x => { const h = x.sp / max * H; return `<rect x="${(x.i - 1) * bw + 5}" y="${H - h}" width="${bw - 10}" height="${h}" rx="4" fill="${x.k === repYM ? 'var(--brand)' : x.inc && x.sp > x.inc ? 'var(--bad)' : 'color-mix(in srgb, var(--brand) 30%, transparent)'}"><title>${monthLong(x.k)}: ${kr(x.sp)}</title></rect><text x="${(x.i - 1) * bw + bw / 2}" y="${H + 14}" text-anchor="middle">${monthShort(x.k).charAt(0)}</text>`; }).join('');
      const act = ms.filter(x => x.sp > 0), ySp = Cx.sum(act, x => x.sp);
      extra = `<section class="card"><div class="sec"><h2>Year overview ${yr}</h2><span class="pro">PREMIUM</span></div>
        <svg class="chart" viewBox="0 0 ${W} ${H + 20}" width="100%" role="img" aria-label="Spending per month">${inc ? `<line x1="0" x2="${W}" y1="${H - inc / max * H}" y2="${H - inc / max * H}" stroke="var(--ok)" stroke-dasharray="4 4" stroke-width="1.5"/>` : ''}${bars}</svg>
        <div class="legend"><span><i class="dot" style="background:color-mix(in srgb, var(--brand) 30%, transparent)"></i>Spending</span><span><i class="dot" style="background:var(--bad)"></i>Over income</span><span><i style="width:14px;border-top:2px dashed var(--ok)"></i>Income</span></div>
        <div class="mini"><div><small>Spent this year</small><b>${kr(ySp)}</b></div><div><small>Average / month</small><b>${kr(act.length ? ySp / act.length : 0)}</b></div></div></section>
      <section class="card no-print"><div class="sec"><h2>Export</h2><span class="pro">PREMIUM</span></div>
        <div class="btns"><button class="btn soft" data-act="csv">${icon('file')} Excel (CSV)</button><button class="btn soft" data-act="pdf">${icon('download')} PDF</button></div></section>`;
    } else extra = lockCard('Year overview & Excel/PDF export', 'See the whole year in one chart and take your numbers to Excel.');
    return header('Statistics', 'Your money, month by month') + monthCard + extra + `<p class="small muted" style="text-align:center;margin-top:16px">${esc(CFG.texts.disclaimer)}</p>`;
  }
  function downloadBlob(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  async function shareOrDownload(blob, name, title) {
    const file = new File([blob], name, { type: blob.type });
    if (/iphone|ipad|android/i.test(navigator.userAgent) && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title }); return true; } catch (e) { if (e.name === 'AbortError') return false; }
    }
    downloadBlob(blob, name); return true;
  }
  function exportCSV() {
    const ym = repYM, n = v => String(Math.round(v * 100) / 100).replace('.', ',');
    const rows = [['Date', 'Type', 'Category', 'Description', 'Amount (kr.)']];
    if (Cx.isActive(S, ym)) {
      S.incomes.forEach(i => rows.push([ym + '-' + String(Math.min(i.day || 1, Cx.daysInMonth(ym))).padStart(2, '0'), 'Income', i.kind, i.name, n(i.amount)]));
      S.fixed.forEach(f => rows.push([ym + '-' + String(Math.min(f.day || 1, Cx.daysInMonth(ym))).padStart(2, '0'), 'Fixed expense', 'Fixed expenses', f.name, n(-f.amount)]));
    }
    Cx.txInMonth(S, ym).sort((a, b) => a.date.localeCompare(b.date)).forEach(t => rows.push([t.date, 'Purchase', catById(t.cat).name, t.note || '', n(-t.amount)]));
    S.deposits.filter(d => d.date.startsWith(ym)).forEach(d => rows.push([d.date, 'Saved', (S.goals.find(g => g.id === d.goalId) || {}).name || 'Goal', '', n(-d.amount)]));
    rows.push([], ['', '', '', 'Left over', n(Cx.monthSummary(S, ym).left)]);
    const csv = '﻿' + rows.map(r => r.map(x => /[;"\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : x).join(';')).join('\r\n');
    shareOrDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `budgie-${ym}.csv`, 'Budgie export');
    track('export-csv');
  }

  // =====================================================================
  //  INDSTILLINGER, BACKUP, PRIVATLIV, PREMIUM
  // =====================================================================
  function settingsSheet() {
    const lb = S.settings.lastBackupAt;
    const acc = Auth.current() || { name: S.name, email: '' };
    openSheet('Settings', `
      <div class="row" style="padding-top:0"><div class="avatar">${esc((S.name || acc.name || '?').charAt(0).toUpperCase())}</div>
        <div class="g"><div class="t">${esc(S.name || acc.name)}</div><div class="s">${acc.demo ? 'Sample data – nothing is saved' : esc(acc.email)}</div></div>
        <button class="btn sm soft" id="logout">${icon('out')} ${acc.demo ? 'Exit' : 'Log out'}</button></div>
      <form id="nameForm" style="flex-direction:row;gap:8px;align-items:flex-end;margin-top:6px"><label class="f" style="flex:1">Your name<input name="n" value="${esc(S.name)}" autocomplete="given-name"></label><button class="btn sm soft" style="min-height:48px">Save</button></form>
      <button class="btn line" id="goBank" style="margin-top:12px">${icon('bank')} ${S.bank ? 'Bank: ' + esc(S.bank.name) : 'Connect your bank'}</button>
      <button class="btn line" id="goSetup" style="margin-top:10px">${icon('wallet')} Set up budget again</button>
      <div class="card" style="margin:14px 0 10px"><div class="sec"><h2>Backup</h2><span class="meta">${icon('shield')}</span></div>
        <p class="small muted" style="margin:0 0 12px">Your numbers are saved on this device. ${lb ? `Last backup: ${fmtDate(lb, { day: 'numeric', month: 'long' })}.` : 'You haven’t made a backup yet.'}</p>
        <div class="btns"><button class="btn soft" id="bkSave">${icon('download')} Save backup</button><button class="btn soft" id="bkLoad">${icon('upload')} Restore</button></div></div>
      <label class="toggle"><span><b style="display:block">Savings tip on payday</b><span class="small muted">Suggests putting ${CFG.saveSuggestionPct}% aside</span></span><input type="checkbox" id="tipToggle" ${S.settings.saveSuggest ? 'checked' : ''}></label>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:10px">
        <button class="btn line" id="goPrem">${icon('star')} ${isPremium() ? 'Budgie Premium (on)' : 'Budgie Premium'}</button>
        <button class="btn line" id="goPriv">${icon('shield')} Privacy</button>
        ${acc.demo ? '' : `<button class="btn danger" id="reset">${icon('trash')} Delete my account</button>`}
      </div>
      <label class="toggle" style="margin-top:10px;border-top:1px solid var(--line)"><span><b style="display:block">Test mode: Premium</b><span class="small muted">For testing – no payment</span></span><input type="checkbox" id="premToggle" ${isPremium() ? 'checked' : ''}></label>
      <p class="small muted" style="text-align:center;margin:12px 0 0">${esc(CFG.texts.disclaimer)}</p>`);
    $('#nameForm').onsubmit = e => { e.preventDefault(); S.name = new FormData(e.target).get('n').trim(); save(); closeSheet(); render(); toast('Name saved'); };
    $('#bkSave').onclick = () => backupNow();
    $('#bkLoad').onclick = () => restorePick();
    $('#tipToggle').onchange = e => { S.settings.saveSuggest = e.target.checked; save(); render(); };
    $('#premToggle').onchange = e => { S.premium = e.target.checked; save(); render(); toast(S.premium ? 'Premium on (test mode)' : 'Premium off'); };
    $('#goPrem').onclick = () => { closeSheet(); premiumSheet(); };
    $('#goPriv').onclick = () => { closeSheet(); privacySheet(); };
    $('#logout').onclick = () => { closeSheet(); logout(); };
    $('#goBank').onclick = () => { closeSheet(); bankSheet(); };
    $('#goSetup').onclick = () => { closeSheet(); startOnboarding(); };
    if ($('#reset')) $('#reset').onclick = () => { closeSheet(); confirmSheet('Delete your account?', 'Your account and all your income, purchases and goals will be deleted from this device. Save a backup first if you want to keep them.', 'Delete account', () => { St.clear(); Auth.deleteAccount(acc.email); S = null; lastRing = null; showAuth('signup'); toast('Account deleted'); }); };
  }
  async function backupNow() {
    const ok = await shareOrDownload(new Blob([St.exportJSON(S)], { type: 'application/json' }), `budgie-backup-${today}.json`, 'Budgie backup');
    if (!ok) return;
    S.settings.lastBackupAt = today; S.settings.backupNudgeAt = null; save(); closeSheet(); render();
    toast('Backup saved – keep the file somewhere safe');
  }
  function restorePick() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      try {
        const data = St.importJSON(await f.text());
        const apply = () => { S = data; S.settings.lastBackupAt = today; if (!S.lastMonthSeen) S.lastMonthSeen = curYM; save(); closeSheet(); startApp(); toast('Backup restored'); };
        if (!S) apply();
        else confirmSheet('Restore backup?', `This replaces the numbers on this device with the backup (${data.tx.length} purchases, ${data.goals.length} goals).`, 'Restore', apply, false);
      } catch (e) { toast(esc(e.message)); }
    };
    inp.click();
  }
  function privacySheet() {
    openSheet('Privacy', `<div>${CFG.texts.privacy.map(p => `<div class="feat"><div class="ico">${icon('shield')}</div><div><small style="font-size:.9375rem;color:var(--ink)">${esc(p)}</small></div></div>`).join('')}</div>
      <p class="small muted" style="margin:12px 0 16px">${esc(CFG.texts.disclaimer)}</p><button class="btn soft" data-close>Close</button>`);
    $('#sheet button.btn[data-close]').onclick = closeSheet;
  }
  function premiumSheet() {
    track('premium-click');
    let plan = 'year';
    const yes = icon('check'), no = '<span class="muted">–</span>';
    const saving = Math.round((1 - CFG.prices.year / (CFG.prices.month * 12)) * 100);
    openSheet('Budgie Premium', `
      <div class="seg" id="plans"><button class="" data-plan="month">${CFG.prices.month} kr.<small>per month</small></button><button class="on" data-plan="year">${CFG.prices.year} kr.<small>per year · save ${saving}%</small></button></div>
      <table class="compare"><tr><th></th><th>Free</th><th>Premium</th></tr>
        <tr><td>Monthly budget & report</td><td>${yes}</td><td>${yes}</td></tr>
        <tr><td>Categories</td><td>${CFG.free.categories}</td><td>Unlimited</td></tr>
        <tr><td>Savings goals</td><td>${CFG.free.goals}</td><td>Unlimited</td></tr>
        <tr><td>Backup (JSON)</td><td>${yes}</td><td>${yes}</td></tr>
        <tr><td>Year overview</td><td>${no}</td><td>${yes}</td></tr>
        <tr><td>Excel/CSV & PDF</td><td>${no}</td><td>${yes}</td></tr>
        <tr><td>Bill reminders</td><td>${CFG.free.reminderDays} days</td><td>${CFG.premium.reminderDays} days</td></tr>
        <tr><td>Widgets & themes</td><td>${no}</td><td class="small">Coming soon</td></tr></table>
      <div id="premAct">
        <button class="btn" id="trial">Try free for 14 days</button>
        <form id="wl" style="margin-top:14px"><label class="f">Get on the waitlist<input type="email" name="email" placeholder="you@email.com" autocomplete="email" required value="${esc(S.waitlist ? S.waitlist.email : '')}"></label><button class="btn soft">Join the waitlist</button></form>
      </div>
      <p class="small muted" style="text-align:center;margin:12px 0 0">Premium isn't open yet – nothing is charged. This only shows us that you're interested. Your email is only stored on this device for now.</p>`);
    document.querySelectorAll('#plans [data-plan]').forEach(b => b.onclick = () => { plan = b.dataset.plan; document.querySelectorAll('#plans button').forEach(x => x.classList.toggle('on', x === b)); });
    $('#trial').onclick = () => { track('premium-trial-' + plan); S.events['premium-interest'] = today; save(); thanks('Thanks for your interest! Premium isn’t open yet – we’ll use this to decide when to launch it.'); };
    $('#wl').onsubmit = e => { e.preventDefault(); S.waitlist = { email: new FormData(e.target).get('email').trim(), plan, at: today }; save(); track('premium-waitlist'); thanks("Thanks! You're on the list."); };
    function thanks(msg) { $('#premAct').innerHTML = `<div class="note ok">${icon('check')}<div class="body">${msg}</div></div>`; }
  }

  // =====================================================================
  //  Handlinger (bruges af knapper med data-act)
  // =====================================================================
  const ACT = {
    go: (v, tab) => go(v, { tab }),
    tab: t => { budgetTab = t; render(); },
    settings: settingsSheet, premium: premiumSheet,
    openTx: id => openTx(id), catSheet: id => catSheet(id), incomeSheet: id => incomeSheet(id), fixedSheet: id => fixedSheet(id), goalSheet: id => goalSheet(id),
    deposit: (id, a) => addDeposit(S.goals.find(g => g.id === id), Number(a)),
    depositOther: id => depositOther(id),
    togglePaid: id => {
      const list = S.paid[curYM] = S.paid[curYM] || [];
      const i = list.indexOf(id); if (i >= 0) list.splice(i, 1); else list.push(id);
      save(); render(); toast(i >= 0 ? 'Marked as not paid' : 'Marked as paid');
    },
    moveLimit: (catId, fromId, amount) => {
      const a = Number(amount), from = catById(fromId);
      withUndo(`Moved ${kr(a)} from ${esc(from.name)}`, () => {
        const adj = S.limitAdjust[curYM] = S.limitAdjust[curYM] || {};
        adj[catId] = (adj[catId] || 0) + a; adj[fromId] = (adj[fromId] || 0) - a;
      });
    },
    saveTip: amount => addDeposit(S.goals[0], Number(amount)),
    dismissTip: () => { S.settings.saveSuggestDismissed = curYM; save(); render(); },
    dismissWeek: () => { S.settings.weekSeen = Cx.weekKey(today); save(); render(); },
    dismissBackup: () => { S.settings.backupNudgeAt = today; save(); render(); },
    backup: backupNow,
    setup: () => startOnboarding(),
    bank: () => bankSheet(),
    startOwn: () => startOwn(),
    txMonth: d => { txFilter.ym = Cx.addMonths(txFilter.ym, Number(d)); if (txFilter.ym > curYM) txFilter.ym = curYM; render(); },
    txCat: id => { txFilter.cat = id; render(); },
    repMonth: d => { repYM = Cx.addMonths(repYM, Number(d)); if (repYM > curYM) repYM = curYM; render(); },
    csv: exportCSV,
    pdf: () => { track('export-pdf'); window.print(); },
  };
  function startOwn() { St.clear(); logout('signup'); }
  function logout(mode = 'login') {
    Auth.logOut(); S = null; lastRing = null; OB = null;
    showAuth(Auth.hasAccounts() ? mode : 'signup');
  }

  // =====================================================================
  //  BANK (Demo Bank nu – rigtig open banking senere, se js/bank.js)
  // =====================================================================
  function bankSheet() {
    if (S.bank) {
      const b = S.bank, n = S.tx.filter(t => t.source === 'bank').length;
      openSheet(esc(b.name), `
        <div class="note ${b.demo ? 'info' : 'ok'}">${icon('bank')}<div class="body"><b>Connected</b>${b.demo ? ' · DEMO' : ''}<br>
          <span class="small">${plural(n, 'purchase', 'purchases')} imported${b.lastSyncAt ? ' · last synced ' + dateLabel(b.lastSync).toLowerCase() + ' ' + new Date(b.lastSyncAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}</span></div></div>
        <p class="small muted" style="margin:0 0 14px">Read-only access until ${fmtDate(b.consentUntil, { day: 'numeric', month: 'long', year: 'numeric' })}. Budgie can see purchases, but can never move money. Imported purchases are sorted into your categories automatically – tap one to change it.</p>
        <button class="btn" id="bkSync">${icon('sync')} Sync now</button>
        <button class="btn danger" id="bkOff" style="margin-top:10px">Disconnect</button>`);
      $('#bkSync').onclick = () => syncBank(true);
      $('#bkOff').onclick = () => { closeSheet(); confirmSheet('Disconnect bank?', 'Budgie stops fetching new purchases. Do you also want to remove the purchases that were imported?', 'Disconnect & remove', () => { withUndo('Bank disconnected', () => Bank.disconnect(S, true)); }); };
      return;
    }
    openSheet('Connect your bank', `
      <p class="muted" style="margin:0 0 6px">Import your purchases automatically instead of typing them in.</p>
      ${[['eye', 'Read-only', 'Budgie can see purchases – never move money.'], ['shield', 'You approve it in your bank', 'You log in with MitID at your bank, never in Budgie.'], ['x', 'Disconnect any time', 'Your approval runs out by itself after 180 days.']]
        .map(f => `<div class="feat"><div class="ico">${icon(f[0])}</div><div><b>${f[1]}</b><small>${f[2]}</small></div></div>`).join('')}
      <div class="sec" style="margin-top:12px"><h2>Choose your bank</h2></div>
      <button class="row" id="pickDemo">${icoBox('bank', '#ea580c')}<div class="g"><div class="t">Demo Bank</div><div class="s">Try it with sample purchases</div></div><span class="pro">DEMO</span></button>
      ${Bank.COMING.map(n => `<div class="row" style="opacity:.55">${icoBox('bank', '#64748b')}<div class="g"><div class="t">${esc(n)}</div><div class="s">Coming later</div></div></div>`).join('')}
      <p class="small muted" style="margin:12px 0 0">Real banks need a licensed open banking partner. Until then you can try the whole flow with Demo Bank.</p>`);
    $('#pickDemo').onclick = () => bankConsent('demo');
  }
  function bankConsent(id) {
    const p = Bank.PROVIDERS[id];
    openSheet('Approve access', `
      <div style="text-align:center;margin:4px 0 14px">${icoBox('bank', '#ea580c').replace('class="ico"', 'class="ico big" style="margin:0 auto 10px;')}<b>${esc(p.name)}</b> will share with Budgie:</div>
      <div class="card" style="padding:4px 14px">
        <div class="row">${icon('check')}<div class="g">Your purchases from the last 60 days</div></div>
        <div class="row">${icon('check')}<div class="g">New purchases, once a day</div></div>
        <div class="row" style="color:var(--muted)">${icon('x')}<div class="g">Budgie can never move money</div></div></div>
      ${p.demo ? `<div class="note info">${icon('info')}<div class="body">This is a demo. No real bank is contacted and no login is needed.</div></div>` : ''}
      <div class="btns"><button class="btn soft" data-close>Cancel</button><button class="btn" id="approve">Approve</button></div>`);
    $('#sheet .btns [data-close]').onclick = closeSheet;
    $('#approve').onclick = async () => {
      $('#approve').disabled = true; $('#approve').innerHTML = `<span class="spin"></span> Connecting…`;
      Bank.connect(S, id, today);
      const n = await Bank.sync(S, today, uid);
      save(); track('bank-connected'); closeSheet(); render();
      openSheet('Your bank is connected', `<p style="margin:0 0 10px">We imported <b>${plural(n, 'purchase', 'purchases')}</b> and sorted them into your categories.</p>
        <p class="small muted" style="margin:0 0 16px">Something in the wrong place? Tap the purchase to change its category.</p>
        <button class="btn" id="seeTx">See purchases</button>`);
      $('#seeTx').onclick = () => { closeSheet(); go('budget', { tab: 'purchases' }); };
    };
  }
  async function syncBank(manual) {
    if (!S.bank) return;
    if (manual) { const b = $('#bkSync'); if (b) { b.disabled = true; b.innerHTML = `<span class="spin"></span> Syncing…`; } }
    try {
      const n = await Bank.sync(S, today, uid);
      save(); if (manual) closeSheet(); render();
      if (n || manual) toast(n ? `${plural(n, 'new purchase', 'new purchases')} from ${esc(S.bank.name)}` : 'You’re up to date');
    } catch (e) { toast('Couldn’t reach your bank. Try again later.'); }
  }

  // =====================================================================
  //  Installér på hjemmeskærm
  // =====================================================================
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  let deferredPrompt = null;
  function showInstall() {
    const el = $('#install'); if (!el || standalone || framed) return;
    let x = false; try { x = localStorage.getItem('budgie-install-x'); } catch (e) { } if (x) return;
    let html = '';
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (deferredPrompt) html = `<button class="btn sm" id="inst">Install</button>`;
    else if (ios) html = `<button class="btn sm" id="instHow">How?</button>`;
    if (!html) return;
    el.innerHTML = `<div class="note info" style="align-items:center;padding:6px 6px 6px 14px">${icon('phone')}<div class="body">Add Budgie to your home screen</div>${html}<button class="icon-btn" id="instX" aria-label="Hide" style="color:inherit">${icon('x')}</button></div>`;
    if ($('#instHow')) $('#instHow').onclick = () => {
      openSheet('Add to home screen', `${[['share', 'Tap the share button', 'At the bottom of Safari'], ['plus', 'Choose “Add to Home Screen”', 'Scroll down a bit if you can’t see it'], ['check', 'Tap “Add”', 'Budgie now opens like a normal app']]
        .map((f, i) => `<div class="feat"><div class="ico">${icon(f[0])}</div><div><b>${i + 1}. ${f[1]}</b><small>${f[2]}</small></div></div>`).join('')}<button class="btn soft" data-close style="margin-top:12px">Got it</button>`);
      $('#sheet button.btn[data-close]').onclick = closeSheet;
    };
    $('#instX').onclick = () => { try { localStorage.setItem('budgie-install-x', 1); } catch (e) { } el.innerHTML = ''; };
    if ($('#inst')) $('#inst').onclick = async () => { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; el.innerHTML = ''; };
  }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; if (S) showInstall(); });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });

  // =====================================================================
  //  Start
  // =====================================================================
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeSheet(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#modal').classList.contains('open')) closeSheet(); });
  loadAnalytics();
  const acc = Auth.current();
  if (acc) enterApp(acc, false); else showAuth(Auth.hasAccounts() ? 'login' : 'signup');

  // Til test i konsollen
  window.Budgie = { get state() { return S; }, setToday(iso) { today = iso; curYM = iso.slice(0, 7); repYM = null; txFilter.ym = null; if (S) { render(); monthCheck(); } } };
})();
