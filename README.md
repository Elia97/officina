# officina

Gli strumenti dei progetti nati dai template del sistema (`vetrina`, poi `ecommerce` e `monorepo`), in un pacchetto solo: `@elia97/officina`. Ogni progetto li installa invece di portarne una copia, che alla prima modifica divergerebbe.

Il metodo dice come si lavora e sta nel plugin `metodo`; l'officina è dove stanno gli strumenti che CI, lefthook e Vercel eseguono.

## Uso in un progetto

```sh
pnpm add -D @elia97/officina
```

```json
{
  "scripts": {
    "check:comments": "officina check comments --strict",
    "check:language": "officina check language",
    "check:routes": "officina check routes",
    "check:roadmap": "officina check roadmap",
    "check:placeholders": "officina check placeholders",
    "perf:bundle": "officina check bundle",
    "check:links": "officina check links",
    "check:secrets": "officina check secrets",
    "smoke:prod": "officina check smoke",
    "analytics:verify": "officina check analytics",
    "lhci": "officina check lighthouse",
    "lhci:local": "officina check lighthouse --local",
    "gen": "officina gen",
    "gen:section": "officina gen section",
    "gen:page": "officina gen page",
    "gen:component": "officina gen component",
    "gen:collection": "officina gen collection",
    "gen:icons": "officina gen icons",
    "doctor": "officina doctor"
  }
}
```

I gate leggono dalla cartella corrente, che deve essere la radice del repository. Opzioni comuni dei gate sui sorgenti: `--diff`, `--base <ref>`, `--head <ref>`, `--strict`, `--format text|github`.

`check language` vuole in italiano i commenti del codice e i Markdown di documentazione. Lascia fuori per intero ciò che non è documentazione del progetto: i dizionari di `src/i18n/strings/` e i Markdown sotto `src/content/`, che sono copy nelle lingue del sito; le fonti del cliente in `docs/sources/`; i `CHANGELOG.md`, generati in inglese. Un file YAML di `src/content/` invece è codice, e i suoi commenti si controllano come altrove.

`check routes` segue i rimandi dei Markdown del progetto: i percorsi fra apici inversi dentro `docs`, `src`, `scripts`, `test`, `e2e`, `public`, `drizzle`, `.claude` e `.github`; i rimandi a una sezione, nella forma `file.md` § Titolo; i link e le immagini con una destinazione relativa, anche a riferimento e verso una cartella; e due tipi di nomi senza cartella, i documenti in maiuscolo come `HOW_TO_USE.md`, cercati accanto a chi cita, alla radice e in `docs/`, e i file di configurazione che vetrina tiene alla radice, come `vercel.json`, più `drizzle.config.ts` dei progetti con un database. Un link che esce dal repository è un rimando morto, perché in CI la cartella sopra non c'è. Restano fuori gli altri nomi senza cartella, come `head.astro`, gli URL, le ancore, il codice negli span e nei blocchi recintati, un nome che fa da testo a un link, dove conta la destinazione, i link e i nomi dei Markdown di `src/content/`, che sono copy del sito, e i nomi citati in `docs/ROADMAP.md` e nei `CHANGELOG.md`, che raccontano documenti usciti o da scrivere. Un blocco rientrato di quattro spazi non si riconosce come codice: un esempio va in un blocco recintato.

## Verifiche di build e di produzione

| Comando | Cosa guarda | Da dove prende le rotte |
|---|---|---|
| `check bundle` | il JavaScript e il CSS di `dist/client`, gzip, contro un budget per rotta | `src/pages`; sotto SSR, il manifest della build Vercel |
| `check links` | gli `<a href>` di `dist/client`: ogni link interno porta a qualcosa che la build serve, e nessuno a `#` | i file di `dist/client` e le rotte a richiesta del manifest della build Vercel |
| `check secrets [--canaries]` | i file di `dist/client`: nessuno contiene il valore o il canary di una chiave server e secret di `env.schema` | — |
| `check smoke [url]` | la produzione viva: pagine, pagine rese a richiesta, header di sicurezza, BotID, host canonico, barra finale | `src/pages`, più le rotte non HTML |
| `check analytics [GTM-…]` | il container GTM pubblico contro gli eventi del modulo di link-tracking del progetto (`analytics.linkTracking`) | — |
| `check lighthouse [url] [--local]` | Lighthouse CI sul `.lighthouserc.json` del progetto; con `url` misura un sito già servito, `--local` fa build, server statico e Chrome da sé | `src/pages` |
| `gen icons` | le icone del manifest, disegnate da `public/favicon.svg`, che è il suo ingresso obbligatorio | — |

