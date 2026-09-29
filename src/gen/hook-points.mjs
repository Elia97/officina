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
