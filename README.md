# Budgie – budget-app for unge (15–25 år)

Mobil-først PWA. Alle data gemmes **kun på enheden** (localStorage). Ingen login, ingen backend, ingen bank.
Appens sprog er engelsk; beløb vises i kroner, og datoer følger dansk tid (Europe/Copenhagen).

Live: https://flowersmokeapp.github.io/Kronen/  (på computer vises appen i en telefonramme)

## Filer
| Fil | Hvad den gør |
|---|---|
| `js/config.js` | **Ret her:** kategorier, forslag, tekster, priser, gratis-grænser, GoatCounter |
| `js/calc.js` | Alle beregninger ét sted (Tilbage = indtægt − faste − brugt − sparet) |
| `js/store.js` | Lagring, backup (JSON) og eksempeldata |
| `js/app.js` | Skærme: onboarding, Home, Budget, Goals, Report, indstillinger, Premium |
| `js/icons.js` | Ikonsæt (SVG) |
| `css/app.css` | Design, mørk tilstand, farver øverst i filen |
| `sw.js` | Offline-cache – **hæv versionsnummeret** (`budgie-v6` → `v7`), når du ændrer filer |
| `tests/calc.test.js` | Tests af beregningerne |

## Test
```
npm test
```

## Måling
Opret en gratis side på goatcounter.com og skriv navnet i `goatcounter` i `js/config.js`.
Hændelser: `onboarding-done`, `first-purchase`, `return-7d`, `premium-click`, `premium-trial-month|year`, `premium-waitlist`, `export-csv`, `export-pdf`.
