import type { AlertCategory } from './alerts.js';

/**
 * Texts of instance alerts in English and Italian. Alerts are stored as a key
 * plus parameters and rendered when they are delivered, in the language of
 * the server they are posted to (its "message language" setting).
 */

export type AlertLocale = 'en' | 'it';
export type AlertParams = Record<string, string | number | null | undefined>;

export const normalizeAlertLocale = (value: unknown): AlertLocale => (typeof value === 'string' && value.toLowerCase().startsWith('it') ? 'it' : 'en');

const num = (value: unknown, locale: AlertLocale) => Number(value ?? 0).toLocaleString(locale === 'it' ? 'it-IT' : 'en-US');
const text = (value: unknown, fallback = '—') => (value === null || value === undefined || value === '' ? fallback : String(value));

type Message = {
  title: Record<AlertLocale, string>;
  description?: Record<AlertLocale, (p: AlertParams) => string>;
};

const MESSAGES = {
  'install.rejected': {
    title: { en: 'Installation rejected', it: 'Installazione rifiutata' },
    description: {
      en: (p) => `Sentinel left **${text(p.guild)}**: ${p.reason === 'blocked-installer' ? 'the person who added the bot is blacklisted' : 'the server is blacklisted'}.`,
      it: (p) => `Sentinel è uscito da **${text(p.guild)}**: ${p.reason === 'blocked-installer' ? 'chi ha aggiunto il bot è in blacklist' : 'il server è in blacklist'}.`
    }
  },
  'guild.added': { title: { en: 'Sentinel added to a server', it: 'Sentinel aggiunto a un server' } },
  'guild.removed': { title: { en: 'Sentinel removed from a server', it: 'Sentinel rimosso da un server' } },
  'quota.reached': {
    title: { en: 'Daily quota reached', it: 'Quota giornaliera raggiunta' },
    description: {
      en: (p) => `**${text(p.guild)}** went over ${num(p.limit, 'en')} events today (plan ${text(p.plan)}): further events are not recorded until midnight UTC.`,
      it: (p) => `**${text(p.guild)}** ha superato ${num(p.limit, 'it')} eventi oggi (piano ${text(p.plan)}): gli eventi successivi non vengono registrati fino a mezzanotte UTC.`
    }
  },
  'bot.online': {
    title: { en: 'Sentinel online', it: 'Sentinel online' },
    description: { en: (p) => `Connected to Discord as **${text(p.user)}**.`, it: (p) => `Connesso a Discord come **${text(p.user)}**.` }
  },
  'guilds.purged': {
    title: { en: 'Data of removed servers deleted', it: 'Dati di server rimossi cancellati' },
    description: {
      en: (p) => `Deleted the data of ${num(p.count, 'en')} servers Sentinel was removed from more than ${num(p.days, 'en')} days ago.`,
      it: (p) => `Cancellati i dati di ${num(p.count, 'it')} server da cui Sentinel è stato rimosso da più di ${num(p.days, 'it')} giorni.`
    }
  },
  'client.warning': { title: { en: 'Discord client warning', it: 'Warning del client Discord' }, description: { en: (p) => text(p.detail), it: (p) => text(p.detail) } },
  'client.error': { title: { en: 'Discord client error', it: 'Errore del client Discord' }, description: { en: (p) => text(p.detail), it: (p) => text(p.detail) } },
  'bot.unhandled': { title: { en: 'Unhandled error in the bot', it: 'Errore non gestito nel bot' }, description: { en: (p) => text(p.detail), it: (p) => text(p.detail) } },
  'shard.resumed': {
    title: { en: 'Connection to Discord restored', it: 'Connessione a Discord ripristinata' },
    description: { en: (p) => `Shard ${text(p.shard)}: ${num(p.replayed, 'en')} events recovered.`, it: (p) => `Shard ${text(p.shard)}: ${num(p.replayed, 'it')} eventi recuperati.` }
  },
  'policy.blocked': {
    title: { en: 'Operation blocked by the security policy', it: 'Operazione bloccata dalla politica di sicurezza' },
    description: {
      en: (p) => `The bot attempted a call that is not allowed and the policy blocked it: \`${text(p.method)} ${text(p.route)}\`.`,
      it: (p) => `Il bot ha tentato una chiamata non consentita e la politica l’ha bloccata: \`${text(p.method)} ${text(p.route)}\`.`
    }
  },
  'status.test': {
    title: { en: 'Status notifications active', it: 'Notifiche di stato attive' },
    description: {
      en: () => 'Test message from the super console. Alerts routed to this channel will arrive here.',
      it: () => 'Messaggio di prova dalla super console. Qui arriveranno gli allarmi instradati verso questo canale.'
    }
  },
  'bot.down': {
    title: { en: 'Bot unreachable', it: 'Bot non raggiungibile' },
    description: {
      en: (p) => p.mode === 'disconnected'
        ? 'The bot process answers but is not connected to Discord: logs are not being recorded.'
        : `The bot has not answered for about ${num(p.minutes, 'en')} minutes${p.sinceStart ? ' (since the API started)' : ''}: logs are not being recorded.`,
      it: (p) => p.mode === 'disconnected'
        ? 'Il processo del bot risponde ma non è connesso a Discord: i log non vengono registrati.'
        : `Il bot non risponde da circa ${num(p.minutes, 'it')} minuti${p.sinceStart ? ' (dall’avvio dell’API)' : ''}: i log non vengono registrati.`
    }
  },
  'bot.restored': {
    title: { en: 'Bot restored', it: 'Bot ripristinato' },
    description: {
      en: (p) => `Sentinel is connected to Discord again after ${durationText(p.durationMs, 'en')} of downtime (${num(p.guilds, 'en')} servers).`,
      it: (p) => `Sentinel è di nuovo connesso a Discord dopo ${durationText(p.durationMs, 'it')} di interruzione (${num(p.guilds, 'it')} server).`
    }
  },
  'sync.stopped': {
    title: { en: 'Discord subscription sync stopped', it: 'Sincronizzazione abbonamenti Discord ferma' },
    description: {
      en: () => 'Active subscriptions cannot be read from Discord: new purchases, renewals and cancellations do not reach the server plans.',
      it: () => 'Gli abbonamenti attivi non si possono leggere da Discord: nuovi acquisti, rinnovi e disdette non arrivano ai piani dei server.'
    }
  },
  'sync.restored': {
    title: { en: 'Subscription sync restored', it: 'Sincronizzazione abbonamenti ripristinata' },
    description: {
      en: (p) => `Discord subscriptions reach the plans again after ${durationText(p.durationMs, 'en')}.`,
      it: (p) => `Gli abbonamenti Discord tornano ad arrivare ai piani dopo ${durationText(p.durationMs, 'it')}.`
    }
  },
  'delivery.backlog': {
    title: { en: 'Log queue backing up', it: 'Coda dei log in accumulo' },
    description: {
      en: (p) => `${num(p.count, 'en')} logs have been waiting for delivery for more than 10 minutes: the bot's dispatcher is stopped or slow.`,
      it: (p) => `${num(p.count, 'it')} log attendono la consegna da più di 10 minuti: il dispatcher del bot è fermo o rallentato.`
    }
  },
  'delivery.backlogCleared': {
    title: { en: 'Log queue cleared', it: 'Coda dei log smaltita' },
    description: { en: (p) => `Log delivery is back to normal after ${durationText(p.durationMs, 'en')}.`, it: (p) => `La consegna dei log è tornata regolare dopo ${durationText(p.durationMs, 'it')}.` }
  },
  'delivery.failures': {
    title: { en: 'Many log deliveries failed', it: 'Molti invii dei log falliti' },
    description: { en: (p) => `${num(p.count, 'en')} logs rejected by Discord in the last 15 minutes.`, it: (p) => `${num(p.count, 'it')} log rifiutati da Discord negli ultimi 15 minuti.` }
  },
  'delivery.failuresCleared': {
    title: { en: 'Log deliveries back to normal', it: 'Invii dei log tornati regolari' },
    description: { en: (p) => `Failed deliveries went back down after ${durationText(p.durationMs, 'en')}.`, it: (p) => `Gli invii falliti sono rientrati dopo ${durationText(p.durationMs, 'it')}.` }
  },
  'subscription.new': {
    title: { en: 'New Discord subscription', it: 'Nuovo abbonamento Discord' },
    description: { en: (p) => `The server now has the ${text(p.plan)} plan.`, it: (p) => `Il server ora ha il piano ${text(p.plan)}.` }
  },
  'subscription.changed': {
    title: { en: 'Discord subscription changed', it: 'Abbonamento Discord cambiato' },
    description: { en: (p) => `The server now has the ${text(p.plan)} plan.`, it: (p) => `Il server ora ha il piano ${text(p.plan)}.` }
  },
  'subscription.ended': {
    title: { en: 'Discord subscription ended', it: 'Abbonamento Discord terminato' },
    description: { en: () => 'The server is back on the Free plan.', it: () => 'Il server è tornato al piano Free.' }
  },
  'webhook.test': {
    title: { en: 'Alarms active', it: 'Allarmi attivi' },
    description: {
      en: () => 'Test message from the super console: the alert and the reminders about the bot being unreachable, and its recovery, will arrive here.',
      it: () => 'Messaggio di prova dalla super console: qui arriveranno l’avviso e i promemoria quando il bot non è raggiungibile, e la notizia del ripristino.'
    }
  }
} satisfies Record<string, Message>;