Gli script di una pagina statica si leggono dal suo HTML, anche sotto una `base`, da un `assetsPrefix` o con una query. Una rotta renderizzata a richiesta non emette HTML. Con l'adapter Vercel, `check bundle` la legge dal manifest che Astro scrive in `.vercel/output/_functions` e la misura con gli stessi budget delle pagine statiche: gli script della rotta, le isole e gli script dei componenti che i chunk server della pagina nominano, e il runtime del framework quando c'è un'isola. Il JavaScript che Astro incorpora nell'HTML non si conta, né qui né per le pagine statiche. Due limiti: le isole raggiungibili solo attraverso un `import()` dinamico del server — un'isola dentro un contenuto MDX, per esempio — restano fuori, perché seguire quegli import attribuirebbe a ogni pagina il contenuto di tutto il sito; e un'isola si attribuisce per chunk, quindi una pagina eredita le isole dei componenti che condividono un chunk con quelli che usa. Il manifest è un formato interno di Astro, già cambiato una volta sotto i piedi del misuratore che c'era prima: quando non lo riconosce il check lo dice, e fallisce se non gli resta nessuna rotta da misurare; un'isola che non sa collegare al client è un fallimento, non una misura più bassa. Con un altro adapter, o con un manifest che non riconosce, le rotte SSR restano fuori, dichiarate: si misurano le pagine statiche, e il CSS come dice il paragrafo che segue.

Il CSS di una rotta è la somma dei fogli di `dist/client/_astro` che collega, ognuno contato una volta: per una pagina statica i `<link rel="stylesheet">` del suo HTML, anche sotto una `base`, da un `assetsPrefix` o con una query; per una rotta renderizzata a richiesta i fogli esterni che il manifest le assegna, e una rotta per cui il manifest non li dice è un fallimento. Il tetto è `bundle.cssMaxGzip`, e il rapporto ha una riga per ogni combinazione di fogli, perché le rotte che collegano gli stessi fogli pesano uguale. Non si contano il CSS dentro l'HTML, nei `<style>`, come il JavaScript incorporato, i link che non bloccano il rendering (`preload`, `prefetch`) e i fogli fuori da `_astro`, da `public/` o da un CDN. Un foglio citato che in `_astro` non c'è è un fallimento. Un foglio che nessuna rotta misurata collega si pesa da solo contro lo stesso tetto, e nel rapporto porta «da solo»: il CSS di un `import()` dinamico, quello dei componenti dentro un contenuto MDX reso a richiesta, che il manifest non assegna alla pagina, o tutti i fogli di una build le cui rotte non si leggono. Da solo pesa meno del vero, ma nessun foglio oltre il tetto passa in silenzio.

`check links` legge gli `<a href>` di ogni HTML di `dist/client`, fuori dai commenti, dagli `<script>`, dagli `<style>` e dai valori degli attributi, dove Astro lascia `<` e `>` come sono. È interno un link relativo, uno che comincia con `/` o uno assoluto verso l'origine di `siteUrl`, e se ne confronta il percorso, senza query né ancora, con o senza barra finale; un link relativo si risolve come con `trailingSlash: 'never'`, che è quello dei template. Vale se porta a un file della build, pagina o altro file, o a una rotta che il manifest della build Vercel rende a richiesta, endpoint e `/` di lingua compresi, confrontata con il pattern che Astro scrive lì; senza manifest, o con un altro adapter, a una pagina `.astro` con `prerender = false`, e il rapporto lo dice. Che la pagina dietro una rotta a richiesta esista lo sa solo il server, e una rotta come `/[...slug]` accetta ogni percorso: il rapporto conta i link che passano così. `href="#"`, `href=""` e un `href` senza valore sono segnaposto, e falliscono come un link rotto. Il rapporto raggruppa per destinazione e nomina le pagine che la citano: un link rotto nel footer è un problema solo, non uno per pagina. Restano fuori, e il rapporto li conta, i link esterni, che chiederebbero la rete, `mailto:`, `tel:` e gli altri schemi, e l'id a cui punta un'ancora. Una `dist/client` senza HTML è un fallimento, perché il controllo non affermerebbe niente: un progetto che rende ogni pagina a richiesta lo spegne con `features.links: false`. Due limiti: con una `base` i link non si risolvono, e un redirect di `vercel.json` non è una pagina, quindi un link che ci porta passa per rotto, e si corregge puntando alla destinazione.

`check secrets` legge le chiavi di `env.schema` con `context: 'server'` e `access: 'secret'`, dal sorgente di `astro.config.mjs` come `doctor`, e le cerca in ogni file di `dist/client`: un import sbagliato basta a portare un segreto nel browser. Per ogni chiave cerca il valore che ha nell'ambiente, anche nelle forme in cui Astro lo scrive nel markup e negli script, e il suo canary, `officina-<CHIAVE>-canary`, che `--canaries` stampa come righe `CHIAVE=valore` da mettere nell'ambiente della build. `actions/ci` lo fa dopo `pnpm run ci`, così i test che `ci` lancia non vedono i canary e la build sì. Il canary si dà solo ai campi `envField.string` senza validazioni (`max`, `min`, `length`, `url`, `includes`, `startsWith`, `endsWith`), perché Astro valida ogni variabile sul suo tipo e su quelle, e un canary che non le rispetta fermerebbe la build: una chiave così, in CI, resta da verificare. Una chiave che compare in un file è un fallimento che nomina la chiave e il file. Una chiave senza valore né canary nell'ambiente, o con un valore di meno di 8 caratteri, che cercato darebbe falsi positivi, non si verifica: il rapporto la dice con un avviso, invece di contarla fra le verificate. Uno schema senza chiavi segrete non ha niente da verificare, e una `dist/client` vuota è un fallimento.

