// \b è ASCII anche con il flag u: "\bpiù\b" e "\bgià\b" non matchano mai. I confini di parola
// vanno scritti a mano con \p{L}.
const phrase = (alternatives: string[]) =>
  new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}])`, 'iu')

export const PAST_TENSE = [
  phrase([
    "prima (?:era|c'era|veniva|faceva|andava|lo|si)",
    'in precedenza',
    'una volta era',
    'era stato',
    'in passato',
    'storicamente',
  ]),
  // "non più di 3" è una quantità, non un cambiamento.
  phrase(['non (?:è |viene |serve )?più(?! di)']),
  phrase(["ora (?:è|invece|lo|la|il|si|c'è|non)", 'adesso', 'per ora', 'temporaneamente']),
  phrase(['sostituisce', 'al posto di', 'vecchi[oa]']),
  phrase(['used to', 'previously', 'no longer', 'replaces the', 'replaced by', 'removed in', 'for now', 'temporarily']),
  /#\d{1,3}(?!\d)/,
]
