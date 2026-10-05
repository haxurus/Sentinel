export type EmbedLocale = 'en' | 'it';

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

const DETAIL_LABELS_IT: Record<string, string> = {
  username: 'Utente', userId: 'Utente', authorId: 'Autore', inviterId: 'Creatore invito',
  ownerId: 'Proprietario', executorId: 'Autore azione', memberId: 'Membro',
  addedUserIds: 'Utenti aggiunti', removedUserIds: 'Utenti rimossi',
  roleId: 'Ruolo', roleIds: 'Ruoli', roles: 'Ruoli', addedRoles: 'Ruoli aggiunti', removedRoles: 'Ruoli rimossi',
  channelId: 'Canale', channelIds: 'Canali', parentId: 'Canale padre', fromChannelId: 'Canale precedente',
  toChannelId: 'Nuovo canale', messageId: 'Messaggio', messageIds: 'Messaggi', replyTo: 'Risposta a',
  oldNickname: 'Nickname precedente', newNickname: 'Nuovo nickname', oldTimeout: 'Timeout precedente',
  newTimeout: 'Nuovo timeout', oldPending: 'Pending precedente', newPending: 'Pending attuale',
  oldName: 'Nome precedente', newName: 'Nuovo nome', oldStatus: 'Stato precedente', newStatus: 'Nuovo stato',
  oldChannelId: 'Canale precedente', newChannelId: 'Nuovo canale', oldParentId: 'Categoria precedente',
  newParentId: 'Nuova categoria', commandPath: 'Comando', botUserId: 'Bot', applicationId: 'Application ID',
  commandId: 'Command ID', responseMessageId: 'Messaggio risposta', source: 'Origine',
  serverMute: 'Mute server', serverDeaf: 'Deaf server', selfMute: 'Microfono disattivato',
  selfDeaf: 'Audio in ingresso disattivato', streaming: 'Streaming', selfVideo: 'Videocamera',
  suppress: 'Stage: ascoltatore', permissionOverwriteChanges: 'Permessi modificati',
  oldType: 'Tipo precedente', newType: 'Nuovo tipo', oldTopic: 'Topic precedente', newTopic: 'Nuovo topic',
  oldNsfw: 'NSFW precedente', newNsfw: 'NSFW attuale', oldSlowmode: 'Slowmode precedente',
  newSlowmode: 'Nuovo slowmode', oldBitrate: 'Bitrate precedente', newBitrate: 'Nuovo bitrate',
  oldUserLimit: 'Limite utenti precedente', newUserLimit: 'Nuovo limite utenti',
  oldRtcRegion: 'Regione RTC precedente', newRtcRegion: 'Nuova regione RTC',
  oldColor: 'Colore precedente', newColor: 'Nuovo colore', oldHoist: 'Separato (prima)', newHoist: 'Separato (ora)',
  oldMentionable: 'Menzionabile (prima)', newMentionable: 'Menzionabile (ora)', oldIcon: 'Icona precedente', newIcon: 'Nuova icona',
  addedPermissions: 'Permessi aggiunti', removedPermissions: 'Permessi rimossi',
  oldArchived: 'Archiviato (prima)', newArchived: 'Archiviato (ora)', oldLocked: 'Bloccato (prima)', newLocked: 'Bloccato (ora)',
  oldAutoArchiveDuration: 'Auto-archiviazione precedente', newAutoArchiveDuration: 'Nuova auto-archiviazione',
  oldInvitable: 'Invitabile (prima)', newInvitable: 'Invitabile (ora)', oldAppliedTags: 'Tag precedenti', newAppliedTags: 'Nuovi tag',
  oldDescription: 'Descrizione precedente', newDescription: 'Nuova descrizione', oldBanner: 'Banner precedente', newBanner: 'Nuovo banner',
  oldSplash: 'Splash precedente', newSplash: 'Nuovo splash', oldOwnerId: 'Proprietario precedente', newOwnerId: 'Nuovo proprietario',
  oldVerificationLevel: 'Verifica precedente', newVerificationLevel: 'Nuovo livello verifica',
  oldExplicitContentFilter: 'Filtro contenuti precedente', newExplicitContentFilter: 'Nuovo filtro contenuti',
  oldMfaLevel: 'MFA precedente', newMfaLevel: 'Nuovo livello MFA', oldNsfwLevel: 'NSFW precedente', newNsfwLevel: 'Nuovo livello NSFW',
  oldDefaultMessageNotifications: 'Notifiche precedenti', newDefaultMessageNotifications: 'Nuove notifiche predefinite',
  oldAfkChannelId: 'Canale AFK precedente', newAfkChannelId: 'Nuovo canale AFK', oldAfkTimeout: 'Timeout AFK precedente', newAfkTimeout: 'Nuovo timeout AFK',
  oldSystemChannelId: 'Canale di sistema precedente', newSystemChannelId: 'Nuovo canale di sistema',
  oldRulesChannelId: 'Canale regole precedente', newRulesChannelId: 'Nuovo canale regole',
  oldPublicUpdatesChannelId: 'Canale aggiornamenti precedente', newPublicUpdatesChannelId: 'Nuovo canale aggiornamenti',
  oldVanityUrlCode: 'Vanity URL precedente', newVanityUrlCode: 'Nuovo vanity URL',
  oldPreferredLocale: 'Lingua precedente', newPreferredLocale: 'Nuova lingua',
  oldPremiumProgressBarEnabled: 'Barra boost (prima)', newPremiumProgressBarEnabled: 'Barra boost (ora)',
  oldBoostSince: 'Boost precedente', newBoostSince: 'Boost attuale', accountCreatedAt: 'Account creato il',
  reason: 'Motivo', name: 'Nome', code: 'Codice', count: 'Numero', emoji: 'Emoji', type: 'Tipo', topic: 'Topic'
};