Per Lighthouse un sito SSR si misura con `check lighthouse <url>`, sulla produzione o su un'anteprima: al posto del server del progetto visita quell'indirizzo, ed è l'unico modo di avere numeri di produzione. `--local` serve i file statici della build, quindi su un sito renderizzato a richiesta si ferma e lo dice, invece di misurare dei 404. Un'anteprima Vercel con la Deployment Protection risponde con la pagina di accesso, e il check non la può misurare: serve la produzione o un'anteprima non protetta. La porta del server locale segue `LH_PORT` sia con `--listen` sia con `--port`.

Lo smoke legge gli header di sicurezza sulla pagina a cui arriva la radice. Se `/` è un redirect sulla stessa origine — il 302 di lingua che Astro emette con `i18n.routing.redirectToDefaultLocale`, per esempio — li cerca sulla destinazione, perché il redirect non porta la CSP delle pagine renderizzate, e il nome del controllo dice dove li ha letti: `header content-security-policy su /it`. Un redirect verso un'altra origine, o senza `location`, è un fallimento. Anche l'attesa che l'alias di produzione punti al deployment nuovo conta un 3xx come una risposta.

Lo smoke visita anche le pagine rese a richiesta, quelle di `src/pages` con `export const prerender = false`. Ognuna risponde 200, oppure con un redirect sulla stessa origine, come una pagina protetta che rimanda all'accesso; un 200 è HTML e porta il meta `Content-Security-Policy` con la direttiva `script-src`, quello che il middleware dei template scrive nelle pagine rese a richiesta. Una pagina dinamica si visita col suo rappresentante di `routes.representatives`, altrimenti si salta dicendolo. Queste pagine non entrano nel controllo della barra finale né in Lighthouse. Nella 0.12.0 un'anomalia è un avviso, che lo smoke stampa con `·` senza fallire; dalla 0.13.0 sarà un fallimento. officina riconosce una pagina resa a richiesta dalla dichiarazione: con `output: 'server'`, una pagina senza `prerender = false` resta per tutti i gate una pagina prerenderizzata, e lo smoke la visita come le altre, senza cercarne la CSP.

Quando fallisce, lo smoke dice che la produzione è online e rotta, e consiglia di tornare indietro dalla dashboard di Vercel promuovendo l'ultimo deployment di produzione sano. Con `features.database` accesa aggiunge che lo schema non torna indietro: le migrazioni già applicate restano, e il deployment promosso regge solo se sono compatibili con il suo codice, la regola di «Migrazioni compatibili con la produzione» in § Action per i workflow.

Il motore è uguale per tutti; ciò che cambia da un progetto all'altro sta in un file solo, `officina.config.ts` nella radice:

```ts
import { type Budget, defineConfig, type SmokeCheck } from '@elia97/officina'
import { DEFAULT_CHECKS } from '@elia97/officina/smoke'

import { SITE } from './src/lib/site.ts'

const motion: Budget = { label: 'motion', matches: (route) => route === '/', maxGzip: 72 * 1024 }
const checkLanguageRedirect: SmokeCheck = async ({ get, baseUrl }) => []

export default defineConfig({
  siteUrl: SITE.url,
  icons: { background: SITE.themeColor.light },
  bundle: { budgets: [motion], cssMaxGzip: 14 * 1024 },
  smoke: { checks: [...DEFAULT_CHECKS, checkLanguageRedirect] },
  features: { analytics: 'required', roadmap: false, botId: 'required', links: 'required' },
  routes: { representatives: { '/blog/[slug]': '/blog/ciao-mondo' } },
})
```

La radice del pacchetto esporta `defineConfig` e i tipi; i pezzi del motore stanno nei sottopercorsi, così la radice resta la sola cosa che serve conoscere per configurarsi.

| Sottopercorso | Cosa esporta |
|---|---|
| `@elia97/officina/smoke` | `DEFAULT_CHECKS`, i sei controlli, `SECURITY_HEADERS`, `NON_HTML_ROUTES` |
| `@elia97/officina/bundle` | `CSS_BUDGET_GZIP` |
| `@elia97/officina/icons` | `ICON_SPECS` |

`siteUrl` serve a `check smoke` e `icons.background` a `gen icons`. I budget del progetto vengono prima del default di 20 KB, nell'ordine in cui sono scritti; `smoke.checks` sostituisce la lista del pacchetto, quindi chi ne toglie un controllo la ricompone da `DEFAULT_CHECKS`; `smoke.securityHeaders` e `smoke.nonHtmlRoutes` sostituiscono `SECURITY_HEADERS` e `NON_HTML_ROUTES`.

