#!/usr/bin/env bash
set -euo pipefail

PORT="${LHCI_PORT:-4399}"
OUT_DIR='dist/lh-prod'
REPORT_DIR="${LHCI_REPORT_DIR:-.lighthouseci/local}"

export TMPDIR="${TMPDIR:-/tmp}"

detect_chrome() {
  local candidate
  for candidate in \
    "${CHROME_PATH:-}" \
    $(ls -d "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux/chrome 2>/dev/null | sort -V -r) \
    $(ls -d "$HOME"/.cache/puppeteer/chrome/*/chrome-linux*/chrome 2>/dev/null | sort -V -r) \
    /usr/bin/google-chrome /usr/bin/chromium /usr/bin/chromium-browser
  do
    [[ -n "${candidate}" && -x "${candidate}" && "${candidate}" != *.exe ]] || continue
    if "${candidate}" --version >/dev/null 2>&1; then
      echo "${candidate}"
      return 0
    fi
  done
  return 1
}

if ! CHROME_PATH="$(detect_chrome)"; then
  echo "✗ no usable Linux Chrome/Chromium found." >&2
  echo "  Install one with: pnpm dlx playwright@latest install chromium" >&2
  echo "  Or point at the binary: CHROME_PATH=/path/to/chrome pnpm run lhci:local" >&2
  exit 1
fi
export CHROME_PATH
echo "✓ chrome: ${CHROME_PATH} ($("${CHROME_PATH}" --version 2>/dev/null))"

SERVER_PID=''

cleanup() {
  if [[ -n "${SERVER_PID}" ]]; then
    kill -- "-${SERVER_PID}" 2>/dev/null || kill "${SERVER_PID}" 2>/dev/null || true
    pkill -f "serve@14 .*--listen ${PORT}" 2>/dev/null || true
  fi
  find . -maxdepth 1 \( -name '*wsl.localhost*' -o -name 'undefined*' \) -exec rm -rf {} + 2>/dev/null || true
}
trap cleanup EXIT

echo "→ production-equivalent build in ${OUT_DIR}"
VERCEL_ENV=production pnpm build --outDir "${OUT_DIR}"

if ! grep -qx 'Allow: /' "${OUT_DIR}/client/robots.txt"; then
  echo "✗ ${OUT_DIR}/client/robots.txt has no 'Allow: /' — the build is not production-equivalent." >&2
  head -3 "${OUT_DIR}/client/robots.txt" >&2
  exit 1
fi
echo "✓ robots.txt: Allow: /"

echo "→ starting the static server on :${PORT}"
setsid pnpm dlx serve@14 "${OUT_DIR}/client" --listen "${PORT}" --no-clipboard >/dev/null 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 60); do
  if curl -fs -o /dev/null "http://localhost:${PORT}/"; then break; fi
  sleep 1
done
if ! curl -fs -o /dev/null "http://localhost:${PORT}/"; then
  echo "✗ the server did not answer on :${PORT} within 60s." >&2
  echo "  Retry on another port: LHCI_PORT=4400 pnpm run lhci:local" >&2
  exit 1
fi
echo "✓ server ready"

rm -rf "${REPORT_DIR}"

LH_PORT="${PORT}" \
LH_RUNS="${LHCI_RUNS:-1}" \
LH_OUT="${REPORT_DIR}" \
LH_EXTERNAL_SERVER=1 \
LH_CHROME_FLAGS='--no-sandbox --disable-dev-shm-usage' \
  node "${OFFICINA_BIN}" check lighthouse

echo
echo "→ score per URL (median over ${LHCI_RUNS:-1} run(s), the way LHCI asserts)"
node -e '
const fs = require("fs")
const dir = process.argv[1]
const byUrl = new Map()
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".report.json"))) {
  const r = JSON.parse(fs.readFileSync(`${dir}/${f}`))
  const url = String(r.finalDisplayedUrl)
  if (!byUrl.has(url)) byUrl.set(url, [])
  byUrl.get(url).push(r.categories)
}
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
for (const [url, runs] of [...byUrl].sort()) {
  const pick = (k) => median(runs.map((c) => c[k].score)).toFixed(2)
  console.log(
    url.padEnd(46),
    "perf", pick("performance"),
    "a11y", pick("accessibility"),
    "bp", pick("best-practices"),
    "seo", pick("seo"),
  )
}' "${REPORT_DIR}"
