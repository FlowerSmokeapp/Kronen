# Budgie bank-server (Enable Banking + Cloudflare Workers)

Serveren gør, at Premium-brugere kan forbinde deres bank **én gang** – derefter henter appen selv nye køb.
Bankens nøgle ligger kun på serveren, aldrig i appen.

## Hvad koster det?
| Del | Pris |
|---|---|
| Cloudflare Workers | **Gratis** (op til 100.000 kald om dagen) |
| Enable Banking – test med *dine egne* konti ("Restricted production") | **Gratis** |
| Enable Banking – rigtige kunder | Kræver aftale + virksomhedstjek (KYB). Pris pr. forbundet konto – ikke offentlig, kontakt info@enablebanking.com |

## Opsætning (ca. 20 min.)
1. **Enable Banking:** Opret dig på enablebanking.com → *Control panel* → *Applications* → *Register new application*
   - Environment: **Production** (det er gratis i "restricted" tilstand)
   - Redirect URL: `https://dani-gh1.github.io/Kronen/app.html`
   - Gem den private nøgle (`.pem`-fil) og notér **Application ID**
   - Tilføj din egen bankkonto under *Linked accounts* (så kan du teste gratis)
2. **Cloudflare:** Opret en gratis konto på cloudflare.com
3. Installér Node.js, og kør i mappen `server/`:
   ```
   npx wrangler login
   npx wrangler secret put EB_APP_ID        # indsæt Application ID
   npx wrangler secret put EB_PRIVATE_KEY   # indsæt hele indholdet af .pem-filen
   npx wrangler deploy
   ```
   Hvis nøglen starter med `BEGIN RSA PRIVATE KEY`, så konvertér den først:
   `openssl pkcs8 -topk8 -nocrypt -in key.pem -out key-pkcs8.pem`
4. Wrangler viser en adresse, fx `https://budgie-bank.dit-navn.workers.dev`.
   Skriv den i `js/config.js` → `bankApi: '…'` og læg det på GitHub.

## Godt at vide
- EU-reglerne (PSD2) gør, at banken må bede om ny godkendelse efter **180 dage**. Budgie minder brugeren om det 14 dage før, og det tager ét tryk + MitID.
- Kun Premium-brugere kan forbinde. Mister man Premium, sættes synkroniseringen på pause; allerede hentede køb bliver liggende.
- Test: `npm test` (fra projektets rod) tester serveren mod en falsk bank.