const DETAIL_LABELS_EN: Record<string, string> = {
  username: 'User', userId: 'User', authorId: 'Author', inviterId: 'Invite creator',
  ownerId: 'Owner', executorId: 'Action author', memberId: 'Member',
  addedUserIds: 'Added users', removedUserIds: 'Removed users',
  roleId: 'Role', roleIds: 'Roles', roles: 'Roles', addedRoles: 'Added roles', removedRoles: 'Removed roles',
  channelId: 'Channel', channelIds: 'Channels', parentId: 'Parent channel', fromChannelId: 'Previous channel',
  toChannelId: 'New channel', messageId: 'Message', messageIds: 'Messages', replyTo: 'Reply to',
  oldNickname: 'Previous nickname', newNickname: 'New nickname', oldTimeout: 'Previous timeout',
  newTimeout: 'New timeout', oldPending: 'Previous pending', newPending: 'Current pending',
  oldName: 'Previous name', newName: 'New name', oldStatus: 'Previous status', newStatus: 'New status',
  oldChannelId: 'Previous channel', newChannelId: 'New channel', oldParentId: 'Previous category',
  newParentId: 'New category', commandPath: 'Command', botUserId: 'Bot', applicationId: 'Application ID',
  commandId: 'Command ID', responseMessageId: 'Response message', source: 'Source',
  serverMute: 'Server mute', serverDeaf: 'Server deaf', selfMute: 'Microphone muted',
  selfDeaf: 'Incoming audio disabled', streaming: 'Streaming', selfVideo: 'Camera',
  suppress: 'Stage: listener', permissionOverwriteChanges: 'Permission changes',
  oldType: 'Previous type', newType: 'New type', oldTopic: 'Previous topic', newTopic: 'New topic',
  oldNsfw: 'Previous NSFW', newNsfw: 'Current NSFW', oldSlowmode: 'Previous slowmode',
  newSlowmode: 'New slowmode', oldBitrate: 'Previous bitrate', newBitrate: 'New bitrate',
  oldUserLimit: 'Previous user limit', newUserLimit: 'New user limit',
  oldRtcRegion: 'Previous RTC region', newRtcRegion: 'New RTC region',
  oldColor: 'Previous color', newColor: 'New color', oldHoist: 'Displayed separately (before)', newHoist: 'Displayed separately (now)',
  oldMentionable: 'Mentionable (before)', newMentionable: 'Mentionable (now)', oldIcon: 'Previous icon', newIcon: 'New icon',
  addedPermissions: 'Added permissions', removedPermissions: 'Removed permissions',
  oldArchived: 'Archived (before)', newArchived: 'Archived (now)', oldLocked: 'Locked (before)', newLocked: 'Locked (now)',
  oldAutoArchiveDuration: 'Previous auto-archive', newAutoArchiveDuration: 'New auto-archive',
  oldInvitable: 'Invitable (before)', newInvitable: 'Invitable (now)', oldAppliedTags: 'Previous tags', newAppliedTags: 'New tags',
  oldOwnerId: 'Previous owner', newOwnerId: 'New owner', oldVanityUrlCode: 'Previous vanity URL', newVanityUrlCode: 'New vanity URL',
  oldBoostSince: 'Previous boost', newBoostSince: 'Current boost', accountCreatedAt: 'Account created at'
};

