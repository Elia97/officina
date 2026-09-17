export interface LighthouseRc {
  ci: {
    collect: {
      url?: string[]
      numberOfRuns?: number
      startServerCommand?: string
      startServerReadyPattern?: string
      startServerReadyTimeout?: number
      settings?: Record<string, unknown>
    }
    upload?: Record<string, unknown>
    [section: string]: unknown
  }
}

export type LighthouseEnv = Partial<
  Record<'LH_PORT' | 'LH_RUNS' | 'LH_EXTERNAL_SERVER' | 'LH_CHROME_FLAGS' | 'LH_OUT', string>
>

const DEFAULT_PORT = '4321'

/** Le rotte arrivano da src/pages, il resto dal `.lighthouserc.json` del progetto; l'ambiente lo piega al giro locale. */
export function lighthouseConfig(rc: LighthouseRc, routes: readonly string[], env: LighthouseEnv): LighthouseRc {
  const port = env.LH_PORT ?? DEFAULT_PORT
  const collect = { ...rc.ci.collect, url: routes.map((route) => `http://localhost:${port}${route}`) }

  if (env.LH_RUNS) collect.numberOfRuns = Number(env.LH_RUNS)

  // Il server è già in ascolto: lo avvia lhci-local.sh, per servire una directory diversa.
  if (env.LH_EXTERNAL_SERVER) {
    delete collect.startServerCommand
    delete collect.startServerReadyPattern
    delete collect.startServerReadyTimeout
  } else if (collect.startServerCommand !== undefined) {
    collect.startServerCommand = collect.startServerCommand.replace(/--listen \d+/, `--listen ${port}`)
  }

  if (env.LH_CHROME_FLAGS) collect.settings = { ...collect.settings, chromeFlags: env.LH_CHROME_FLAGS }

  const ci = { ...rc.ci, collect }
  if (env.LH_OUT) ci.upload = { target: 'filesystem', outputDir: env.LH_OUT }
  return { ci }
}
