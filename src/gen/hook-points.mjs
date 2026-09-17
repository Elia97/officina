// Un ancoraggio rotto ha un percorso e un problema. Il pre-volo li impagina nel messaggio che
// ferma il generatore; `doctor`, che gli stessi controlli li lancia senza generare niente, li
// rimette in un ritrovamento.
export class HookPointError extends Error {
  constructor(message, path, problem) {
    super(message)
    this.path = path
    this.problem = problem
  }
}

export const failing = (prefix, guide) => (path, problem) => {
  throw new HookPointError(`${prefix} in ${path}: ${problem} (contract: ${guide})`, path, problem)
}
