#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import process from 'node:process'

import { readServerFiles } from '../lib/bundle-ssr.ts'
import { missingInput } from '../lib/cli.ts'
import { isRequired, loadConfig } from '../lib/config.ts'
import { brokenLines, htmlLinks, type LinkReport, linkReport, servedPaths, siteOrigin } from '../lib/links.ts'
import { expectedRoutes, filesWithExtension, pageRouteOf, readPageFiles, routeOf, routePattern } from '../lib/routes.ts'
import { onDemandPatterns } from '../lib/vercel-build.ts'

const DIST = 'dist/client'
const PAGES = 'src/pages'
const SERVER_OUTPUT = 'dist/server'
const FROM_SOURCE = 'valgono le pagine `.astro` con `prerender = false`'

const servedPath = (file: string): string => `/${relative(DIST, file).split(sep).join('/')}`

function onDemand(): { patterns: RegExp[]; note?: string } {
  const files = readServerFiles()
  const fromBuild = files.length === 0 ? null : onDemandPatterns(files)
  if (fromBuild !== null) return { patterns: fromBuild }
  const ssr = existsSync(PAGES) ? expectedRoutes(readPageFiles(PAGES), PAGES).ssr : []
  const patterns = ssr.map((file) => routePattern(pageRouteOf(file, PAGES)))
  if (files.length > 0) return { patterns, note: `il manifest della build Vercel non si riconosce: ${FROM_SOURCE}` }
  if (existsSync(SERVER_OUTPUT)) return { patterns, note: `build SSR senza l'adapter Vercel: ${FROM_SOURCE}` }
  return { patterns }
}

function printReport(report: LinkReport, pages: number, note: string | undefined): void {
  console.log(`\ncheck:links — ${report.internal} link interni su ${pages} pagine di ${DIST}\n`)
  const { external, scheme, anchor } = report.outside
  console.log(
    `Restano fuori: ${external} link esterni, ${scheme} con un altro schema (mailto:, tel:, …), ${anchor} ancore, di cui l'id non si verifica.`,
  )
  if (report.onDemand > 0) {
    console.log(
      `${report.onDemand} link portano a una rotta resa a richiesta: che la pagina esista lo sa solo il server.`,
    )
  }
  if (note !== undefined) console.log(`\nNOTA  ${note}`)
}

export async function main(): Promise<number> {
  const config = await loadConfig(process.cwd())
  if (!isRequired(config, 'links')) {
    console.log('\ncheck:links — spento da `features.links: false`\n')
    return 0
  }
  if (missingInput(DIST, 'è la build di cui si controllano i link: prima `pnpm build`')) return 1

  const files = filesWithExtension(DIST, '').map(servedPath)
  const html = files.filter((file) => file.endsWith('.html'))
  if (html.length === 0) {
    console.error(`\n✗ ${DIST} non contiene nessun .html: senza pagine il controllo dei link non afferma niente.\n`)
    return 1
  }

  const pages = html.map((file) => ({
    route: routeOf(file, ''),
    hrefs: htmlLinks(readFileSync(join(DIST, file), 'utf8')),
  }))
  const { patterns, note } = onDemand()
  const report = linkReport(pages, siteOrigin(config.siteUrl), servedPaths(files), patterns)
  printReport(report, pages.length, note)

  if (report.broken.length > 0) {
    const lines = brokenLines(report).map((line) => `  - ${line}`)
    console.error(`\n✗ Link interni rotti:\n${lines.join('\n')}\n`)
    return 1
  }
  console.log('\n✓ Ogni link interno porta a qualcosa che la build serve.\n')
  return 0
}

if (import.meta.main) process.exit(await main())