`features` dice quali controlli il progetto pretende: `'required'` fa fallire il gate quando ciò che deve guardare non c'è, `false` lo spegne dicendolo. Per BotID è `features.botId`: con `false` lo smoke salta la challenge e lo scrive nell'uscita, anche dentro una lista di `smoke.checks` che la contiene. Una voce non dichiarata vale `'required'`, e `doctor` la segnala: un gate che esce 0 su un container GTM che non esiste non afferma niente. `routes.representatives` dà a ogni pattern dinamico di `src/pages` un percorso vero, e da lì smoke e Lighthouse guardano anche quelle pagine.

`routes.disabled` elenca i pattern dinamici che il progetto spegne per scelta, scritti come le chiavi di `routes.representatives`: le news tenute spente finché non ci sono articoli veri, con un `getStaticPaths` che non emette niente. Come per `features`, una pagina si spegne scrivendolo, non dimenticandola: un pattern dinamico che non emette niente senza essere dichiarato resta un fallimento di `check bundle`. Su un pattern spento `check bundle` non pretende pagine e lo elenca come spento, `doctor` non chiede il rappresentante e lo elenca fra le spente, smoke e Lighthouse non lo visitano, anche se il rappresentante c'è ancora, e lo scrivono nell'uscita: quando il progetto riaccende la pagina, qui basta togliere la voce. Il contrario è un fallimento di `check bundle`, perché dichiarazione e build non coincidono: una rotta emessa che soltanto un pattern spento spiega, o una pagina spenta che la build rende a richiesta, come una pagina senza `prerender` con `output: 'server'`. Si spegne solo una pagina prerenderizzata. `doctor` legge il sorgente, e una voce che lì non è una pagina dinamica prerenderizzata di `src/pages` è un suo errore: una pagina statica Astro la genera sempre, e un nome sbagliato non spegne niente. `check bundle` conosce solo le pagine `.astro`: una pagina Markdown di `src/pages`, o un `.html` di `public/`, che cade sotto un pattern spento passa per emessa da quello.

`features.generators` ha un valore in più delle altre, perché non tutti i siti in produzione nascono dallo scaffold: `'required'` è il comportamento di sempre; `false` spegne i generatori del pacchetto, e `doctor` smette di chiedere i punti di aggancio e gli ancoraggi invece di pretendere file che nessun codice di quel sito userebbe; `'project'` fa lo stesso ma lascia vivi i generatori che il progetto scrive in `officina.generators.mjs`, che a quel punto `doctor` pretende. Con `false` o `'project'`, `officina gen section|page|component|collection` si ferma dicendolo, mentre gli script `gen` e `gen:*` restano attesi in `package.json`: meglio un comando che spiega di uno script che manca. `gen icons` non c'entra con i generatori di codice e non cambia.

`features.database` e `features.auth` sono le due voci che il silenzio non accende, perché la maggior parte dei progetti un database non lo ha: seguono le dipendenze. `database` è accesa quando `package.json` dipende da `drizzle-orm`, `auth` quando dipende da `better-auth`, fra le `dependencies` o le `devDependencies`; senza la libreria la voce non si chiede e vale spenta. Dichiarata, vale la dichiarazione: `false` spegne la feature anche con la libreria, e `doctor` lo scrive nell'uscita; `'required'` la accende anche senza. `database.migrationUrlKey` è la variabile con cui girano le migrazioni, `DATABASE_URL_UNPOOLED` se non è dichiarata, e deve essere il nome di una variabile d'ambiente.

`placeholders` dice a `check placeholders` cosa guardare: `sources` sono i file da scandire, `contactEnvKeys` le variabili che `--env` pretende. Una lista dichiarata **sostituisce** quella del pacchetto, dizionari compresi: senza dichiarazione i sorgenti sono `src/lib/site.ts`, `src/lib/company.ts` e i dizionari di `src/i18n/strings`, quando la cartella esiste. Serve ai progetti che non nascono dallo scaffold: se partita IVA, recapiti e destinatario dei form stanno nel contenuto invece che in un modulo, i sorgenti del template non sono i suoi, e crearli per far passare il gate terrebbe gli stessi dati in due sedi. Un sorgente elencato che non esiste è un ritrovamento con il suo percorso, non un errore che ferma il comando. Con il database acceso `--env` pretende anche `DATABASE_URL` e la variabile delle migrazioni, e con l'autenticazione `BETTER_AUTH_SECRET`, qualunque sia `contactEnvKeys`.

Nel deploy `check placeholders` gira due volte sui file di Vercel. Con `--env .vercel/.env.production.local`, dopo `vercel pull`, distingue una chiave che su Vercel non esiste, una vuota e una che porta un segnaposto del template, tutte e tre errori, da una variabile **Secret**: `vercel pull` non ne scarica il valore e scrive al suo posto `[SENSITIVE]`, quindi il check lo dice con un avviso, che non ferma il deploy, invece di darla per verificata. Il segnaposto però diventa un problema se la build legge la variabile, per esempio una variabile di `astro:env` con `access: 'public'`, che Astro incorpora nel codice: con `--output .vercel/output`, dopo `vercel build`, il check cerca `[SENSITIVE]` nei file della build e ferma il deploy nominandoli. Una variabile che la build legge va tenuta Config su Vercel, o letta a runtime, e una Secret non diventa Config: si toglie e si riaggiunge.

