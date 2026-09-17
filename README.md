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
    "check:vercel-cli": "officina check vercel-cli"
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

## Cosa arriverà

I generatori (`officina gen …`) con i loro template, poi bundle budget, smoke di produzione, lighthouse, verifica analytics e icone.
