import { loadLocalizedSections, type SectionedPage } from '@/lib/content/localized-sections'

export type HomepageSections = SectionedPage<'homepage'>

export async function getHomepageSections(locale?: string): Promise<HomepageSections> {
  const { pick } = await loadLocalizedSections('homepage', locale)

  // INJECTION POINT per `pnpm gen:section` (ts-morph): le sezioni nuove aggiungono qui il
  // loro pick() — il generatore verifica questo letterale di ritorno.
  return {
    hero: pick('hero'),
  }
}