Il file lo carica Node, che fuori da `node_modules` toglie i tipi da sé: niente `enum`, niente alias `@/`. Due file `officina.config.*` insieme sono un errore, come un file senza default export; il resto lo valida `loadConfig` a runtime, nominando il percorso della voce sbagliata — `bundle.cssMaxGzip: atteso un numero, ricevuto una stringa` — e una voce sconosciuta, perché `sitUrl` al posto di `siteUrl` non deve passare in silenzio.

`sharp` è una dipendenza facoltativa del progetto, non del pacchetto: serve solo a `gen icons`, che senza lo dice ed esce 1. Un ingresso che manca — il favicon, `.lighthouserc.json`, `src/pages`, la build in `dist/client` — è sempre una riga che nomina il file e dice a cosa serve, mai uno stack trace. `@biomejs/biome` invece è una peer dependency con l'intervallo che il preset regge, e `doctor` confronta la versione del progetto con quello.

## Preset di configurazione

Le regole che valgono per tutti i progetti stanno nel pacchetto; il progetto estende e tiene solo le proprie eccezioni.

```json
{
  "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "extends": ["@elia97/officina/biome"]
}
```

```yaml
# lefthook.yml
extends:
  - node_modules/@elia97/officina/presets/lefthook.yml
```

`$schema` punta allo schema che il pacchetto di Biome installa, che è sempre quello della CLI. L'URL di biomejs.dev porta invece la versione, che Dependabot non aggiorna quando alza `@biomejs/biome`, e da lì Biome segnala lo scarto a ogni esecuzione: `doctor` lo segnala come errore.

## Action per i workflow

I passi dei workflow stanno in `actions/` di questo repository, come composite action: girano dentro il job di chi le chiama, quindi il nome del check e l'`environment` restano del progetto. Il riferimento va fissato a un tag di versione o a uno SHA, mai a `@main`, e deve essere la stessa versione del pacchetto installato — `doctor` lo verifica.

| Action | Passi | Cosa resta nel workflow del progetto |
|---|---|---|
| `actions/ci` | checkout, node, install, `astro sync`, con `migrate` le migrazioni del branch di test, `pnpm run ci`, i canary di `check secrets`, build, `perf:bundle`, `check:links`, `check:secrets`; con `e2e: 'true'` anche Playwright | trigger, permessi, il job `ci`; con un database, lo script delle migrazioni e il segreto `TEST_DATABASE_URL` passati in `with:` |
| `actions/review` | `astro sync`, poi `fallow review` sul diff contro il merge-base | il job informativo |
| `actions/deploy` | risoluzione del tag, stessa versione di officina, gate, `vercel pull`, con `migrate` le migrazioni, `build`, controllo della build, `deploy`, smoke; espone `url` | trigger, `environment`, i tre segreti Vercel passati in `with:`, il job che controlla se i segreti ci sono; con un database, lo script delle migrazioni in `with:` |
| `actions/lighthouse` | build equivalente alla produzione e `pnpm run lhci` | trigger, etichetta, `continue-on-error` |

```yaml
concurrency:
  group: deploy-production
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    environment:
      name: production
      url: ${{ steps.deploy.outputs.url }}
    steps:
      - uses: Elia97/officina/actions/deploy@vX.Y.Z
        id: deploy
        with:
          ref: ${{ inputs.ref }}
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

`astro sync` genera i tipi di `.astro/`, che fallow pretende e un checkout pulito non ha; se fallisce il passo lo segnala con un avviso e il job prosegue.

I tre segreti sono input obbligatori e l'action li mette nell'`env` dei soli tre passi che chiamano `vercel`. Nell'`env` del job li vedrebbero anche `pnpm install` e gli script di installazione di ogni dipendenza, che girano codice di terzi con in mano un token di deploy.

**Il deploy lanciato a mano.** Con `workflow_dispatch` il workflow viene dal ramo scelto in «Use workflow from», e il pacchetto dal lockfile del tag che si deploya: le due metà possono avere due versioni di officina diverse, e un passo dell'action più nuova può chiamare un'opzione che gli script del tag non conoscono. `actions/deploy` confronta le due versioni subito dopo l'install, prima di ogni script del progetto e di `vercel pull`, e si ferma dicendole se non coincidono o se il tag non installa officina. Un tag più vecchio si deploya lanciando Deploy da quel tag: il suo `deploy.yml` dichiara l'action della sua versione, con i gate di allora. Perché si possa, l'environment `production` del progetto deve ammettere i tag fra i ref da cui si deploya.

**Il database di test.** Un progetto con un database passa a `actions/ci` lo script delle migrazioni e il segreto del branch di test:

```yaml
      - uses: Elia97/officina/actions/ci@vX.Y.Z
        with:
          migrate: db:migrate
          database-url: ${{ secrets.TEST_DATABASE_URL }}
