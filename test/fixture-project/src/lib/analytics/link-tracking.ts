export function resolveLinkEvent(href: string): 'click_to_call' | 'click_to_email' | null {
  if (href.startsWith('tel:')) return 'click_to_call'
  if (href.startsWith('mailto:')) return 'click_to_email'
  return null
}
