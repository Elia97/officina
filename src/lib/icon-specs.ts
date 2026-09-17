export interface IconSpec {
  file: string
  size: number
  purpose: 'any' | 'maskable'
}

// Senza sharp: il manifest del sito le confronta con le proprie icone senza caricare il disegnatore.
export const ICON_SPECS: readonly IconSpec[] = [
  { file: 'icon-192.png', size: 192, purpose: 'any' },
  { file: 'icon-512.png', size: 512, purpose: 'any' },
  { file: 'icon-maskable-512.png', size: 512, purpose: 'maskable' },
]