```

Prima di `pnpm run ci` l'action lancia `officina migrate --script <migrate>`, che legge `database.migrationUrlKey` da `officina.config.ts` e dà l'indirizzo allo script sotto quella chiave, e solo sotto quella. `pnpm run ci` lo riceve come `TEST_DATABASE_URL`, per i test di integrazione. La build e `check:secrets` lo ricevono come `DATABASE_URL`, al posto del canary: una pagina prerenderizzata dal database lo legge davvero, e `check secrets` cerca il valore che la build ha ricevuto. Gli altri passi non lo vedono, e senza `database-url` i comandi ricevono l'ambiente del job com'è. Con `migrate` e il segreto vuoto, come sulle PR di Dependabot e su quelle da un fork, l'action non migra, lo dice con un `::notice::` e prosegue: i test di integrazione si saltano da soli, e la build riceve il canary. Le PR di Dependabot ricevono solo i segreti di Dependabot: per avere l'integrazione anche lì, `TEST_DATABASE_URL` va anche fra quelli, e allora l'indirizzo arriva al codice di ogni aggiornamento, quindi il branch di test non deve contenere dati veri. Senza il segreto, una pagina prerenderizzata dal database non ha un database da leggere, e la build si ferma.

**Le migrazioni al deploy.** Con un database, anche `actions/deploy` riceve lo script delle migrazioni, `migrate: db:migrate` in `with:`. Dopo `vercel pull` e `check:placeholders --env`, prima di `vercel build`, l'action lancia `officina migrate --env .vercel/.env.production.local --script <migrate>`: l'indirizzo è quello delle variabili di Production su Vercel, che nel job di deploy restano l'unica fonte, e lo script lo riceve sotto `database.migrationUrlKey`, senza gli spazi ai bordi, come lo legge `vercel build`: è l'unica variabile del file che gli si aggiunge. Su Vercel quella variabile dev'essere Config e collegata a Production: di una Secret `vercel pull` non scarica il valore, e il comando si ferma dicendolo, come con una chiave assente o vuota. L'indirizzo non è un segreto di GitHub, quindi il runner non lo maschera da sé: il comando registra con `::add-mask::` l'indirizzo e la sua password, com'è e decodificata, su stdout e su stderr, e lancia lo script quando le maschere sono scritte.

**La chiave delle migrazioni su Vercel.** Dalla CLI si aggiunge con `vercel env add DATABASE_URL_UNPOOLED production --type config`, o con la chiave di `database.migrationUrlKey`: senza `--type`, la 62.2.0 la crea Secret, o la propone per prima nel prompt, e una Secret non diventa Config, si toglie e si riaggiunge. Con `migrate`, una chiave Secret ferma il deploy al passo delle migrazioni, anche se `check placeholders --env`, il passo prima, la segnala solo con un avviso. In locale Vercel non è l'unica fonte: `vercel pull` fonde il file che trova, tiene il valore locale di una Secret e le chiavi che su Vercel non ci sono più, quindi `officina migrate --env` lanciato a mano può usare un indirizzo vecchio senza vedere `[SENSITIVE]`.

**Migrazioni compatibili con la produzione.** Le migrazioni si applicano prima della build: se poi la build o il deploy falliscono, la produzione resta sul codice di prima con lo schema nuovo, e lo schema non torna indietro né promuovendo il deployment precedente, quando fallisce lo smoke, né deployando un tag più vecchio. Ogni migrazione deve quindi reggere il codice in produzione, e additiva non basta: lo rompono, senza togliere niente, un `NOT NULL` senza default, un `UNIQUE`, un `CHECK` o una chiave esterna nuovi su dati che quel codice scrive, come un cambio di tipo o un vincolo più stretto. Ciò che toglie arriva dopo: una colonna si toglie quando nessun deployment che si potrebbe promuovere la legge più, e una rinomina passa da una colonna nuova, che il codice scrive insieme alla vecchia, prima di togliere la vecchia in una release successiva.

**Un tempo massimo.** Il passo delle migrazioni non ne ha uno, e il passo di una composite action non accetta `timeout-minutes`. Una migrazione che aspetta un lock blocca, finché non lo ottiene, le query di produzione su quella tabella: le migrazioni del progetto chiedono un `lock_timeout`, con `SET lock_timeout` di Postgres in testa al file, e il job di deploy un `timeout-minutes`, come nell'esempio del deploy.

Quello che si scarica al volo è fissato a una versione esatta, in un posto solo: la CLI di Vercel in `actions/deploy/action.yml`, `@lhci/cli` in `src/checks/lighthouse.ts`, `serve` in `src/sh/lhci-local.sh`. Che i primi due siano esatti, uguali ovunque e non indietro di una major su npm lo guarda ogni lunedì `.github/workflows/vercel-cli.yml`, con `officina check vercel-cli`.

Perché le action non restino ferme per sempre, Dependabot di questo repository copre l'ecosistema `github-actions` anche dentro `/actions/*`, dove le action di terze parti sono fissate allo SHA intero con la versione nel commento.

## doctor

`officina doctor` dice, in qualunque repository, cosa manca perché il progetto prenda tutto da fuori: i punti di aggancio dei generatori, gli ancoraggi delle pagine a sezioni e dei dizionari, gli script, le dipendenze e gli strumenti di `package.json`, i residui di ciò che è uscito (copia del metodo, script, documenti commerciali), i preset, i workflow di GitHub e Dependabot, `officina.config.ts` e, con un database o l'autenticazione, ciò che li rende sicuri. Sta dentro `ci`, quindi un progetto allineato non torna indietro senza che il gate lo dica.

Di `.github/dependabot.yml` guarda la **forma**, non la presenza delle chiavi: lo legge come YAML e pretende che le chiavi del gruppo stiano sul gruppo — Dependabot rifiuta l'intero file se `commit-message` o `open-pull-requests-limit` stanno su una voce che dichiara `multi-ecosystem-group` — e che ogni ecosistema del gruppo abbia una seconda voce per il resto. Senza quella, `patterns` restringe l'intera voce e tutto il resto smette di aggiornarsi senza che niente diventi rosso. Le action le cerca con il nome che dà loro Dependabot, quello del repository senza la sottocartella: `Elia97/officina`. `Elia97/officina/*` non corrisponde a nessuna dipendenza, in `patterns` come in `ignore` o in `exclude-patterns`, e `doctor` lo segnala ovunque compaia.

Le prime due sezioni rispondono a due domande diverse. I punti di aggancio sono l'elenco di `src/lib/contract.ts`, e chiedono che una cosa esista: i moduli che il codice generato importa, le cartelle in cui i generatori scrivono, `class-variance-authority` fra le dipendenze, lo script `check` che il post-gen lancia. Gli ancoraggi guardano dentro quei file, e chiedono che abbiano ancora la forma su cui l'iniezione conta:

- per ogni collection a sezioni registrata in `src/content.config.ts` — riconosciuta dall'import di `<nome>CollectionSchema` da `@/lib/schemas/<nome>`, non dai marcatori, che sono proprio ciò che può sparire — la funzione `<nome>CollectionSchema`, la sua `z.discriminatedUnion` sopra un array letterale, il parametro non destrutturato che una sezione con immagine riceve, il `return { … }` di primo livello di `get<Nome>Sections`, e una sola pagina sotto `src/pages/` che porti `{/* @gen:<nome>-sections */}` e, su quella, `// @gen:<nome>-imports`;
- per ogni dizionario di `src/i18n/strings/`, il suo `export const <lingua> = { … } as const`.

