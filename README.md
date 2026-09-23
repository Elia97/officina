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

## Verifiche di build e di produzione

| Comando | Cosa guarda | Da dove prende le rotte |
|---|---|---|
| `check bundle` | il JavaScript e il CSS di `dist/client`, gzip, contro un budget per rotta | `src/pages`; sotto SSR, il manifest della build Vercel |
| `check smoke [url]` | la produzione viva: pagine, header di sicurezza, BotID, host canonico, barra finale | `src/pages`, più le rotte non HTML |
| `check analytics [GTM-…]` | il container GTM pubblico contro gli eventi del modulo di link-tracking del progetto (`analytics.linkTracking`) | — |
| `check lighthouse [url] [--local]` | Lighthouse CI sul `.lighthouserc.json` del progetto; con `url` misura un sito già servito, `--local` fa build, server statico e Chrome da sé | `src/pages` |
| `gen icons` | le icone del manifest, disegnate da `public/favicon.svg`, che è il suo ingresso obbligatorio | — |

Una rotta renderizzata a richiesta non emette HTML. Con l'adapter Vercel, `check bundle` la legge dal manifest che Astro scrive in `.vercel/output/_functions` e la misura con gli stessi budget delle pagine statiche: gli script della rotta, le isole e gli script dei componenti che i chunk server della pagina nominano, e il runtime del framework quando c'è un'isola. Il JavaScript che Astro incorpora nell'HTML non si conta, né qui né per le pagine statiche. Due limiti: le isole raggiungibili solo attraverso un `import()` dinamico del server — un'isola dentro un contenuto MDX, per esempio — restano fuori, perché seguire quegli import attribuirebbe a ogni pagina il contenuto di tutto il sito; e un'isola si attribuisce per chunk, quindi una pagina eredita le isole dei componenti che condividono un chunk con quelli che usa. Il manifest è un formato interno di Astro, già cambiato una volta sotto i piedi del misuratore che c'era prima: quando non lo riconosce il check lo dice, e fallisce se non gli resta nessuna rotta da misurare; un'isola che non sa collegare al client è un fallimento, non una misura più bassa. Con un altro adapter le rotte SSR restano fuori, dichiarate, e il check misura soltanto il CSS.

Per Lighthouse un sito SSR si misura con `check lighthouse <url>`, sulla produzione o su un'anteprima: al posto del server del progetto visita quell'indirizzo, ed è l'unico modo di avere numeri di produzione. `--local` serve i file statici della build, quindi su un sito renderizzato a richiesta si ferma e lo dice, invece di misurare dei 404. Un'anteprima Vercel con la Deployment Protection risponde con la pagina di accesso, e il check non la può misurare: serve la produzione o un'anteprima non protetta. La porta del server locale segue `LH_PORT` sia con `--listen` sia con `--port`.

