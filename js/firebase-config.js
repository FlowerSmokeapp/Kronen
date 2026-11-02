// =====================================================================
//  FIREBASE – så data gemmes på kontoen (og ikke kun på enheden)
//  Indsæt værdierne fra Firebase-konsollen:
//  Project settings → Your apps → Web app → "SDK setup and configuration" → Config
//  Så længe apiKey er tom, gemmer appen kun på enheden.
//  (Disse værdier er ikke hemmelige – det er reglerne i firestore.rules, der beskytter data.)
// =====================================================================
window.FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};