Sono gli stessi controlli del pre-volo dei generatori, non una copia: `doctor` chiama `assertSectionAnchors` e `assertDictionaries`, che vivono in `src/gen/` insieme all'iniezione. Al pre-volo resta ciò che dipende dal nome di quello che sta per nascere — la sezione già nell'unione, l'identificatore già preso nel barrel o nel frontmatter, la chiave già nel dizionario, il file che esiste già — e che quindi si può chiedere solo al lancio del generatore.

Le altre sezioni misurano che il progetto e il pacchetto si muovano insieme:

- **stessa versione**: il riferimento delle action nei workflow — `@v<x.y.z>`, oppure uno SHA con `# v<x.y.z>` nel commento — deve essere la versione del pacchetto installato. Un progetto col pacchetto alla 0.8 e le action alla 0.6 non è un progetto allineato;
- **una PR sola**: il `.github/dependabot.yml` del progetto deve avere un gruppo `multi-ecosystem-groups` che prende `@elia97/officina` da npm e `Elia97/officina` da `github-actions`. Senza, Dependabot ne apre due e il controllo qui sopra le boccia entrambe;
- **gli strumenti che preset e action danno per scontati**: `@biomejs/biome`, `lefthook`, `@commitlint/cli`, `@commitlint/config-conventional` e `fallow` fra le `devDependencies`, con la versione di Biome dentro l'intervallo che il preset dichiara di reggere.

Con `features.database` o `features.auth` accese c'è una sezione in più, «database e autenticazione», che chiede ciò che rende sicuro un progetto con dati e utenti. Con il database: gli script `db:generate` e `db:migrate`, `drizzle.config.ts`, gli input `migrate` e `database-url` di `actions/ci` in `ci.yml` e l'input `migrate` di `actions/deploy` in `deploy.yml`. Per ogni feature accesa, la sua chiave in `env.schema`, `DATABASE_URL` o `BETTER_AUTH_SECRET`, con `context: 'server'` e `access: 'secret'`: una variabile pubblica Astro la scrive nel codice della build. Lo schema si legge dal sorgente di `astro.config.mjs`, senza eseguirlo, quindi una chiave conta se è scritta lì con `context` e `access` per esteso.