const FIELD_LABELS = {
  it: {
    actionAuthor: 'Autore azione', targetUser: 'Target utente', targetRole: 'Target ruolo',
    targetChannel: 'Target canale', targetGuild: 'Target server', target: 'Target', channel: 'Canale',
    content: 'Contenuto', before: 'Prima', after: 'Dopo', attachments: 'Allegati', details: 'Dettagli',
    none: 'Nessuno', empty: '*vuoto*', file: 'file',
    allowAdd: 'Consenti +', allowRemove: 'Consenti −', denyAdd: 'Nega +', denyRemove: 'Nega −',
    overwriteAdded: 'aggiunto', overwriteRemoved: 'rimosso', overwriteUpdated: 'modificato',
    publicResponse: 'Risposta pubblica di un altro bot'
  },
  en: {
    actionAuthor: 'Action author', targetUser: 'User target', targetRole: 'Role target',
    targetChannel: 'Channel target', targetGuild: 'Server target', target: 'Target', channel: 'Channel',
    content: 'Content', before: 'Before', after: 'After', attachments: 'Attachments', details: 'Details',
    none: 'None', empty: '*empty*', file: 'file',
    allowAdd: 'Allow +', allowRemove: 'Allow −', denyAdd: 'Deny +', denyRemove: 'Deny −',
    overwriteAdded: 'added', overwriteRemoved: 'removed', overwriteUpdated: 'updated',
    publicResponse: 'Public response from another bot'
  }
} as const;

const PERMISSION_IT: Record<string, string> = {
  ViewChannel: 'Vedi canale', ManageChannels: 'Gestisci canali', ManageRoles: 'Gestisci ruoli',
  SendMessages: 'Invia messaggi', SendMessagesInThreads: 'Invia messaggi nei thread',
  ReadMessageHistory: 'Leggi cronologia messaggi', ManageMessages: 'Gestisci messaggi',
  EmbedLinks: 'Incorpora link', AttachFiles: 'Allega file', AddReactions: 'Aggiungi reazioni',
  MentionEveryone: 'Menziona @everyone/@here', Connect: 'Connetti', Speak: 'Parla',
  Stream: 'Video/stream', UseVAD: 'Rilevamento voce', MuteMembers: 'Muta membri',
  DeafenMembers: 'Deaf membri', MoveMembers: 'Sposta membri', PrioritySpeaker: 'Priorità voce',
  UseExternalEmojis: 'Usa emoji esterne', UseExternalStickers: 'Usa sticker esterni',
  CreatePublicThreads: 'Crea thread pubblici', CreatePrivateThreads: 'Crea thread privati',
  ManageThreads: 'Gestisci thread'
};

export const normalizeEmbedLocale = (value: string | null | undefined): EmbedLocale => value === 'it' ? 'it' : 'en';

export const eventEmbedCopy = (
  eventKey: string,
  locale: EmbedLocale,
  italianLabel: string,
  italianDescription: string
) => {
  if (locale === 'it') return { label: italianLabel, description: italianDescription };
  return EVENT_EN[eventKey] ?? { label: eventKey, description: 'Discord event.' };
};

export const detailLabel = (key: string, locale: EmbedLocale) => {
  const dictionary = locale === 'it' ? DETAIL_LABELS_IT : DETAIL_LABELS_EN;
  if (dictionary[key]) return dictionary[key]!;
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : key;
};

export const fieldLabel = (key: keyof typeof FIELD_LABELS.en, locale: EmbedLocale) => FIELD_LABELS[locale][key];

export const yesNo = (value: boolean, locale: EmbedLocale) => locale === 'it'
  ? (value ? 'Sì' : 'No')
  : (value ? 'Yes' : 'No');

export const sourceLabel = (value: string, locale: EmbedLocale) => {
  if (value === 'direct') return 'Sentinel';
  if (value === 'public_response') return fieldLabel('publicResponse', locale);
  return value;
};

export const permissionLabel = (permission: string, locale: EmbedLocale) => {
  if (locale === 'it') return PERMISSION_IT[permission] ?? permission.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return permission.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
};

export const overwriteActionLabel = (action: unknown, locale: EmbedLocale) => {
  if (action === 'added') return fieldLabel('overwriteAdded', locale);
  if (action === 'removed') return fieldLabel('overwriteRemoved', locale);
  return fieldLabel('overwriteUpdated', locale);
};
