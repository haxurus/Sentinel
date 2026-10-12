import { socialImage, socialImageSize } from '../../_components/SocialImage';

export const alt = 'Sentinel, the Discord audit log and logging bot';
export const size = socialImageSize;
export const contentType = 'image/png';

export default function Image() {
  return socialImage({
    kicker: 'Discord logging bot',
    title: 'Every action on your Discord server, on the record.',
    subtitle: 'Bans, kicks, roles, permissions, edited and deleted messages — encrypted, searchable, routed to the right channel.',
    tags: ['72 event types', 'Free plan', 'Open source']
  });
}
