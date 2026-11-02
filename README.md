# Budgie – budget-app for unge (15–25 år)

Mobil-først PWA. Man opretter en konto, ser Premium-tilbuddet og kommer så ind i appen.

**Prototype:** konti og data gemmes kun på enheden (localStorage, adgangskoder som PBKDF2-hash). Bankforbindelsen kører på en **Demo Bank** med eksempel-køb – rigtige banker kræver open banking-partner og en server (se `js/bank.js`).
Appens sprog er engelsk; beløb vises i kroner, og datoer følger dansk tid (Europe/Copenhagen).

Live: https://flowersmokeapp.github.io/Kronen/  (på computer vises appen i en telefonramme)

## Filer
| Fil | Hvad den gør |
|---|---|
| `js/config.js` | **Ret her:** kategorier, forslag, tekster, priser, gratis-grænser, GoatCounter |
| `js/calc.js` | Alle beregninger ét sted (Tilbage = indtægt − faste − brugt − sparet) |
| `js/store.js` | Lagring pr. konto, backup (JSON) og eksempeldata |
| `js/auth.js` | Konti (opret, log ind, log ud) – skift denne fil ud, når der kommer en server |
| `js/bank.js` | Bankforbindelse: Demo Bank, automatisk sortering i kategorier, synkronisering |
| `js/app.js` | Skærme: onboarding, Home, Budget, Goals, Report, indstillinger, Premium |
| `js/icons.js` | Ikonsæt (SVG) |
| `css/app.css` | Design, mørk tilstand, farver øverst i filen |
| `sw.js` | Offline-cache – **hæv versionsnummeret** (`budgie-v7` → `v8`), når du ændrer filer |
| `tests/` | Tests af beregninger og bank |

## Test
```
npm test
```

## Måling
Opret en gratis side på goatcounter.com og skriv navnet i `goatcounter` i `js/config.js`.
Hændelser: `onboarding-done`, `first-purchase`, `return-7d`, `premium-click`, `premium-trial-month|year`, `premium-waitlist`, `export-csv`, `export-pdf`.