export type AlertMessageKey = keyof typeof MESSAGES;
export const isAlertMessageKey = (value: unknown): value is AlertMessageKey => typeof value === 'string' && value in MESSAGES;

export function renderAlertMessage(key: AlertMessageKey, params: AlertParams, locale: AlertLocale) {
  const message: Message = MESSAGES[key];
  return { title: message.title[locale], description: message.description ? message.description[locale](params) : null };
}

const FIELDS = {
  server: { en: 'Server', it: 'Server' },
  servers: { en: 'Servers', it: 'Server' },
  members: { en: 'Members', it: 'Membri' },
  addedBy: { en: 'Added by', it: 'Aggiunto da' },
  startedAt: { en: 'Started', it: 'Avvio' }
} satisfies Record<string, Record<AlertLocale, string>>;

export type AlertFieldKey = keyof typeof FIELDS;
export type AlertField = { key: AlertFieldKey; value: string };
export const alertFieldLabel = (key: string, locale: AlertLocale) => (FIELDS as Record<string, Record<AlertLocale, string>>)[key]?.[locale] ?? key;

const CATEGORIES: Record<AlertCategory, Record<AlertLocale, string>> = {
  availability: { en: 'Availability', it: 'Disponibilità' },
  security: { en: 'Security', it: 'Sicurezza' },
  errors: { en: 'Errors', it: 'Errori' },
  delivery: { en: 'Log delivery', it: 'Consegna dei log' },
  billing: { en: 'Subscriptions', it: 'Abbonamenti' },
  installations: { en: 'Installations', it: 'Installazioni' },
  usage: { en: 'Usage', it: 'Utilizzo' }
};
export const alertCategoryLabel = (category: AlertCategory, locale: AlertLocale) => CATEGORIES[category][locale];

