import type { SchemaContext } from 'astro:content'
import { z } from 'astro/zod'

import { heroSectionSchema } from './hero'

// INJECTION POINT per `pnpm gen:section` (ts-morph): il generatore verifica questa funzione
// e la sua chiamata a z.discriminatedUnion.
export function homepageCollectionSchema(context: SchemaContext) {
  return z.discriminatedUnion('section', [heroSectionSchema(context)])
}
