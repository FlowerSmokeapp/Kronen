/* =====================================================================
   BUDGIE – INDSTILLINGER
   Her kan du ændre kategorier, tekster og priser uden at røre resten
   af koden. Husk: tekst skal stå i 'enkelte anførselstegn', og der skal
   være komma mellem hver linje i en liste.
   ===================================================================== */
window.BUDGIE_CONFIG = {
  appName: 'Budgie',
  currency: 'kr.',          // vises efter beløb, fx 250 kr.
  locale: 'en-DK',          // talformat: 1.250,50 (dansk) med engelske ord

  // ---------- Priser (kun visning – der trækkes ingen penge) ----------
  prices: { month: 29, year: 199 },

  // ---------- Gratis-grænser ----------
  free: {
    categories: 5,      // antal kategorier i gratis-versionen
    goals: 1,           // antal sparemål i gratis-versionen
    reminderDays: 3,    // vis faste udgifter, der trækkes inden for X dage
  },
  premium: { reminderDays: 7 },

  // ---------- Vaner ----------
  backupRemindDays: 14,   // påmind om backup hver 14. dag
  saveSuggestionPct: 10,  // "Læg 10 % til side, når lønnen kommer"
  savePctDefault: 20,     // onboarding: foreslå at spare 20 % (50/30/20-tankegang)

  // ---------- Måling (GoatCounter) ----------
  // Opret en gratis side på goatcounter.com og skriv navnet her, fx 'budgie'
  // (hvis din side hedder budgie.goatcounter.com). Tom = ingen måling.
  goatcounter: '',

  // ---------- Bankforbindelse (kun Premium) ----------
  // Adressen på din bank-server (se server/README.md), fx 'https://budgie-bank.dit-navn.workers.dev'
  // Tom = kun Demo Bank.
  bankApi: '',
  bankSyncHours: 6,       // hvor ofte appen henter nye køb, mens den er åben
  bankRenewDays: 14,      // mind brugeren om at forny godkendelsen X dage før den udløber

  // ---------- Indtægtstyper ----------
  incomeTypes: ['Salary', 'Pocket money', 'Student grant', 'Other'],

  // ---------- Standard-kategorier (onboarding) ----------
  // share = hvor stor en del af budgettet, kategorien foreslås at få
  // icon = navn fra listen "icons" længere nede
  categories: [
    { name: 'Food & drinks', icon: 'food',  color: '#4f46e5', share: 35 },
    { name: 'Transport',    icon: 'bus',    color: '#0284c7', share: 15 },
    { name: 'Fun',          icon: 'game',   color: '#ea580c', share: 25 },
    { name: 'Clothes',      icon: 'shirt',  color: '#db2777', share: 15 },
    { name: 'Subscriptions', icon: 'repeat', color: '#7c3aed', share: 10 },
  ],

  // ---------- Forslag til faste udgifter (onboarding) ----------
  fixedSuggestions: [
    { name: 'Phone',     amount: 129, day: 1, icon: 'phone',    on: true },
    { name: 'Streaming', amount: 99,  day: 5, icon: 'play',     on: true },
    { name: 'Travel card', amount: 300, day: 1, icon: 'bus',  on: false },
    { name: 'Fitness',   amount: 199, day: 1, icon: 'dumbbell', on: false },
  ],

  // ---------- Forslag til sparemål ----------
  goalSuggestions: ['New phone', "Driver's licence", 'Trip', 'Festival', 'Rainy day fund'],

  // ---------- Farver og ikoner man kan vælge ----------
  colors: ['#4f46e5', '#0284c7', '#059669', '#ea580c', '#db2777', '#7c3aed', '#ca8a04', '#475569'],
  icons: ['food', 'coffee', 'bus', 'game', 'shirt', 'repeat', 'phone', 'play', 'music', 'dumbbell', 'gift', 'heart', 'book', 'travel', 'house', 'sparkle'],

  // ---------- Tekster (appen er på engelsk) ----------
  texts: {
    welcomeTitle: "Hi! I'm Budgie",
    welcomeText: 'Get on top of your money in 2 minutes. See what you have left, save for your goals and get a heads-up before you overspend.',
    storageLocal: 'Your account and numbers are stored on this device only.',
    storageCloud: 'Your numbers are saved to your account (Google Firebase, EU), so you can log in on any device. Only you can read them.',
    privacy: [
      'Your password is never stored – only a scrambled version (hash) of it.',
      'A bank connection is read-only: Budgie can see purchases, but can never move money. You can disconnect at any time.',
      'If analytics is on, we only count anonymous events (like "first purchase"). Never amounts, names or emails.',
      'We never sell or share your data.',
      'You can download a backup or delete your account at any time in Settings.',
    ],
    disclaimer: 'Budgie gives guidance, not financial advice.',
  },
};