Lo smoke legge gli header di sicurezza sulla pagina a cui arriva la radice. Se `/` è un redirect sulla stessa origine — il 302 di lingua che Astro emette con `i18n.routing.redirectToDefaultLocale`, per esempio — li cerca sulla destinazione, perché il redirect non porta la CSP delle pagine renderizzate, e il nome del controllo dice dove li ha letti: `header content-security-policy su /it`. Un redirect verso un'altra origine, o senza `location`, è un fallimento. Anche l'attesa che l'alias di produzione punti al deployment nuovo conta un 3xx come una risposta.

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
  features: { analytics: 'required', roadmap: false, botId: 'required' },
  routes: { representatives: { '/blog/[slug]': '/blog/ciao-mondo' } },
})
```

La radice del pacchetto esporta `defineConfig` e i tipi; i pezzi del motore stanno nei sottopercorsi, così la radice resta la sola cosa che serve conoscere per configurarsi.

| Sottopercorso | Cosa esporta |
|---|---|
| `@elia97/officina/smoke` | `DEFAULT_CHECKS`, i cinque controlli, `SECURITY_HEADERS`, `NON_HTML_ROUTES` |
| `@elia97/officina/bundle` | `CSS_BUDGET_GZIP` |
| `@elia97/officina/icons` | `ICON_SPECS` |

`siteUrl` serve a `check smoke` e `icons.background` a `gen icons`. I budget del progetto vengono prima del default di 20 KB, nell'ordine in cui sono scritti; `smoke.checks` sostituisce la lista del pacchetto, quindi chi ne toglie un controllo la ricompone da `DEFAULT_CHECKS`; `smoke.securityHeaders` e `smoke.nonHtmlRoutes` sostituiscono `SECURITY_HEADERS` e `NON_HTML_ROUTES`.

`features` dice quali controlli il progetto pretende: `'required'` fa fallire il gate quando ciò che deve guardare non c'è, `false` lo spegne dicendolo. Per BotID è `features.botId`: con `false` lo smoke salta la challenge e lo scrive nell'uscita, anche dentro una lista di `smoke.checks` che la contiene. Una voce non dichiarata vale `'required'`, e `doctor` la segnala: un gate che esce 0 su un container GTM che non esiste non afferma niente. `routes.representatives` dà a ogni pattern dinamico di `src/pages` un percorso vero, e da lì smoke e Lighthouse guardano anche quelle pagine.

`features.generators` ha un valore in più delle altre, perché non tutti i siti in produzione nascono dallo scaffold: `'required'` è il comportamento di sempre; `false` spegne i generatori del pacchetto, e `doctor` smette di chiedere i punti di aggancio e gli ancoraggi invece di pretendere file che nessun codice di quel sito userebbe; `'project'` fa lo stesso ma lascia vivi i generatori che il progetto scrive in `officina.generators.mjs`, che a quel punto `doctor` pretende. Con `false` o `'project'`, `officina gen section|page|component|collection` si ferma dicendolo, mentre gli script `gen` e `gen:*` restano attesi in `package.json`: meglio un comando che spiega di uno script che manca. `gen icons` non c'entra con i generatori di codice e non cambia.

`placeholders` dice a `check placeholders` cosa guardare: `sources` sono i file da scandire, `contactEnvKeys` le variabili che `--env` pretende. Una lista dichiarata **sostituisce** quella del pacchetto, dizionari compresi: senza dichiarazione i sorgenti sono `src/lib/site.ts`, `src/lib/company.ts` e i dizionari di `src/i18n/strings`, quando la cartella esiste. Serve ai progetti che non nascono dallo scaffold: se partita IVA, recapiti e destinatario dei form stanno nel contenuto invece che in un modulo, i sorgenti del template non sono i suoi, e crearli per far passare il gate terrebbe gli stessi dati in due sedi. Un sorgente elencato che non esiste è un ritrovamento con il suo percorso, non un errore che ferma il comando.

Nel deploy `check placeholders` gira due volte sui file di Vercel. Con `--env .vercel/.env.production.local`, dopo `vercel pull`, distingue una chiave che su Vercel non esiste, una vuota e una che porta un segnaposto del template, tutte e tre errori, da una variabile **Sensitive**: `vercel pull` non ne scarica il valore e scrive al suo posto `[SENSITIVE]`, quindi il check lo dice con un avviso, che non ferma il deploy, invece di darla per verificata. Il segnaposto però diventa un problema se la build legge la variabile, per esempio una variabile di `astro:env` con `access: 'public'`, che Astro incorpora nel codice: con `--output .vercel/output`, dopo `vercel build`, il check cerca `[SENSITIVE]` nei file della build e ferma il deploy nominandoli. Una variabile che la build legge va tenuta Encrypted su Vercel, o letta a runtime.

Il file lo carica Node, che fuori da `node_modules` toglie i tipi da sé: niente `enum`, niente alias `@/`. Due file `officina.config.*` insieme sono un errore, come un file senza default export; il resto lo valida `loadConfig` a runtime, nominando il percorso della voce sbagliata — `bundle.cssMaxGzip: atteso un numero, ricevuto una stringa` — e una voce sconosciuta, perché `sitUrl` al posto di `siteUrl` non deve passare in silenzio.

`sharp` è una dipendenza facoltativa del progetto, non del pacchetto: serve solo a `gen icons`, che senza lo dice ed esce 1. Un ingresso che manca — il favicon, `.lighthouserc.json`, `src/pages`, la build in `dist/client` — è sempre una riga che nomina il file e dice a cosa serve, mai uno stack trace. `@biomejs/biome` invece è una peer dependency con l'intervallo che il preset regge, e `doctor` confronta la versione del progetto con quello.

## Preset di configurazione

Le regole che valgono per tutti i progetti stanno nel pacchetto; il progetto estende e tiene solo le proprie eccezioni.

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.10/schema.json",
  "extends": ["@elia97/officina/biome"]
}
```

```yaml
# lefthook.yml
extends:
  - node_modules/@elia97/officina/presets/lefthook.yml
```

## Action per i workflow

I passi dei workflow stanno in `actions/` di questo repository, come composite action: girano dentro il job di chi le chiama, quindi il nome del check e l'`environment` restano del progetto. Il riferimento va fissato a un tag di versione o a uno SHA, mai a `@main`, e deve essere la stessa versione del pacchetto installato — `doctor` lo verifica.

| Action | Passi | Cosa resta nel workflow del progetto |
|---|---|---|
| `actions/ci` | checkout, node, install, `astro sync`, `pnpm run ci`, build, `perf:bundle`; con `e2e: 'true'` anche Playwright | trigger, permessi, il job `ci` |
| `actions/review` | `astro sync`, poi `fallow review` sul diff contro il merge-base | il job informativo |
| `actions/deploy` | risoluzione del tag, gate, `vercel pull`, `build`, controllo della build, `deploy`, smoke; espone `url` | trigger, `environment`, i tre segreti Vercel passati in `with:`, il job che controlla se i segreti ci sono |
| `actions/lighthouse` | build equivalente alla produzione e `pnpm run lhci` | trigger, etichetta, `continue-on-error` |

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: production
      url: ${{ steps.deploy.outputs.url }}
    steps:
      - uses: Elia97/officina/actions/deploy@v0.4.0
        id: deploy
        with:
          ref: ${{ inputs.ref }}
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

