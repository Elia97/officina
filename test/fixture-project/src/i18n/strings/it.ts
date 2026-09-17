export const it = {
  'a11y.skipToContent': 'Salta al contenuto',
  'a11y.primaryNav': 'Navigazione principale',
  'a11y.toggleTheme': 'Cambia tema',
  'a11y.openMenu': 'Apri menu',
  'a11y.closeMenu': 'Chiudi menu',
  'a11y.legalNav': 'Link legali',
  'a11y.languageNav': 'Lingua',
  'a11y.breadcrumb': 'Percorso di navigazione',

  'nav.home': 'Home',
  'nav.contact': 'Contatti',
  'nav.cta': 'Contattaci',

  'legal.privacy': 'Privacy',
  'legal.cookies': 'Cookie Policy',
  'legal.terms': 'Termini e Condizioni',
  'legal.cookiePreferences': 'Preferenze cookie',
  'legal.privacyDescription':
    'Informativa sul trattamento dei dati personali ai sensi del Regolamento UE 2016/679 (GDPR).',
  'legal.cookiesDescription': 'Informativa sull’uso di cookie e tecnologie di memorizzazione locale su questo sito.',
  'legal.termsDescription': 'Termini e condizioni di utilizzo di questo sito.',
  'legal.termsDraftNotice':
    'Questo documento è una bozza segnaposto: va adattato al progetto e sottoposto a revisione legale prima della pubblicazione definitiva del sito.',
  'legal.privacyPolicyTitle': 'Privacy Policy',
  'legal.cookiePolicyTitle': 'Cookie Policy',
  'legal.unavailable': 'Il documento non è al momento disponibile.',
  'legal.hostedVersion': 'Puoi consultare la versione ufficiale, sempre aggiornata, alla pagina seguente.',
  'legal.openOnIubenda': 'Apri il documento su iubenda',

  'error.404title': 'Pagina non trovata',
  'error.404description': 'La pagina che cerchi non esiste o è stata spostata.',
  'error.500title': 'Errore del server',
  'error.500description': 'Si è verificato un problema imprevisto. Riprova tra poco.',
  'error.backHome': 'Torna alla home',

  'contact.pageTitle': 'Contatti',
  'contact.pageDescription': 'Raccontaci il tuo progetto: ti rispondiamo al più presto.',
  'contact.detailsTitle': 'Recapiti',
  'contact.phone': 'Telefono',
  'contact.address': 'Sede',
  'contact.formTitle': 'Richiesta informazioni',
  'contact.formIntro': 'Compila il form e ti ricontatteremo al più presto.',
  'contact.firstName': 'Nome',
  'contact.lastName': 'Cognome',
  'contact.email': 'Email',
  'contact.message': 'Messaggio',
  'contact.consent': 'Acconsento al trattamento dei miei dati personali secondo la',
  'contact.privacyPolicy': 'Privacy Policy',
  'contact.submit': 'Invia richiesta',
  'contact.sending': 'Invio…',
  'contact.noscript':
    'Per inviare il modulo serve JavaScript: puoi scriverci o chiamarci ai recapiti di questa pagina.',
  'contact.success': 'Richiesta inviata. Ti ricontatteremo a breve.',
  'contact.error': 'Invio non riuscito. Riprova tra poco.',
  'contact.genericFieldError': 'Controlla i dati inseriti.',

  // Mostrato all'utente alla lettera da src/components/forms/field-errors.ts.
  'forms.error.firstNameRequired': 'Inserisci il tuo nome.',
  'forms.error.firstNameTooLong': 'Il nome è troppo lungo (massimo 100 caratteri).',
  'forms.error.lastNameRequired': 'Inserisci il tuo cognome.',
  'forms.error.lastNameTooLong': 'Il cognome è troppo lungo (massimo 100 caratteri).',
  'forms.error.emailInvalid': 'Inserisci un indirizzo email valido.',
  'forms.error.emailTooLong': 'L’indirizzo email è troppo lungo (massimo 254 caratteri).',
  'forms.error.messageTooLong': 'Il messaggio è troppo lungo (massimo 2000 caratteri).',
  'forms.error.consentRequired': 'Devi acconsentire al trattamento dei dati per inviare la richiesta.',

  'forms.action.tooManyRequests': 'Troppe richieste, riprova tra poco.',
  'forms.action.securityCheckFailed': 'Verifica di sicurezza non superata, riprova.',
  'forms.action.sendFailed': 'Invio non riuscito, riprova.',

  'email.lang': 'it',
  'email.notificationHeading': 'Nuova richiesta dal sito',
  'email.notificationSubject': 'Nuova richiesta',
  'email.nameLabel': 'Nome',
  'email.emailLabel': 'Email',
  'email.messageLabel': 'Messaggio',
  'email.autoreplyHeading': 'Grazie, ti abbiamo letto.',
  'email.autoreplySubject': 'Abbiamo ricevuto la tua richiesta',
  'email.autoreplyBody':
    'Abbiamo ricevuto la tua richiesta e ti ricontatteremo al più presto. Per qualsiasi urgenza puoi scriverci a {email}.',

  'seo.defaultOgImageAlt': '<OG_IMAGE_ALT>',

  'footer.legalHeading': 'Legale',
  'footer.allRightsReserved': 'Tutti i diritti riservati.',
  'footer.vatNumber': 'P.IVA',
} as const

export type UIKey = keyof typeof it