`package.json`, `.claude/settings.json`, `biome.json` e `.mcp.json` si leggono come JSON, non cercandoci dentro delle stringhe: `"hooks"` in un valore qualunque non è un blocco `hooks`. Nei workflow i riferimenti alle action si cercano nel testo, perché la versione di uno SHA sta nel commento, e una riga commentata non soddisfa nessun controllo; gli input che un passo dà a un'action si leggono come YAML.

**Un requisito nuovo nasce come avviso.** Quando `doctor` impara a chiedere una cosa nuova, la mancanza è un `warning` nella versione che la introduce e diventa un `error` dalla successiva. `doctor` gira dentro `pnpm run ci` senza `--strict`, quindi la PR di Dependabot che porta la versione nuova passa, e il progetto ha una versione di tempo per adeguarsi. L'avviso serve a far passare quella PR, e dove non può passare comunque il requisito nasce come errore: con il filtro `Elia97/officina/*` l'aggiornamento arriva diviso in due PR, e nessuna delle due passa il controllo sulla stessa versione.

## Sviluppo

```sh
pnpm install
pnpm test        # vitest; i test che leggono dal disco girano in test/fixture-project/
pnpm typecheck
pnpm build       # tsc → dist/, l'unica cosa che viene pubblicata
pnpm test:pack   # pnpm pack, poi il tarball installato in un progetto vuoto
```

`ci`, `build` e `test:pack` girano anche in `.github/workflows/ci.yml`, su ogni pull request e su ogni push a `main`.

I sorgenti sono TypeScript, ma il pacchetto pubblica JavaScript: Node toglie i tipi al volo solo fuori da `node_modules`. I test con `--diff` hanno bisogno di almeno un commit su `main`.

## Pubblicare

**Una release a settimana**, salvo una rottura che ferma un progetto: le correzioni si accumulano su `main` ed escono insieme. Ogni release è un aggiornamento da portare in ogni progetto e nel template, e il gruppo `officina` di Dependabot lo propone una volta a settimana: rilasciare più spesso non lo fa arrivare prima, moltiplica soltanto le PR da seguire.

```sh
npm pkg set version=X.Y.Z
git diff                                  # una riga sola: "version" in package.json
git commit -am "chore(release): X.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z"
git push --follow-tags
```

Il tag va creato **annotato**: `--follow-tags` spinge soltanto i tag annotati, e un tag leggero resta in locale senza nessun errore, quindi il rilascio non parte. È successo con la 0.6.0.

Il resto lo fa `.github/workflows/release.yml`, sul push di un tag `v*`: controlla che il tag corrisponda a `version`, rilancia il gate, la build e il test del tarball, pubblica su npm con trusted publishing (OIDC) e provenance, e crea la release su GitHub con le note generate. Niente `pnpm publish` dal terminale: quello che finisce su npm esce da un tag, e da nient'altro.

Il rilascio è fatto quando lo confermano tre cose: `git ls-remote --tags origin` mostra `vX.Y.Z^{}`, cioè il tag annotato arrivato sul remoto; il workflow «Rilascio» sul tag è verde; `curl -fsS https://registry.npmjs.org/@elia97%2Fofficina/X.Y.Z` risponde con il manifesto della versione. `npm view`, anche con `@X.Y.Z`, passa invece dal documento aggregato del pacchetto, che arriva da una CDN e per qualche minuto dopo la pubblicazione può ancora rispondere 404.

Le action si richiamano per tag, quindi **una versione senza tag non è adottabile**: `doctor` chiede ai progetti la stessa versione del pacchetto installato, e un tag che non esiste non si può scrivere in un workflow.

Una volta sola, a mano: su npmjs.com il trusted publisher per `Elia97/officina` e `release.yml`; su GitHub un ruleset sui tag `v*` che ne vieta modifica e cancellazione.

## Generatori

`officina gen` avvolge plop con i generatori e i template del pacchetto, e scrive nel progetto da cui lo lanci: `section`, `page`, `component`, `collection`. `plop` e `ts-morph` sono dipendenze del pacchetto, non del progetto.

I generatori scrivono codice che deve incastrarsi nello scaffold, quindi il progetto deve avere i punti di aggancio che si aspettano: i moduli che il codice generato importa, l'elenco è `src/lib/contract.ts`, e i file in cui iniettano, con la forma su cui l'iniezione conta. Sono le prime due sezioni di `officina doctor`. Finché manca qualcosa il pre-volo del generatore si ferma prima di scrivere un solo file.

Un progetto aggiunge i propri generatori con un file `officina.generators.mjs` nella radice, con la firma di un plopfile: `export default function (plop)`. È un'estensione avanzata e non è parte dell'API del pacchetto: è legata alla firma di plop, quindi una major di plop può romperla.

I test dei generatori girano sui punti di aggancio del progetto di prova, copiati da `vetrina`. Che un progetto vero li abbia ancora lo verifica `doctor`, non i test.

## Cosa arriverà

I preset di `monorepo`.
