import type { Metadata } from 'next';
import PublicHome from '../../_components/PublicHome';
import { pageMetadata } from '../../_components/seo';

export const metadata: Metadata = pageMetadata({
  locale: 'it',
  path: '',
  title: 'Sentinel — Bot di log e audit log per Discord',
  description: 'Bot Discord gratuito e open source per i log del server: ban, kick, timeout, ruoli e permessi, messaggi modificati ed eliminati, vocali e AutoMod, con storico cifrato e ricercabile e un canale di log per ogni evento.',
  absoluteTitle: true
});

export default function Page() { return <PublicHome locale="it" />; }
