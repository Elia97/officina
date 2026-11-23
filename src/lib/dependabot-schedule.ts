import type { ContractGap } from './contract.ts'
import { gap, isRecord, type Update } from './dependabot-group.ts'

const FREQUENT = ['daily', 'weekly']

const intervalOf = ({ schedule }: Update): string | undefined =>
  isRecord(schedule) && typeof schedule.interval === 'string' ? schedule.interval : undefined

export const scheduleGaps = (updates: readonly Update[]): ContractGap[] =>
  updates.flatMap((update) => {
    const interval = intervalOf(update)
    if (update['multi-ecosystem-group'] !== undefined || interval === undefined || !FREQUENT.includes(interval)) {
      return []
    }
    const message = `la voce \`${update['package-ecosystem']}\` fuori dal gruppo si aggiorna \`${interval}\`: con \`monthly\` le PR, e le corse della CI, si riducono a una al mese`
    return [{ ...gap(message), severity: 'warning' as const }]
  })
