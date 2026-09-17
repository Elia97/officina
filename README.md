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
| `check bundle` | il JavaScript e il CSS di `dist/client`, gzip, contro un budget per rotta | `src/pages` |
| `check smoke [url]` | la produzione viva: pagine, header di sicurezza, BotID, host canonico, barra finale | `src/pages`, più le rotte non HTML |
| `check analytics [GTM-…]` | il container GTM pubblico contro gli eventi del modulo di link-tracking del progetto (`analytics.linkTracking`) | — |
| `check lighthouse [--local]` | Lighthouse CI sul `.lighthouserc.json` del progetto; `--local` fa build, server e Chrome da sé | `src/pages` |
| `gen icons` | le icone del manifest, disegnate dal favicon SVG in `public/` del progetto | — |

Il motore è uguale per tutti; ciò che cambia da un progetto all'altro sta in un file solo, `officina.config.ts` nella radice:

```ts
import { type Budget, DEFAULT_CHECKS, defineConfig, type SmokeCheck } from '@elia97/officina'

import { SITE } from './src/lib/site.ts'

const motion: Budget = { label: 'motion', matches: (route) => route === '/', maxGzip: 72 * 1024 }
const checkLanguageRedirect: SmokeCheck = async ({ get, baseUrl }) => []

export default defineConfig({
  siteUrl: SITE.url,
  icons: { background: SITE.themeColor.light },
  bundle: { budgets: [motion], cssMaxGzip: 14 * 1024 },
  smoke: { checks: [...DEFAULT_CHECKS, checkLanguageRedirect] },
})
```

Ogni voce è facoltativa, tranne `siteUrl` per `check smoke` e `icons.background` per `gen icons`. I budget del progetto vengono prima del default di 20 KB, nell'ordine in cui sono scritti; `smoke.checks` sostituisce la lista del pacchetto, quindi chi non ha BotID la ricompone senza `checkBotIdChallenge`; `smoke.securityHeaders` e `smoke.nonHtmlRoutes` sostituiscono `SECURITY_HEADERS` e `NON_HTML_ROUTES`. Il file lo carica Node, che fuori da `node_modules` toglie i tipi da sé: niente `enum`, niente alias `@/`.

`sharp` è una dipendenza facoltativa del progetto, non del pacchetto: serve solo a `gen icons`, che senza lo dice ed esce 1. `ICON_SPECS` si importa senza caricarlo, per il test che confronta le icone con il manifest del sito.

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

I passi dei workflow stanno in `actions/` di questo repository, come composite action: girano dentro il job di chi le chiama, quindi il nome del check, l'`environment` e i segreti restano del progetto. Il riferimento va fissato a un tag di versione o a uno SHA, mai a `@main`.

| Action | Passi | Cosa resta nel workflow del progetto |
|---|---|---|
| `actions/ci` | checkout, node, install, `pnpm run ci`, build, `perf:bundle`; con `e2e: 'true'` anche Playwright | trigger, permessi, il job `ci` |
| `actions/review` | `fallow review` sul diff contro il merge-base | il job informativo |
| `actions/deploy` | risoluzione del tag, gate, `vercel pull`, `build`, `deploy`, smoke; espone `url` | trigger, `environment`, i tre segreti Vercel nell'`env` del job, il job che controlla se i segreti ci sono |
| `actions/lighthouse` | build equivalente alla produzione e `pnpm run lhci` | trigger, etichetta, `continue-on-error` |

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: production
      url: ${{ steps.deploy.outputs.url }}
    env:
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
    steps:
      - uses: Elia97/officina/actions/deploy@v0.4.0
        id: deploy
        with:
          ref: ${{ inputs.ref }}
```

Il pin `vercel@<major>` sta in un posto solo, `actions/deploy/action.yml`: lo guarda ogni lunedì `.github/workflows/vercel-cli.yml` di questo repository, con `officina check vercel-cli actions/deploy/action.yml`.

## doctor

`officina doctor` dice, in qualunque repository, cosa manca perché il progetto prenda tutto da fuori: i punti di aggancio dei generatori, gli script e le dipendenze di `package.json`, i residui di ciò che è uscito (copia del metodo, script, documenti commerciali), i preset, i workflow con il riferimento fissato, `officina.config.ts`. Sta dentro `ci`, quindi un progetto allineato non torna indietro senza che il gate lo dica.

## Sviluppo

```sh
pnpm install
pnpm test        # vitest; i test che leggono dal disco girano in test/fixture-project/
pnpm typecheck
pnpm build       # tsc → dist/, l'unica cosa che viene pubblicata
```

I sorgenti sono TypeScript, ma il pacchetto pubblica JavaScript: Node toglie i tipi al volo solo fuori da `node_modules`. I test con `--diff` hanno bisogno di almeno un commit su `main`.

## Pubblicare

```sh
pnpm version <patch|minor|major>
pnpm publish     # prepublishOnly lancia typecheck, test e build
```

## Generatori

`officina gen` avvolge plop con i generatori e i template del pacchetto, e scrive nel progetto da cui lo lanci: `section`, `page`, `component`, `collection`. `plop` e `ts-morph` sono dipendenze del pacchetto, non del progetto.

I generatori scrivono codice che deve incastrarsi nello scaffold, quindi il progetto deve avere i punti di aggancio che si aspettano: i moduli che il codice generato importa e i file in cui iniettano. L'elenco è `src/lib/contract.ts`, ed è la prima sezione di `officina doctor`. Finché manca qualcosa il pre-volo del generatore si ferma prima di scrivere un solo file.

Un progetto aggiunge i propri generatori con un file `officina.generators.mjs` nella radice, con la firma di un plopfile: `export default function (plop)`.

I test dei generatori girano sui punti di aggancio del progetto di prova, copiati da `vetrina`. Che un progetto vero li abbia ancora lo verifica `doctor`, non i test.

## Cosa arriverà

I preset di `ecommerce` e `monorepo`.
