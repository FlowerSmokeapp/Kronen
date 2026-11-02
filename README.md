# Budgie – budget-app for unge (15–25 år)

Mobil-først PWA. Man opretter en konto, ser Premium-tilbuddet og kommer så ind i appen.

**Data gemmes på kontoen** (Firebase), når `js/firebase-config.js` er udfyldt – så kan man logge ind på alle enheder, og appen virker også offline. Indtil da gemmes alt kun på enheden.

**Bank:** Køb kan importeres fra en CSV-fil fra netbanken (virker med alle banker i dag, `js/csvimport.js`). Automatisk forbindelse kører på en **Demo Bank** – rigtige banker kræver en open banking-partner og en server (se `js/bank.js`).

### Opsætning af Firebase
1. console.firebase.google.com → Create project
2. Build → Authentication → Get started → Email/Password → Enable
3. Build → Firestore Database → Create database → location `eur3` → production mode
4. Firestore → Rules → indsæt indholdet af `firestore.rules` → Publish
5. Project settings → Your apps → Web (</>) → Register → kopiér config ind i `js/firebase-config.js`
6. Authentication → Settings → Authorized domains → tilføj `flowersmokeapp.github.io`
Appens sprog er engelsk; beløb vises i kroner, og datoer følger dansk tid (Europe/Copenhagen).

Live: https://flowersmokeapp.github.io/Kronen/  (på computer vises appen i en telefonramme)

## Filer
| Fil | Hvad den gør |
|---|---|
| `js/config.js` | **Ret her:** kategorier, forslag, tekster, priser, gratis-grænser, GoatCounter |
| `js/calc.js` | Alle beregninger ét sted (Tilbage = indtægt − faste − brugt − sparet) |
| `js/store.js` | Lagring pr. konto, backup (JSON) og eksempeldata |
| `js/auth.js` | Konti og lagring på kontoen (Firebase) – eller lokalt, hvis Firebase ikke er sat op |
| `js/firebase-config.js` | **Indsæt Firebase-nøgler her** |
| `js/csvimport.js` | Import af kontoudtog (CSV) fra netbanken |
| `firestore.rules` | Sikkerhedsregler: hver bruger kan kun se sine egne data |
| `js/bank.js` | Bankforbindelse: Demo Bank, automatisk sortering i kategorier, synkronisering |
| `js/app.js` | Skærme: onboarding, Home, Budget, Goals, Report, indstillinger, Premium |
| `js/icons.js` | Ikonsæt (SVG) |
| `css/app.css` | Design, mørk tilstand, farver øverst i filen |
| `sw.js` | Offline-cache – **hæv versionsnummeret** (`budgie-v8` → `v9`), når du ændrer filer |
| `tests/` | Tests af beregninger og bank |

## Test
```
npm test
```

## Måling
Opret en gratis side på goatcounter.com og skriv navnet i `goatcounter` i `js/config.js`.
Hændelser: `onboarding-done`, `first-purchase`, `return-7d`, `premium-click`, `premium-trial-month|year`, `premium-waitlist`, `export-csv`, `export-pdf`.
