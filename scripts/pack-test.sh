#!/usr/bin/env bash
# Quello che i test sui sorgenti non possono vedere: che il tarball porti i file che il README
# promette, e che installato in un progetto vuoto si risolva da ogni percorso pubblicato.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

fail() {
  echo "✗ $1" >&2
  exit 1
}

cd "${ROOT}"
echo "→ pnpm pack (prepack rifà dist/)"
TARBALL="$(pnpm pack --pack-destination "${WORK}" | tail -n 1)"
[ -f "${TARBALL}" ] || fail "pnpm pack non ha detto dove ha scritto il tarball: ${TARBALL}"
echo "✓ $(basename "${TARBALL}")"

echo "→ i file che il pacchetto promette sono dentro il tarball"
ENTRIES="$(tar -tzf "${TARBALL}")"
for entry in \
  package/dist/bin.js \
  package/dist/index.js \
  package/dist/smoke.js \
  package/dist/bundle.js \
  package/dist/icons.js \
  package/dist/sh/lhci-local.sh \
  package/presets/lefthook.yml \
  package/presets/biome.base.json; do
  grep -qx "${entry}" <<< "${ENTRIES}" || fail "manca dal tarball: ${entry#package/}"
done
grep -q '^package/dist/gen/templates/' <<< "${ENTRIES}" || fail "manca dal tarball: dist/gen/templates/"
echo "✓ dist, preset, template dei generatori e lo script di Lighthouse"

echo "→ engines rifiuta un Node in cui import.meta.main non esiste"
tar -xzf "${TARBALL}" -C "${WORK}" package/package.json
node -e '
const { engines } = require(`${process.argv[1]}/package/package.json`)
const min = /^>=(\d+)\.(\d+)\.(\d+)$/.exec(engines.node)
if (!min) { console.error(`engines.node non è un minimo leggibile: ${engines.node}`); process.exit(1) }
const floor = min.slice(1).map(Number)
const older = (v) => v.split(".").map(Number).some((n, i) => n !== floor[i] && n < floor[i])
// import.meta.main non esiste in 24.0 né in 24.1, e ogni comando del pacchetto lo usa.
for (const version of ["24.1.0", "24.0.0", "22.20.0"]) {
  if (!older(version)) { console.error(`engines.node ${engines.node} accetterebbe ${version}`); process.exit(1) }
}
' "${WORK}"
echo "✓ engines: $(node -p "require('${WORK}/package/package.json').engines.node")"

PROJECT="${WORK}/progetto"
mkdir -p "${PROJECT}"
cd "${PROJECT}"
# Il preset di Biome legge il .gitignore del repository, quindi il progetto di prova è un repository.
git init -q .
printf 'node_modules\n' > .gitignore
printf '{\n  "name": "prova-del-tarball",\n  "private": true,\n  "type": "module"\n}\n' > package.json

BIOME="$(node -p "require('${ROOT}/package.json').devDependencies['@biomejs/biome']")"
echo "→ npm install del tarball e di Biome ${BIOME} in un progetto vuoto"
npm install --silent --no-audit --no-fund "${TARBALL}" "@biomejs/biome@${BIOME}"

echo "→ il binario officina risponde"
set +e
./node_modules/.bin/officina > /dev/null 2>&1
CODE=$?
set -e
# Senza argomenti stampa l'uso ed esce 2: qualunque altro codice vuol dire che non è partito.
[ "${CODE}" -eq 2 ] || fail "il binario officina è uscito ${CODE} invece di 2"

echo "→ officina.config.ts si carica dalla radice e dai sottopercorsi"
cat > officina.config.ts <<'TS'
import { defineConfig } from '@elia97/officina'
import { CSS_BUDGET_GZIP } from '@elia97/officina/bundle'
import { DEFAULT_CHECKS, NON_HTML_ROUTES, SECURITY_HEADERS } from '@elia97/officina/smoke'

export default defineConfig({
  siteUrl: 'https://prova.test',
  icons: { background: '#ffffff' },
  bundle: { cssMaxGzip: CSS_BUDGET_GZIP },
  smoke: { checks: [...DEFAULT_CHECKS], securityHeaders: SECURITY_HEADERS, nonHtmlRoutes: NON_HTML_ROUTES },
  features: { analytics: false, roadmap: false },
})
TS
cat > prova.mjs <<'MJS'
import { ICON_SPECS } from '@elia97/officina/icons'

const { default: config } = await import('./officina.config.ts')
if (config.siteUrl !== 'https://prova.test') throw new Error('la configurazione non si è caricata')
if (config.smoke.checks.length === 0) throw new Error('@elia97/officina/smoke non espone i controlli')
if (ICON_SPECS.length === 0) throw new Error('@elia97/officina/icons non espone le specifiche')
MJS
node prova.mjs || fail 'officina.config.ts non si carica dal pacchetto installato'

echo "→ @elia97/officina/biome si risolve con Biome installato"
printf '{\n  "extends": ["@elia97/officina/biome"]\n}\n' > biome.json
printf 'export const a = 1\n' > prova-biome.ts
./node_modules/.bin/biome check prova-biome.ts > /dev/null || fail 'Biome non ha risolto il preset del pacchetto'

echo
echo "✓ il pacchetto impacchettato regge: binario, sottopercorsi, preset, template ed engines."
