import type { ImageFunction } from 'astro:content'
import { z } from 'astro/zod'

const CTA_PROTOCOLS: readonly string[] = ['http:', 'https:', 'mailto:', 'tel:']

function isAllowedCtaUrl(value: string): boolean {
  if (value.startsWith('#')) return true
  if (value.startsWith('//')) return false
  if (value.startsWith('/')) return true
  return URL.canParse(value) && CTA_PROTOCOLS.includes(new URL(value).protocol)
}

export const ctaSchema = z.strictObject({
  label: z.string().min(1),
  url: z.string().min(1).refine(isAllowedCtaUrl),
})

export function imageSchema(image: ImageFunction) {
  return z.strictObject({ src: image(), alt: z.string() })
}
