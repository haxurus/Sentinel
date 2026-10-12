import { Icon } from './Brand';
import type { Locale } from '../i18n';
import type { Contacts } from './plans';

const DISCORD_INVITE = /^https:\/\/(?:www\.)?(?:discord\.gg|discord\.com\/invite)\//i;

/** Contacts set in the super console (Contacts tab). */
export default function ContactList({ contacts, locale }: { contacts: Contacts | null; locale: Locale }) {
  const items: Array<{ icon: 'message' | 'users' | 'globe'; label: string; value: string; href: string | null }> = [];
  if (contacts?.email) items.push({ icon: 'message', label: 'Email', value: contacts.email, href: `mailto:${contacts.email}` });
  if (contacts?.discord) {
    const link = /^https:\/\//.test(contacts.discord);
    items.push({ icon: 'users', label: 'Discord', value: link ? contacts.discord.replace(/^https:\/\//, '') : contacts.discord, href: link ? contacts.discord : null });
  }
  if (contacts?.url) {
    const server = DISCORD_INVITE.test(contacts.url);
    items.push({
      icon: server ? 'users' : 'globe',
      label: server ? (locale === 'it' ? 'Server Discord' : 'Discord server') : (locale === 'it' ? 'Sito' : 'Website'),
      value: contacts.url.replace(/^https:\/\/(?:www\.)?/, ''),
      href: contacts.url
    });
  }
  if (!items.length) return null;

  return (
    <ul className="contact-list">
      {items.map((item) => (
        <li key={item.label}>
          <span className="feature-icon"><Icon name={item.icon} size={17} /></span>
          <div>
            <span>{item.label}</span>
            {item.href
              ? <a href={item.href} target={item.href.startsWith('mailto:') ? undefined : '_blank'} rel="noreferrer">{item.value}</a>
              : <strong className="mono">{item.value}</strong>}
          </div>
        </li>
      ))}
    </ul>
  );
}
