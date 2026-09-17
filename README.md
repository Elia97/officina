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
    "check:vercel-cli": "officina check vercel-cli",
    "gen": "officina gen",
    "gen:section": "officina gen section",
    "gen:page": "officina gen page",
    "gen:component": "officina gen component",
    "gen:collection": "officina gen collection",
    "doctor": "officina doctor"
  }
}
```

I gate leggono dalla cartella corrente, che deve essere la radice del repository. Opzioni comuni: `--diff`, `--base <ref>`, `--head <ref>`, `--strict`, `--format text|github`.

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

I generatori scrivono codice che deve incastrarsi nello scaffold, quindi il progetto deve avere i punti di aggancio che si aspettano: i moduli che il codice generato importa e i file in cui iniettano. L'elenco è `src/lib/contract.ts`, e `officina doctor` dice, in qualunque repository, cosa manca. Finché manca qualcosa il pre-volo del generatore si ferma prima di scrivere un solo file.

Un progetto aggiunge i propri generatori con un file `officina.generators.mjs` nella radice, con la firma di un plopfile: `export default function (plop)`.

I test dei generatori girano sui punti di aggancio del progetto di prova, copiati da `vetrina`. Che un progetto vero li abbia ancora lo verifica `doctor`, non i test.

## Cosa arriverà

Bundle budget, smoke di produzione, lighthouse, verifica analytics e icone. Poi i preset di `ecommerce` e `monorepo`.
