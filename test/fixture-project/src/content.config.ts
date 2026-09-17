import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'

import { homepageCollectionSchema } from '@/lib/schemas/homepage'

const homepage = defineCollection({
  loader: glob({
    pattern: '**/*.{yaml,yml}',
    base: './src/content/homepage',
    // Il generateId di default di Astro slugifica i segmenti, onora una chiave `slug` di primo livello
    // e toglie /index — tutte e tre rompono src/lib/content/localized-sections.ts.
    generateId: ({ entry }) => entry.replace(/\.(yaml|yml)$/, ''),
  }),
  schema: homepageCollectionSchema,
})

export const collections = {
  // INJECTION POINT per `pnpm gen:collection` (ts-morph): il generatore verifica questo
  // letterale di oggetto.
  homepage,
}