export function durationText(ms: unknown, locale: AlertLocale) {
  const minutes = Math.max(1, Math.round(Number(ms ?? 0) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${minutes % 60} min`;
  const days = Math.floor(hours / 24);
  return locale === 'it' ? `${days} giorni` : `${days} days`;
}

/** Texts added by the router around the alerts themselves. */
export const ALERT_UI = {
  en: {
    footer: (category: string) => `Sentinel · ${category}`,
    repeated: (count: number, since: string) => `${count} identical alerts since ${since}; the latest is shown above.`,
    digestTitle: 'Daily digest',
    digestText: (count: number) => `${count} informational alerts since the last digest. Details are in the super console → Monitoring.`,
    digestFooter: 'Sentinel · digest',
    reminder: (title: string) => `Reminder: ${title}`,
    reminderText: (duration: string) => `Still open after ${duration}. Acknowledge it in the super console → Monitoring to stop the reminders.`,
    monitorFooter: 'Sentinel · monitoring',
    statusFooter: 'Sentinel · bot status'
  },
  it: {
    footer: (category: string) => `Sentinel · ${category}`,
    repeated: (count: number, since: string) => `${count} avvisi uguali dalle ${since}; qui sopra il più recente.`,
    digestTitle: 'Riepilogo giornaliero',
    digestText: (count: number) => `${count} avvisi informativi dall’ultimo riepilogo. I dettagli sono nella super console → Monitoraggio.`,
    digestFooter: 'Sentinel · riepilogo',
    reminder: (title: string) => `Promemoria: ${title}`,
    reminderText: (duration: string) => `Ancora aperto da ${duration}. Segnalo come preso in carico nella super console → Monitoraggio per non ricevere altri promemoria.`,
    monitorFooter: 'Sentinel · monitoraggio',
    statusFooter: 'Sentinel · stato del bot'
  }
} as const;
