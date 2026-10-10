import { Icon } from './Brand';
import type { Locale } from '../i18n';
import type { Contacts } from './plans';

const REPO = 'https://github.com/haxurus/Sentinel';

/** Contacts set in the super console; GitHub is the fallback. */
export default function ContactList({ contacts, locale }: { contacts: Contacts | null; locale: Locale }) {
  const items: Array<{ icon: 'message' | 'users' | 'globe' | 'github'; label: string; value: string; href: string | null }> = [];
  if (contacts?.email) items.push({ icon: 'message', label: 'Email', value: contacts.email, href: `mailto:${contacts.email}` });
  if (contacts?.discord) {
    const link = /^https:\/\//.test(contacts.discord);
    items.push({ icon: 'users', label: 'Discord', value: link ? contacts.discord.replace(/^https:\/\//, '') : contacts.discord, href: link ? contacts.discord : null });
  }
  if (contacts?.url) items.push({ icon: 'globe', label: locale === 'it' ? 'Sito' : 'Website', value: contacts.url.replace(/^https:\/\//, ''), href: contacts.url });
  items.push({ icon: 'github', label: 'GitHub', value: 'github.com/haxurus/Sentinel/issues', href: `${REPO}/issues` });

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