`astro sync` genera i tipi di `.astro/`, che fallow pretende e un checkout pulito non ha; se fallisce il passo lo segnala con un avviso e il job prosegue.

I tre segreti sono input obbligatori e l'action li mette nell'`env` dei soli tre passi che chiamano `vercel`. Nell'`env` del job li vedrebbero anche `pnpm install` e gli script di installazione di ogni dipendenza, che girano codice di terzi con in mano un token di deploy.

Quello che si scarica al volo è fissato a una versione esatta, in un posto solo: la CLI di Vercel in `actions/deploy/action.yml`, `@lhci/cli` in `src/checks/lighthouse.ts`, `serve` in `src/sh/lhci-local.sh`. Che i primi due siano esatti, uguali ovunque e non indietro di una major su npm lo guarda ogni lunedì `.github/workflows/vercel-cli.yml`, con `officina check vercel-cli`.

Perché le action non restino ferme per sempre, Dependabot di questo repository copre l'ecosistema `github-actions` anche dentro `/actions/*`, dove le action di terze parti sono fissate allo SHA intero con la versione nel commento.

## doctor

`officina doctor` dice, in qualunque repository, cosa manca perché il progetto prenda tutto da fuori: i punti di aggancio dei generatori, gli ancoraggi delle pagine a sezioni e dei dizionari, gli script, le dipendenze e gli strumenti di `package.json`, i residui di ciò che è uscito (copia del metodo, script, documenti commerciali), i preset, i workflow di GitHub e Dependabot, `officina.config.ts`. Sta dentro `ci`, quindi un progetto allineato non torna indietro senza che il gate lo dica.

Di `.github/dependabot.yml` guarda la **forma**, non la presenza delle chiavi: lo legge come YAML e pretende che le chiavi del gruppo stiano sul gruppo — Dependabot rifiuta l'intero file se `commit-message` o `open-pull-requests-limit` stanno su una voce che dichiara `multi-ecosystem-group` — e che ogni ecosistema del gruppo abbia una seconda voce per il resto. Senza quella, `patterns` restringe l'intera voce e tutto il resto smette di aggiornarsi senza che niente diventi rosso.

Le prime due sezioni rispondono a due domande diverse. I punti di aggancio sono l'elenco di `src/lib/contract.ts`, e chiedono che una cosa esista: i moduli che il codice generato importa, le cartelle in cui i generatori scrivono, `class-variance-authority` fra le dipendenze, lo script `check` che il post-gen lancia. Gli ancoraggi guardano dentro quei file, e chiedono che abbiano ancora la forma su cui l'iniezione conta:

- per ogni collection a sezioni registrata in `src/content.config.ts` — riconosciuta dall'import di `<nome>CollectionSchema` da `@/lib/schemas/<nome>`, non dai marcatori, che sono proprio ciò che può sparire — la funzione `<nome>CollectionSchema`, la sua `z.discriminatedUnion` sopra un array letterale, il parametro non destrutturato che una sezione con immagine riceve, il `return { … }` di primo livello di `get<Nome>Sections`, e una sola pagina sotto `src/pages/` che porti `{/* @gen:<nome>-sections */}` e, su quella, `// @gen:<nome>-imports`;
- per ogni dizionario di `src/i18n/strings/`, il suo `export const <lingua> = { … } as const`.

Sono gli stessi controlli del pre-volo dei generatori, non una copia: `doctor` chiama `assertSectionAnchors` e `assertDictionaries`, che vivono in `src/gen/` insieme all'iniezione. Al pre-volo resta ciò che dipende dal nome di quello che sta per nascere — la sezione già nell'unione, l'identificatore già preso nel barrel o nel frontmatter, la chiave già nel dizionario, il file che esiste già — e che quindi si può chiedere solo al lancio del generatore.

Le altre sezioni misurano che il progetto e il pacchetto si muovano insieme:

- **stessa versione**: il riferimento delle action nei workflow — `@v<x.y.z>`, oppure uno SHA con `# v<x.y.z>` nel commento — deve essere la versione del pacchetto installato. Un progetto col pacchetto alla 0.8 e le action alla 0.6 non è un progetto allineato;
- **una PR sola**: il `.github/dependabot.yml` del progetto deve avere un gruppo `multi-ecosystem-groups` che prende `@elia97/officina` da npm e `Elia97/officina/*` da `github-actions`. Senza, Dependabot ne apre due e il controllo qui sopra le boccia entrambe;
- **gli strumenti che preset e action danno per scontati**: `@biomejs/biome`, `lefthook`, `@commitlint/cli`, `@commitlint/config-conventional` e `fallow` fra le `devDependencies`, con la versione di Biome dentro l'intervallo che il preset dichiara di reggere.

`package.json`, `.claude/settings.json`, `biome.json` e `.mcp.json` si leggono come JSON, non cercandoci dentro delle stringhe: `"hooks"` in un valore qualunque non è un blocco `hooks`. I workflow restano una ricerca testuale — non c'è un parser YAML nel pacchetto — ma una riga commentata non soddisfa nessun controllo.

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

I preset di `ecommerce` e `monorepo`.
