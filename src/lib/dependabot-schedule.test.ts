import { describe, expect, it } from 'vitest'

import { scheduleGaps } from './dependabot-schedule.ts'

const update = (interval: string, group?: string) => ({
  'package-ecosystem': 'npm',
  schedule: { interval },
  ...(group === undefined ? {} : { 'multi-ecosystem-group': group }),
})

describe('scheduleGaps', () => {
  it('lascia stare il gruppo di officina, anche settimanale, e il resto mensile', () => {
    expect(scheduleGaps([update('weekly', 'officina'), update('monthly')])).toEqual([])
  })

  it.each(['weekly', 'daily'])('una voce fuori dal gruppo con %s è un avviso che chiede monthly', (interval) => {
    expect(scheduleGaps([update(interval)])).toEqual([
      {
        path: '.github/dependabot.yml',
        severity: 'warning',
        message: `la voce \`npm\` fuori dal gruppo si aggiorna \`${interval}\`: con \`monthly\` le PR, e le corse della CI, si riducono a una al mese`,
      },
    ])
  })

  it('una voce senza schedule la lascia a Dependabot, che la rifiuta da sé', () => {
    expect(scheduleGaps([{ 'package-ecosystem': 'npm' }])).toEqual([])
  })
})
