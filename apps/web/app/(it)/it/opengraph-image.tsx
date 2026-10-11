import { socialImage, socialImageSize } from '../../_components/SocialImage';

export const alt = 'Sentinel, il bot di log e audit log per Discord';
export const size = socialImageSize;
export const contentType = 'image/png';

export default function Image() {
  return socialImage({
    kicker: 'Bot di log per Discord',
    title: 'Ogni azione sul tuo server Discord, registrata.',
    subtitle: 'Ban, kick, ruoli, permessi, messaggi modificati ed eliminati — cifrati, ricercabili, nel canale giusto.',
    tags: ['73 tipi di evento', 'Piano gratuito', 'Open source']
  });
}
