export type Locale = 'it' | 'en';

export type EventDefinitionLike = {
  key: string;
  category: string;
  label: string;
  description: string;
  noisy?: boolean;
};

const CATEGORY_EN: Record<string, string> = {
  Utenti: 'Members',
  Moderazione: 'Moderation',
  Messaggi: 'Messages',
  Reazioni: 'Reactions',
  Vocale: 'Voice',
  Ruoli: 'Roles',
  Canali: 'Channels',
  Thread: 'Threads',
  Espressioni: 'Expressions',
  Inviti: 'Invites',
  Webhook: 'Webhooks',
  Server: 'Server',
  Sistema: 'System',
  Eventi: 'Scheduled events',
  AutoMod: 'AutoMod',
  Stage: 'Stage',
  Soundboard: 'Soundboard',
  Interazioni: 'Interactions',
  Applicazioni: 'Applications',
  Audit: 'Audit',
  Presenza: 'Presence',
  Avanzato: 'Advanced'
};

const EVENT_EN: Record<string, { label: string; description: string }> = {
  'member.join': { label: 'Member joined', description: 'A member joins the server.' },
  'member.leave': { label: 'Member left', description: 'A member leaves the server.' },
  'member.update': { label: 'Member updated', description: 'Nickname, roles, timeout or other member data changes.' },
  'moderation.kick': { label: 'Kick', description: 'A member is kicked from the server.' },
  'moderation.ban': { label: 'Ban', description: 'A user is banned.' },
  'moderation.unban': { label: 'Unban', description: 'A ban is removed.' },
  'message.create': { label: 'Message created', description: 'A new message is sent.' },
  'message.edit': { label: 'Message edited', description: 'Message content or attachments change.' },
  'message.delete': { label: 'Message deleted', description: 'A message is deleted.' },
  'message.bulk_delete': { label: 'Bulk message deletion', description: 'Multiple messages are deleted at once.' },
  'reaction.add': { label: 'Reaction added', description: 'A reaction is added.' },
  'reaction.remove': { label: 'Reaction removed', description: 'A reaction is removed.' },
  'reaction.clear': { label: 'Reactions cleared', description: 'All reactions on a message are cleared.' },
  'reaction.emoji_clear': { label: 'Emoji reactions cleared', description: 'All reactions using a specific emoji are removed.' },
  'poll.vote_add': { label: 'Poll vote added', description: 'A user votes for a poll answer.' },
  'poll.vote_remove': { label: 'Poll vote removed', description: 'A user removes a poll vote.' },
  'voice.join': { label: 'Voice joined', description: 'A user joins a voice channel.' },
  'voice.leave': { label: 'Voice left', description: 'A user leaves voice.' },
  'voice.move': { label: 'Voice moved', description: 'A user moves to another voice channel.' },
  'voice.state': { label: 'Voice state changed', description: 'Mute, deaf, streaming or video state changes.' },
  'voice.effect': { label: 'Voice effect', description: 'An effect or sound is sent in a voice channel.' },
  'voice.server_update': { label: 'Voice server updated', description: 'Discord updates the voice server endpoint without storing the token.' },
  'role.create': { label: 'Role created', description: 'A role is created.' },
  'role.update': { label: 'Role updated', description: 'A role is updated.' },
  'role.delete': { label: 'Role deleted', description: 'A role is deleted.' },
  'channel.create': { label: 'Channel created', description: 'A channel is created.' },
  'channel.update': { label: 'Channel updated', description: 'A channel or its permissions are updated.' },
  'channel.delete': { label: 'Channel deleted', description: 'A channel is deleted.' },
  'channel.pins': { label: 'Pins updated', description: 'The pinned-message list of a channel changes.' },
  'thread.create': { label: 'Thread created', description: 'A thread or forum post is created.' },
  'thread.update': { label: 'Thread updated', description: 'A thread is updated, archived or unlocked.' },
  'thread.delete': { label: 'Thread deleted', description: 'A thread is deleted.' },
  'thread.members_update': { label: 'Thread members updated', description: 'Users join or leave a thread.' },
  'thread.member_update': { label: 'Thread member updated', description: 'Thread membership data changes.' },
  'thread.list_sync': { label: 'Thread list synchronized', description: 'Discord synchronizes threads accessible to the client.' },
  'emoji.create': { label: 'Emoji created', description: 'An emoji is added.' },
  'emoji.update': { label: 'Emoji updated', description: 'An emoji is updated.' },
  'emoji.delete': { label: 'Emoji deleted', description: 'An emoji is deleted.' },
  'sticker.create': { label: 'Sticker created', description: 'A sticker is added.' },
  'sticker.update': { label: 'Sticker updated', description: 'A sticker is updated.' },
  'sticker.delete': { label: 'Sticker deleted', description: 'A sticker is deleted.' },
  'invite.create': { label: 'Invite created', description: 'An invite is created.' },
  'invite.delete': { label: 'Invite deleted', description: 'An invite is deleted.' },
  'webhook.update': { label: 'Webhooks updated', description: 'Webhooks for a channel change.' },
  'integration.update': { label: 'Integrations updated', description: 'Integrations connected to the server change.' },
  'guild.update': { label: 'Server updated', description: 'Server name, icon, banner or settings change.' },
  'guild.available': { label: 'Server available', description: 'The server becomes available to the Discord client again.' },
  'guild.unavailable': { label: 'Server unavailable', description: 'Discord temporarily marks the server as unavailable.' },
  'guild.remove': { label: 'Bot removed from server', description: 'The bot loses access to the server or is removed.' },
  'scheduled.create': { label: 'Scheduled event created', description: 'A scheduled event is created.' },
  'scheduled.update': { label: 'Scheduled event updated', description: 'A scheduled event is updated.' },
  'scheduled.delete': { label: 'Scheduled event deleted', description: 'A scheduled event is deleted.' },
  'scheduled.user_add': { label: 'Event interest added', description: 'A user subscribes to a scheduled event.' },
  'scheduled.user_remove': { label: 'Event interest removed', description: 'A user unsubscribes from a scheduled event.' },
  'automod.rule_create': { label: 'AutoMod rule created', description: 'An AutoMod rule is created.' },
  'automod.rule_update': { label: 'AutoMod rule updated', description: 'An AutoMod rule is updated.' },
  'automod.rule_delete': { label: 'AutoMod rule deleted', description: 'An AutoMod rule is deleted.' },
  'automod.action': { label: 'AutoMod action', description: 'An AutoMod rule is triggered.' },
  'stage.create': { label: 'Stage created', description: 'A Stage instance is opened.' },
  'stage.update': { label: 'Stage updated', description: 'A Stage instance is updated.' },
  'stage.delete': { label: 'Stage closed', description: 'A Stage instance is closed.' },
  'soundboard.create': { label: 'Sound created', description: 'A sound is added to the soundboard.' },
  'soundboard.update': { label: 'Sound updated', description: 'A soundboard sound is updated.' },
  'soundboard.delete': { label: 'Sound deleted', description: 'A sound is removed from the soundboard.' },
  'soundboard.sync': { label: 'Soundboard synchronized', description: 'Discord updates the server sound list.' },
  'command.use': { label: 'Slash command', description: 'A user uses a Sentinel command or another bot command with a public response.' },
  'interaction.create': { label: 'Bot interaction', description: 'A user uses a command, button, menu or modal from the bot.' },
  'application.permissions_update': { label: 'Application command permissions', description: 'Permissions for a command or application entity change in the server.' },
  'user.update': { label: 'User profile updated', description: 'Username, avatar or other global user data changes.' },
  'audit.entry': { label: 'Discord Audit Log', description: 'Discord creates a new Audit Log entry.' },
  'presence.update': { label: 'Presence updated', description: 'A member status or activity changes.' },
  'typing.start': { label: 'Typing', description: 'A user starts typing.' },
  'raw.gateway': { label: 'Raw Gateway', description: 'Raw copy of non-normalized Gateway events. Use only for debugging.' },
  'system.ready': { label: 'Bot ready', description: 'The bot completes its connection to Discord.' },
  'system.error': { label: 'Bot error', description: 'Bot runtime error.' },
  'system.warn': { label: 'Bot warning', description: 'Warning emitted by the Discord client.' }
};

export function localizeCategory(category: string, locale: Locale) {
  return locale === 'en' ? (CATEGORY_EN[category] ?? category) : category;
}

export function localizeEvent<T extends EventDefinitionLike>(event: T, locale: Locale): T {
  if (locale === 'it') return event;
  const translated = EVENT_EN[event.key];
  return {
    ...event,
    category: localizeCategory(event.category, locale),
    label: translated?.label ?? event.label,
    description: translated?.description ?? event.description
  };
}
