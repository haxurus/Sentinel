import {
  AuditLogEvent,
  Events,
  InteractionType,
  type Client,
  type GuildMember,
  type Message,
  type PartialMessage
} from 'discord.js';
import { prisma } from '@sentinel/db';
import { ensureGuild, getGuildSettings, isGuildInstallBlocked, isUserInstallBlocked, snapshotMessage } from './store.js';
import { recordEvent } from './recorder.js';
import { findRecentAuditEntry, jsonSafe, redactSecrets } from './utils.js';
import { decryptText, unprotectJson } from './security.js';
import { leaveGuild } from './discord-actions.js';

const roleIds = (member: GuildMember | null | undefined | any) => member?.roles?.cache ? [...member.roles.cache.keys()] : [];
const actorFromAudit = async (guild: any, type: AuditLogEvent, targetId?: string) => {
  const entry = await findRecentAuditEntry(guild, type, targetId);
  return entry?.executorId ?? null;
};

const attachmentData = (message: Message | PartialMessage) => [...message.attachments.values()].map((a) => ({
  id: a.id,
  name: a.name,
  url: a.url,
  contentType: a.contentType,
  size: a.size
}));

const addChangedPair = (
  details: Record<string, unknown>,
  oldKey: string,
  newKey: string,
  oldValue: unknown,
  newValue: unknown
) => {
  if (JSON.stringify(oldValue) === JSON.stringify(newValue)) return false;
  details[oldKey] = oldValue;
  details[newKey] = newValue;
  return true;
};

const permissionNames = (overwrite: any, side: 'allow' | 'deny') =>
  new Set<string>(overwrite?.[side]?.toArray?.() ?? []);

const setDifference = (next: Set<string>, previous: Set<string>) =>
  [...next].filter((value) => !previous.has(value));

const permissionOverwriteChanges = (oldChannel: any, newChannel: any) => {
  const oldCache = oldChannel?.permissionOverwrites?.cache;
  const newCache = newChannel?.permissionOverwrites?.cache;
  if (!oldCache || !newCache) return [];

  const ids = new Set<string>([...oldCache.keys(), ...newCache.keys()]);
  const changes: Array<Record<string, unknown>> = [];

  for (const id of ids) {
    const before = oldCache.get(id);
    const after = newCache.get(id);
    const targetType = (after?.type ?? before?.type) === 0 ? 'role' : 'user';

    if (!before && after) {
      changes.push({
        targetId: id,
        targetType,
        action: 'added',
        allowAdded: [...permissionNames(after, 'allow')],
        denyAdded: [...permissionNames(after, 'deny')]
      });
      continue;
    }

    if (before && !after) {
      changes.push({
        targetId: id,
        targetType,
        action: 'removed',
        allowRemoved: [...permissionNames(before, 'allow')],
        denyRemoved: [...permissionNames(before, 'deny')]
      });
      continue;
    }

    const oldAllow = permissionNames(before, 'allow');
    const newAllow = permissionNames(after, 'allow');
    const oldDeny = permissionNames(before, 'deny');
    const newDeny = permissionNames(after, 'deny');

    const allowAdded = setDifference(newAllow, oldAllow);
    const allowRemoved = setDifference(oldAllow, newAllow);
    const denyAdded = setDifference(newDeny, oldDeny);
    const denyRemoved = setDifference(oldDeny, newDeny);

    if (allowAdded.length || allowRemoved.length || denyAdded.length || denyRemoved.length) {
      changes.push({ targetId: id, targetType, action: 'updated', allowAdded, allowRemoved, denyAdded, denyRemoved });
    }
  }

  return changes;
};

const voiceStateSummary = (tag: string, changes: Record<string, unknown>) => {
  const visibleKeys = Object.keys(changes).filter((key) => !['actorBot', 'actorRoleIds'].includes(key));
  if (visibleKeys.length !== 1) return `Lo stato vocale di ${tag} è cambiato.`;

  switch (visibleKeys[0]) {
    case 'selfMute': return changes.selfMute ? `${tag} si è mutato.` : `${tag} si è smutato.`;
    case 'selfDeaf': return changes.selfDeaf ? `${tag} ha disattivato l’audio in ingresso.` : `${tag} ha riattivato l’audio in ingresso.`;
    case 'serverMute': return changes.serverMute ? `${tag} è stato mutato dal server.` : `${tag} non è più mutato dal server.`;
    case 'serverDeaf': return changes.serverDeaf ? `${tag} è stato deafened dal server.` : `${tag} non è più deafened dal server.`;
    case 'streaming': return changes.streaming ? `${tag} ha avviato lo streaming.` : `${tag} ha interrotto lo streaming.`;
    case 'selfVideo': return changes.selfVideo ? `${tag} ha attivato la videocamera.` : `${tag} ha disattivato la videocamera.`;
    case 'suppress': return changes.suppress ? `${tag} è stato spostato tra gli ascoltatori.` : `${tag} può parlare sullo Stage.`;
    default: return `Lo stato vocale di ${tag} è cambiato.`;
  }
};

const commandPath = (interaction: any) => {
  const group = interaction.options?.getSubcommandGroup?.(false) ?? null;
  const subcommand = interaction.options?.getSubcommand?.(false) ?? null;
  return '/' + [interaction.commandName, group, subcommand].filter(Boolean).join(' ');
};

export function registerHandlers(client: Client) {
  client.on(Events.GuildCreate, async (guild) => {
    if (await isGuildInstallBlocked(guild.id)) {
      await leaveGuild(guild, 'blocked-guild').catch(() => null);
      return;
    }

    const installer = client.user
      ? await findRecentAuditEntry(guild, AuditLogEvent.BotAdd, client.user.id, 20_000)
      : null;
    if (installer?.executorId && await isUserInstallBlocked(installer.executorId)) {
      await leaveGuild(guild, 'blocked-installer').catch(() => null);
      return;
    }

    await ensureGuild(guild);
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    await recordEvent({
      guildId: member.guild.id,
      eventKey: 'member.join',
      actorId: member.id,
      targetId: member.id,
      summary: `${member.user.tag} è entrato nel server.`,
      details: {
        username: member.user.tag,
        accountCreatedAt: member.user.createdAt,
        actorBot: member.user.bot,
        actorRoleIds: roleIds(member)
      }
    });
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    const kickEntry = await findRecentAuditEntry(member.guild, AuditLogEvent.MemberKick, member.id);
    const kicked = Boolean(kickEntry);
    await recordEvent({
      guildId: member.guild.id,
      eventKey: kicked ? 'moderation.kick' : 'member.leave',
      actorId: kickEntry?.executorId ?? null,
      targetId: member.id,
      summary: kicked ? `${member.user.tag} è stato espulso.` : `${member.user.tag} ha lasciato il server.`,
      details: {
        username: member.user.tag,
        reason: kickEntry?.reason ?? null,
        roles: roleIds(member),
        actorBot: kickEntry?.executor?.bot ?? false
      }
    });
  });

  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    const oldRoles = roleIds(oldMember);
    const newRoles = roleIds(newMember);
    const addedRoles = newRoles.filter((id) => !oldRoles.includes(id));
    const removedRoles = oldRoles.filter((id) => !newRoles.includes(id));
    const rolesChanged = addedRoles.length > 0 || removedRoles.length > 0;
    const details: Record<string, unknown> = {};

    addChangedPair(details, 'oldNickname', 'newNickname', oldMember.nickname, newMember.nickname);
    if (addedRoles.length) details.addedRoles = addedRoles;
    if (removedRoles.length) details.removedRoles = removedRoles;
    addChangedPair(details, 'oldTimeout', 'newTimeout', oldMember.communicationDisabledUntil?.toISOString() ?? null, newMember.communicationDisabledUntil?.toISOString() ?? null);
    addChangedPair(details, 'oldBoostSince', 'newBoostSince', oldMember.premiumSince?.toISOString() ?? null, newMember.premiumSince?.toISOString() ?? null);
    addChangedPair(details, 'oldPending', 'newPending', oldMember.pending, newMember.pending);

    if (!Object.keys(details).length) return;

    const type = rolesChanged ? AuditLogEvent.MemberRoleUpdate : AuditLogEvent.MemberUpdate;
    const actorId = await actorFromAudit(newMember.guild, type, newMember.id);
    details.actorRoleIds = actorId ? roleIds(newMember.guild.members.cache.get(actorId)) : [];

    await recordEvent({
      guildId: newMember.guild.id,
      eventKey: 'member.update',
      actorId,
      targetId: newMember.id,
      summary: `${newMember.user.tag} è stato modificato.`,
      details
    });
  });

  client.on(Events.GuildBanAdd, async (ban) => {
    const entry = await findRecentAuditEntry(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
    await recordEvent({
      guildId: ban.guild.id,
      eventKey: 'moderation.ban',
      actorId: entry?.executorId ?? null,
      targetId: ban.user.id,
      summary: `${ban.user.tag} è stato bannato.`,
      details: { reason: entry?.reason ?? ban.reason ?? null, username: ban.user.tag }
    });
  });

  client.on(Events.GuildBanRemove, async (ban) => {
    const entry = await findRecentAuditEntry(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
    await recordEvent({
      guildId: ban.guild.id,
      eventKey: 'moderation.unban',
      actorId: entry?.executorId ?? null,
      targetId: ban.user.id,
      summary: `Il ban di ${ban.user.tag} è stato rimosso.`,
      details: { username: ban.user.tag }
    });
  });

  client.on(Events.MessageCreate, async (message) => {
    if (!message.guildId || !message.author) return;

    const interactionResponse = message.interaction;
    const interactionMetadata = message.interactionMetadata;
    if (
      message.author.id !== client.user?.id &&
      message.author.bot &&
      interactionResponse?.type === InteractionType.ApplicationCommand &&
      !interactionMetadata?.originalResponseMessageId
    ) {
      const invoker = interactionResponse.user;
      await recordEvent({
        guildId: message.guildId,
        eventKey: 'command.use',
        actorId: invoker.id,
        channelId: message.channelId,
        summary: `${invoker.tag} ha usato /${interactionResponse.commandName} con ${message.author.tag}.`,
        details: {
          commandPath: `/${interactionResponse.commandName}`,
          botUserId: message.author.id,
          applicationId: message.applicationId,
          responseMessageId: message.id,
          source: 'public_response',
          actorBot: invoker.bot,
          actorRoleIds: roleIds(message.guild?.members.cache.get(invoker.id))
        }
      });
    }

    if (message.author.id === client.user?.id) return;
    const settings = await getGuildSettings(message.guildId);
    await snapshotMessage(message);
    await recordEvent({
      guildId: message.guildId,
      eventKey: 'message.create',
      actorId: message.author.id,
      targetId: message.id,
      channelId: message.channelId,
      summary: `${message.author.tag} ha inviato un messaggio.`,
      details: {
        content: settings?.storeMessageContent ? message.content : null,
        attachments: attachmentData(message),
        replyTo: message.reference?.messageId ?? null,
        pinned: message.pinned,
        actorBot: message.author.bot,
        actorRoleIds: roleIds(message.member)
      }
    });
  });

  client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    if (!newMessage.guildId || newMessage.author?.id === client.user?.id) return;
    if (newMessage.partial) await newMessage.fetch().catch(() => null);
    const before = await prisma.messageSnapshot.findUnique({ where: { messageId: newMessage.id } });
    if (!newMessage.author) return;
    const settings = await getGuildSettings(newMessage.guildId);
    await snapshotMessage(newMessage as Message);
    const oldComparableContent = decryptText(before?.content) ?? oldMessage.content ?? '';
    const newComparableContent = newMessage.content ?? '';
    const sameAttachments = JSON.stringify(before ? unprotectJson(before.attachments) : attachmentData(oldMessage)) === JSON.stringify(attachmentData(newMessage));
    if (oldComparableContent === newComparableContent && sameAttachments && settings?.storeMessageContent) return;

    await recordEvent({
      guildId: newMessage.guildId,
      eventKey: 'message.edit',
      actorId: newMessage.author.id,
      targetId: newMessage.id,
      channelId: newMessage.channelId,
      summary: `${newMessage.author.tag} ha modificato un messaggio.`,
      details: {
        oldContent: settings?.storeMessageContent ? (decryptText(before?.content) ?? oldMessage.content ?? null) : null,
        newContent: settings?.storeMessageContent ? (newMessage.content ?? null) : null,
        attachments: attachmentData(newMessage),
        actorBot: newMessage.author.bot,
        actorRoleIds: roleIds(newMessage.member)
      }
    });
  });

  client.on(Events.MessageDelete, async (message) => {
    if (!message.guildId) return;
    const snapshot = await prisma.messageSnapshot.findUnique({ where: { messageId: message.id } });
    const settings = await getGuildSettings(message.guildId);
    if (snapshot?.authorId === client.user?.id || message.author?.id === client.user?.id) return;
    const authorId = snapshot?.authorId ?? message.author?.id ?? null;
    await recordEvent({
      guildId: message.guildId,
      eventKey: 'message.delete',
      targetId: authorId,
      channelId: message.channelId,
      summary: `È stato eliminato un messaggio${snapshot?.authorTag ? ` di ${snapshot.authorTag}` : ''}.`,
      details: {
        messageId: message.id,
        content: settings?.storeMessageContent ? (decryptText(snapshot?.content) ?? message.content ?? null) : null,
        attachments: snapshot ? unprotectJson(snapshot.attachments) : attachmentData(message),
        authorId,
        authorTag: snapshot?.authorTag ?? message.author?.tag ?? null,
        actorBot: snapshot?.authorBot ?? message.author?.bot ?? false,
        actorRoleIds: snapshot?.roleIds ?? []
      }
    });
  });

  client.on(Events.MessageBulkDelete, async (messages, channel) => {
    const ids = [...messages.keys()];
    await recordEvent({
      guildId: channel.guild.id,
      eventKey: 'message.bulk_delete',
      channelId: channel.id,
      summary: `Sono stati eliminati ${messages.size} messaggi.`,
      details: { count: messages.size, messageIds: ids.slice(0, 100) }
    });
  });

  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (!reaction.message.guildId || user.id === client.user?.id) return;
    await recordEvent({
      guildId: reaction.message.guildId,
      eventKey: 'reaction.add',
      actorId: user.id,
      targetId: reaction.message.id,
      channelId: reaction.message.channelId,
      summary: `${user.tag ?? user.id} ha aggiunto una reaction.`,
      details: { emoji: reaction.emoji.toString(), actorBot: user.bot }
    });
  });

  client.on(Events.MessageReactionRemove, async (reaction, user) => {
    if (!reaction.message.guildId || user.id === client.user?.id) return;
    await recordEvent({
      guildId: reaction.message.guildId,
      eventKey: 'reaction.remove',
      actorId: user.id,
      targetId: reaction.message.id,
      channelId: reaction.message.channelId,
      summary: `${user.tag ?? user.id} ha rimosso una reaction.`,
      details: { emoji: reaction.emoji.toString(), actorBot: user.bot }
    });
  });

  client.on(Events.MessageReactionRemoveAll, async (message, reactions) => {
    if (!message.guildId) return;
    await recordEvent({
      guildId: message.guildId,
      eventKey: 'reaction.clear',
      targetId: message.id,
      channelId: message.channelId,
      summary: 'Sono state rimosse tutte le reaction da un messaggio.',
      details: { reactions: [...reactions.values()].map((r) => r.emoji.toString()) }
    });
  });

  client.on(Events.MessageReactionRemoveEmoji, async (reaction) => {
    if (!reaction.message.guildId) return;
    await recordEvent({
      guildId: reaction.message.guildId,
      eventKey: 'reaction.emoji_clear',
      targetId: reaction.message.id,
      channelId: reaction.message.channelId,
      summary: `Sono state rimosse tutte le reaction ${reaction.emoji.toString()} da un messaggio.`,
      details: { emoji: reaction.emoji.toString() }
    });
  });

  client.on(Events.MessagePollVoteAdd, async (pollAnswer, userId) => {
    const answer = pollAnswer as any;
    const message = answer.poll?.message;
    const guildId = message?.guildId ?? answer.poll?.guildId ?? null;
    if (!guildId) return;
    await recordEvent({
      guildId,
      eventKey: 'poll.vote_add',
      actorId: userId,
      targetId: message?.id ?? null,
      channelId: message?.channelId ?? null,
      summary: `Un utente ha aggiunto un voto a un poll.`,
      details: { answerId: answer.id ?? null, actorBot: false }
    });
  });

  client.on(Events.MessagePollVoteRemove, async (pollAnswer, userId) => {
    const answer = pollAnswer as any;
    const message = answer.poll?.message;
    const guildId = message?.guildId ?? answer.poll?.guildId ?? null;
    if (!guildId) return;
    await recordEvent({
      guildId,
      eventKey: 'poll.vote_remove',
      actorId: userId,
      targetId: message?.id ?? null,
      channelId: message?.channelId ?? null,
      summary: `Un utente ha rimosso un voto da un poll.`,
      details: { answerId: answer.id ?? null, actorBot: false }
    });
  });

  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const member = newState.member ?? oldState.member;
    if (!member) return;

    let eventKey = 'voice.state';
    let summary = `Lo stato vocale di ${member.user.tag} è cambiato.`;
    const details: Record<string, unknown> = {};

    if (!oldState.channelId && newState.channelId) {
      eventKey = 'voice.join';
      summary = `${member.user.tag} è entrato in ${newState.channel?.name ?? 'un canale vocale'}.`;
    } else if (oldState.channelId && !newState.channelId) {
      eventKey = 'voice.leave';
      summary = `${member.user.tag} è uscito da ${oldState.channel?.name ?? 'un canale vocale'}.`;
    } else if (oldState.channelId !== newState.channelId) {
      eventKey = 'voice.move';
      summary = `${member.user.tag} è passato da ${oldState.channel?.name ?? 'un canale vocale'} a ${newState.channel?.name ?? 'un canale vocale'}.`;
      details.fromChannelId = oldState.channelId;
      details.toChannelId = newState.channelId;
    }

    const stateChanges: Array<[string, unknown, unknown]> = [
      ['serverMute', oldState.serverMute, newState.serverMute],
      ['serverDeaf', oldState.serverDeaf, newState.serverDeaf],
      ['selfMute', oldState.selfMute, newState.selfMute],
      ['selfDeaf', oldState.selfDeaf, newState.selfDeaf],
      ['streaming', oldState.streaming, newState.streaming],
      ['selfVideo', oldState.selfVideo, newState.selfVideo],
      ['suppress', oldState.suppress, newState.suppress]
    ];

    for (const [key, before, after] of stateChanges) {
      if (before !== after) details[key] = after;
    }

    if (eventKey === 'voice.state') {
      if (!Object.keys(details).length) return;
      summary = voiceStateSummary(member.user.tag, details);
    }

    details.actorBot = member.user.bot;
    details.actorRoleIds = roleIds(member);

    await recordEvent({
      guildId: newState.guild.id,
      eventKey,
      targetId: member.id,
      channelId: newState.channelId ?? oldState.channelId,
      summary,
      details
    });
  });


  client.on(Events.VoiceServerUpdate, async (data) => {
    await recordEvent({
      guildId: data.guildId,
      eventKey: 'voice.server_update',
      targetId: data.guildId,
      summary: 'Discord ha aggiornato il voice server.',
      details: { endpoint: data.endpoint }
    });
  });

  client.on(Events.VoiceChannelEffectSend, async (effect) => {
    await recordEvent({
      guildId: effect.guild.id,
      eventKey: 'voice.effect',
      actorId: effect.userId,
      targetId: effect.soundId != null ? String(effect.soundId) : null,
      channelId: effect.channelId,
      summary: 'È stato inviato un effetto in un canale vocale.',
      details: {
        emoji: effect.emoji?.toString() ?? null,
        soundId: effect.soundId != null ? String(effect.soundId) : null,
        soundVolume: effect.soundVolume,
        animationId: effect.animationId,
        animationType: effect.animationType
      }
    });
  });

  client.on(Events.GuildRoleCreate, async (role) => {
    const actorId = await actorFromAudit(role.guild, AuditLogEvent.RoleCreate, role.id);
    await recordEvent({ guildId: role.guild.id, eventKey: 'role.create', actorId, targetId: role.id, summary: `Creato il ruolo ${role.name}.`, details: { name: role.name, permissions: role.permissions.bitfield.toString(), color: role.hexColor } });
  });
  client.on(Events.GuildRoleUpdate, async (oldRole, newRole) => {
    const actorId = await actorFromAudit(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
    await recordEvent({ guildId: newRole.guild.id, eventKey: 'role.update', actorId, targetId: newRole.id, summary: `Modificato il ruolo ${newRole.name}.`, details: { oldName: oldRole.name, newName: newRole.name, oldPermissions: oldRole.permissions.bitfield.toString(), newPermissions: newRole.permissions.bitfield.toString(), oldColor: oldRole.hexColor, newColor: newRole.hexColor } });
  });
  client.on(Events.GuildRoleDelete, async (role) => {
    const actorId = await actorFromAudit(role.guild, AuditLogEvent.RoleDelete, role.id);
    await recordEvent({ guildId: role.guild.id, eventKey: 'role.delete', actorId, targetId: role.id, summary: `Eliminato il ruolo ${role.name}.`, details: { name: role.name, permissions: role.permissions.bitfield.toString(), color: role.hexColor } });
  });

  client.on(Events.ChannelCreate, async (channel) => {
    if (!channel.isDMBased()) {
      const actorId = await actorFromAudit(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
      await recordEvent({ guildId: channel.guild.id, eventKey: 'channel.create', actorId, targetId: channel.id, channelId: channel.id, summary: `Creato il canale ${channel.name}.`, details: { name: channel.name, type: channel.type, parentId: channel.parentId } });
    }
  });
  client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
    if (newChannel.isDMBased()) return;

    const before = oldChannel as any;
    const after = newChannel as any;
    const details: Record<string, unknown> = {};
    const nameChanged = addChangedPair(details, 'oldName', 'newName', before.name ?? null, after.name ?? null);
    const parentChanged = addChangedPair(details, 'oldParentId', 'newParentId', before.parentId ?? null, after.parentId ?? null);
    addChangedPair(details, 'oldType', 'newType', before.type, after.type);
    addChangedPair(details, 'oldTopic', 'newTopic', before.topic ?? null, after.topic ?? null);
    addChangedPair(details, 'oldNsfw', 'newNsfw', before.nsfw ?? null, after.nsfw ?? null);
    addChangedPair(details, 'oldSlowmode', 'newSlowmode', before.rateLimitPerUser ?? null, after.rateLimitPerUser ?? null);
    addChangedPair(details, 'oldBitrate', 'newBitrate', before.bitrate ?? null, after.bitrate ?? null);
    addChangedPair(details, 'oldUserLimit', 'newUserLimit', before.userLimit ?? null, after.userLimit ?? null);
    addChangedPair(details, 'oldRtcRegion', 'newRtcRegion', before.rtcRegion ?? null, after.rtcRegion ?? null);

    const overwriteChanges = permissionOverwriteChanges(oldChannel, newChannel);
    if (overwriteChanges.length) details.permissionOverwriteChanges = overwriteChanges;

    if (!Object.keys(details).length) return;

    const actorId = await actorFromAudit(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);
    if (actorId) details.actorRoleIds = roleIds(newChannel.guild.members.cache.get(actorId));

    let summary = `Modificato il canale ${newChannel.name}.`;
    if (overwriteChanges.length && Object.keys(details).filter((key) => !['permissionOverwriteChanges', 'actorRoleIds'].includes(key)).length === 0) {
      summary = `Modificati i permessi del canale ${newChannel.name}.`;
    } else if (nameChanged && Object.keys(details).filter((key) => !['oldName', 'newName', 'actorRoleIds'].includes(key)).length === 0) {
      summary = `Canale rinominato da ${before.name} a ${after.name}.`;
    } else if (parentChanged && Object.keys(details).filter((key) => !['oldParentId', 'newParentId', 'actorRoleIds'].includes(key)).length === 0) {
      summary = `Spostato il canale ${newChannel.name}.`;
    }

    await recordEvent({
      guildId: newChannel.guild.id,
      eventKey: 'channel.update',
      actorId,
      channelId: newChannel.id,
      summary,
      details
    });
  });
  client.on(Events.ChannelDelete, async (channel) => {
    if (!channel.isDMBased()) {
      const actorId = await actorFromAudit(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
      await recordEvent({ guildId: channel.guild.id, eventKey: 'channel.delete', actorId, targetId: channel.id, summary: `Eliminato il canale ${channel.name}.`, details: { name: channel.name, type: channel.type, parentId: channel.parentId } });
    }
  });

  client.on(Events.ChannelPinsUpdate, async (channel, date) => {
    if (channel.isDMBased()) return;
    await recordEvent({
      guildId: channel.guild.id,
      eventKey: 'channel.pins',
      channelId: channel.id,
      targetId: channel.id,
      summary: `Sono cambiati i messaggi fissati in ${channel.name}.`,
      details: { lastPinAt: date?.toISOString?.() ?? null }
    });
  });

  client.on(Events.ThreadCreate, async (thread) => {
    const actorId = await actorFromAudit(thread.guild, AuditLogEvent.ThreadCreate, thread.id);
    await recordEvent({ guildId: thread.guild.id, eventKey: 'thread.create', actorId, targetId: thread.id, channelId: thread.parentId, summary: `Creato il thread ${thread.name}.`, details: { name: thread.name, parentId: thread.parentId, archived: thread.archived, locked: thread.locked } });
  });
  client.on(Events.ThreadUpdate, async (oldThread, newThread) => {
    const actorId = await actorFromAudit(newThread.guild, AuditLogEvent.ThreadUpdate, newThread.id);
    await recordEvent({ guildId: newThread.guild.id, eventKey: 'thread.update', actorId, targetId: newThread.id, channelId: newThread.parentId, summary: `Modificato il thread ${newThread.name}.`, details: { oldName: oldThread.name, newName: newThread.name, oldArchived: oldThread.archived, newArchived: newThread.archived, oldLocked: oldThread.locked, newLocked: newThread.locked } });
  });
  client.on(Events.ThreadDelete, async (thread) => {
    const actorId = await actorFromAudit(thread.guild, AuditLogEvent.ThreadDelete, thread.id);
    await recordEvent({ guildId: thread.guild.id, eventKey: 'thread.delete', actorId, targetId: thread.id, channelId: thread.parentId, summary: `Eliminato il thread ${thread.name}.`, details: { name: thread.name, parentId: thread.parentId } });
  });

  client.on(Events.ThreadMembersUpdate, async (addedMembers, removedMembers, thread) => {
    await recordEvent({
      guildId: thread.guild.id,
      eventKey: 'thread.members_update',
      channelId: thread.id,
      targetId: thread.id,
      summary: `Sono cambiati i membri del thread ${thread.name}.`,
      details: { addedUserIds: [...addedMembers.keys()], removedUserIds: [...removedMembers.keys()], parentId: thread.parentId }
    });
  });


  client.on(Events.ThreadListSync, async (threads, guild) => {
    await recordEvent({
      guildId: guild.id,
      eventKey: 'thread.list_sync',
      targetId: guild.id,
      summary: 'Discord ha sincronizzato i thread accessibili al bot.',
      details: { count: threads.size, threadIds: [...threads.keys()].slice(0, 500) }
    });
  });

  client.on(Events.ThreadMemberUpdate, async (oldMember, newMember) => {
    const thread = newMember.thread;
    await recordEvent({
      guildId: thread.guild.id,
      eventKey: 'thread.member_update',
      actorId: newMember.id,
      targetId: newMember.id,
      channelId: thread.id,
      summary: `È cambiata l’appartenenza di un utente al thread ${thread.name}.`,
      details: { oldFlags: oldMember.flags?.bitfield?.toString?.() ?? null, newFlags: newMember.flags?.bitfield?.toString?.() ?? null }
    });
  });

  client.on(Events.GuildEmojiCreate, async (emoji) => {
    const actorId = await actorFromAudit(emoji.guild, AuditLogEvent.EmojiCreate, emoji.id);
    await recordEvent({ guildId: emoji.guild.id, eventKey: 'emoji.create', actorId, targetId: emoji.id, summary: `Creata l'emoji ${emoji.name ?? emoji.id}.`, details: { name: emoji.name, animated: emoji.animated, url: emoji.imageURL() } });
  });
  client.on(Events.GuildEmojiUpdate, async (oldEmoji, newEmoji) => {
    const actorId = await actorFromAudit(newEmoji.guild, AuditLogEvent.EmojiUpdate, newEmoji.id);
    await recordEvent({ guildId: newEmoji.guild.id, eventKey: 'emoji.update', actorId, targetId: newEmoji.id, summary: `Modificata l'emoji ${newEmoji.name ?? newEmoji.id}.`, details: { oldName: oldEmoji.name, newName: newEmoji.name, url: newEmoji.imageURL() } });
  });
  client.on(Events.GuildEmojiDelete, async (emoji) => {
    const actorId = await actorFromAudit(emoji.guild, AuditLogEvent.EmojiDelete, emoji.id);
    await recordEvent({ guildId: emoji.guild.id, eventKey: 'emoji.delete', actorId, targetId: emoji.id, summary: `Eliminata l'emoji ${emoji.name ?? emoji.id}.`, details: { name: emoji.name } });
  });

  client.on(Events.GuildStickerCreate, async (sticker) => {
    const actorId = await actorFromAudit(sticker.guild!, AuditLogEvent.StickerCreate, sticker.id);
    await recordEvent({ guildId: sticker.guild!.id, eventKey: 'sticker.create', actorId, targetId: sticker.id, summary: `Creato lo sticker ${sticker.name}.`, details: { name: sticker.name, description: sticker.description } });
  });
  client.on(Events.GuildStickerUpdate, async (oldSticker, newSticker) => {
    const guild = newSticker.guild!;
    const actorId = await actorFromAudit(guild, AuditLogEvent.StickerUpdate, newSticker.id);
    await recordEvent({ guildId: guild.id, eventKey: 'sticker.update', actorId, targetId: newSticker.id, summary: `Modificato lo sticker ${newSticker.name}.`, details: { oldName: oldSticker.name, newName: newSticker.name, description: newSticker.description } });
  });
  client.on(Events.GuildStickerDelete, async (sticker) => {
    const guild = sticker.guild!;
    const actorId = await actorFromAudit(guild, AuditLogEvent.StickerDelete, sticker.id);
    await recordEvent({ guildId: guild.id, eventKey: 'sticker.delete', actorId, targetId: sticker.id, summary: `Eliminato lo sticker ${sticker.name}.`, details: { name: sticker.name } });
  });

  client.on(Events.InviteCreate, async (invite) => {
    if (!invite.guild) return;
    const actorId = await actorFromAudit(invite.guild as any, AuditLogEvent.InviteCreate, invite.code);
    await recordEvent({ guildId: invite.guild.id, eventKey: 'invite.create', actorId: actorId ?? invite.inviterId, targetId: invite.code, channelId: invite.channelId, summary: `Creato l'invito ${invite.code}.`, details: { code: invite.code, inviterId: invite.inviterId, maxAge: invite.maxAge, maxUses: invite.maxUses, temporary: invite.temporary } });
  });
  client.on(Events.InviteDelete, async (invite) => {
    if (!invite.guild) return;
    const actorId = await actorFromAudit(invite.guild as any, AuditLogEvent.InviteDelete, invite.code);
    await recordEvent({ guildId: invite.guild.id, eventKey: 'invite.delete', actorId, targetId: invite.code, channelId: invite.channelId, summary: `Eliminato l'invito ${invite.code}.`, details: { code: invite.code } });
  });

  client.on(Events.WebhooksUpdate, async (channel) => {
    await recordEvent({ guildId: channel.guild.id, eventKey: 'webhook.update', channelId: channel.id, summary: `Sono cambiati i webhook di ${channel.name}.`, details: { channelName: channel.name } });
  });

  client.on(Events.GuildIntegrationsUpdate, async (guild) => {
    await recordEvent({ guildId: guild.id, eventKey: 'integration.update', targetId: guild.id, summary: 'Le integrazioni del server sono cambiate.', details: {} });
  });

  client.on(Events.GuildAvailable, async (guild) => {
    if (await isGuildInstallBlocked(guild.id)) {
      await leaveGuild(guild, 'blocked-guild').catch(() => null);
      return;
    }
    await ensureGuild(guild);
    await recordEvent({ guildId: guild.id, eventKey: 'guild.available', targetId: guild.id, summary: `Il server ${guild.name} è tornato disponibile.`, details: {} });
  });

  client.on(Events.GuildUnavailable, async (guild) => {
    await ensureGuild(guild);
    await recordEvent({ guildId: guild.id, eventKey: 'guild.unavailable', targetId: guild.id, summary: `Il server ${guild.name} è temporaneamente non disponibile.`, details: {} });
  });

  client.on(Events.GuildDelete, async (guild) => {
    if (await isGuildInstallBlocked(guild.id)) return;
    await ensureGuild(guild);
    await recordEvent({ guildId: guild.id, eventKey: 'guild.remove', targetId: guild.id, summary: `Il bot non ha più accesso al server ${guild.name}.`, details: {} });
  });

  client.on(Events.GuildUpdate, async (oldGuild, newGuild) => {
    const actorId = await actorFromAudit(newGuild, AuditLogEvent.GuildUpdate, newGuild.id);
    await ensureGuild(newGuild);
    await recordEvent({ guildId: newGuild.id, eventKey: 'guild.update', actorId, targetId: newGuild.id, summary: `Le impostazioni del server ${newGuild.name} sono cambiate.`, details: { oldName: oldGuild.name, newName: newGuild.name, oldIcon: oldGuild.iconURL(), newIcon: newGuild.iconURL(), oldBanner: oldGuild.bannerURL(), newBanner: newGuild.bannerURL(), oldVerificationLevel: oldGuild.verificationLevel, newVerificationLevel: newGuild.verificationLevel } });
  });

  client.on(Events.GuildScheduledEventCreate, async (event) => {
    const actorId = await actorFromAudit(event.guild!, AuditLogEvent.GuildScheduledEventCreate, event.id);
    await recordEvent({ guildId: event.guildId, eventKey: 'scheduled.create', actorId, targetId: event.id, channelId: event.channelId, summary: `Creato l'evento ${event.name}.`, details: { name: event.name, description: event.description, scheduledStartAt: event.scheduledStartAt, scheduledEndAt: event.scheduledEndAt } });
  });
  client.on(Events.GuildScheduledEventUpdate, async (oldEvent, newEvent) => {
    const actorId = await actorFromAudit(newEvent.guild!, AuditLogEvent.GuildScheduledEventUpdate, newEvent.id);
    await recordEvent({ guildId: newEvent.guildId, eventKey: 'scheduled.update', actorId, targetId: newEvent.id, channelId: newEvent.channelId, summary: `Modificato l'evento ${newEvent.name}.`, details: { oldName: oldEvent?.name, newName: newEvent.name, status: newEvent.status, scheduledStartAt: newEvent.scheduledStartAt } });
  });
  client.on(Events.GuildScheduledEventDelete, async (event) => {
    const actorId = await actorFromAudit(event.guild!, AuditLogEvent.GuildScheduledEventDelete, event.id);
    await recordEvent({ guildId: event.guildId, eventKey: 'scheduled.delete', actorId, targetId: event.id, summary: `Eliminato l'evento ${event.name}.`, details: { name: event.name } });
  });

  client.on(Events.GuildScheduledEventUserAdd, async (event, user) => {
    await recordEvent({ guildId: event.guildId, eventKey: 'scheduled.user_add', actorId: user.id, targetId: event.id, channelId: event.channelId, summary: `${user.tag} ha mostrato interesse per ${event.name}.`, details: { eventName: event.name, actorBot: user.bot } });
  });

  client.on(Events.GuildScheduledEventUserRemove, async (event, user) => {
    await recordEvent({ guildId: event.guildId, eventKey: 'scheduled.user_remove', actorId: user.id, targetId: event.id, channelId: event.channelId, summary: `${user.tag} ha rimosso l’interesse per ${event.name}.`, details: { eventName: event.name, actorBot: user.bot } });
  });

  client.on(Events.AutoModerationRuleCreate, async (rule) => {
    await recordEvent({ guildId: rule.guild.id, eventKey: 'automod.rule_create', actorId: rule.creatorId, targetId: rule.id, summary: `Creata la regola AutoMod ${rule.name}.`, details: { name: rule.name, enabled: rule.enabled, eventType: rule.eventType, triggerType: rule.triggerType } });
  });
  client.on(Events.AutoModerationRuleUpdate, async (oldRule, newRule) => {
    const actorId = await actorFromAudit(newRule.guild, AuditLogEvent.AutoModerationRuleUpdate, newRule.id);
    await recordEvent({ guildId: newRule.guild.id, eventKey: 'automod.rule_update', actorId, targetId: newRule.id, summary: `Modificata la regola AutoMod ${newRule.name}.`, details: { oldName: oldRule?.name ?? null, newName: newRule.name, enabled: newRule.enabled } });
  });
  client.on(Events.AutoModerationRuleDelete, async (rule) => {
    const actorId = await actorFromAudit(rule.guild, AuditLogEvent.AutoModerationRuleDelete, rule.id);
    await recordEvent({ guildId: rule.guild.id, eventKey: 'automod.rule_delete', actorId, targetId: rule.id, summary: `Eliminata la regola AutoMod ${rule.name}.`, details: { name: rule.name } });
  });
  client.on(Events.AutoModerationActionExecution, async (execution) => {
    const settings = await getGuildSettings(execution.guild.id);
    await recordEvent({ guildId: execution.guild.id, eventKey: 'automod.action', actorId: execution.userId, targetId: execution.ruleId, channelId: execution.channelId, summary: 'È stata eseguita un’azione AutoMod.', details: { action: execution.action, ruleId: execution.ruleId, ruleTriggerType: execution.ruleTriggerType, matchedKeyword: execution.matchedKeyword, matchedContent: settings?.storeMessageContent ? execution.matchedContent : null, content: settings?.storeMessageContent ? execution.content : null } });
  });

  client.on(Events.StageInstanceCreate, async (stage) => {
    const actorId = await actorFromAudit(stage.guild!, AuditLogEvent.StageInstanceCreate, stage.id);
    await recordEvent({ guildId: stage.guildId, eventKey: 'stage.create', actorId, targetId: stage.id, channelId: stage.channelId, summary: 'È stata aperta una Stage.', details: { topic: stage.topic, privacyLevel: stage.privacyLevel } });
  });
  client.on(Events.StageInstanceUpdate, async (oldStage, newStage) => {
    const actorId = await actorFromAudit(newStage.guild!, AuditLogEvent.StageInstanceUpdate, newStage.id);
    await recordEvent({ guildId: newStage.guildId, eventKey: 'stage.update', actorId, targetId: newStage.id, channelId: newStage.channelId, summary: 'È stata modificata una Stage.', details: { oldTopic: oldStage?.topic ?? null, newTopic: newStage.topic, privacyLevel: newStage.privacyLevel } });
  });
  client.on(Events.StageInstanceDelete, async (stage) => {
    const actorId = await actorFromAudit(stage.guild!, AuditLogEvent.StageInstanceDelete, stage.id);
    await recordEvent({ guildId: stage.guildId, eventKey: 'stage.delete', actorId, targetId: stage.id, channelId: stage.channelId, summary: 'È stata chiusa una Stage.', details: { topic: stage.topic } });
  });

  client.on(Events.GuildSoundboardSoundCreate, async (sound) => {
    const actorId = await actorFromAudit(sound.guild, AuditLogEvent.SoundboardSoundCreate, sound.soundId);
    await recordEvent({ guildId: sound.guildId, eventKey: 'soundboard.create', actorId, targetId: sound.soundId, summary: `Creato il suono ${sound.name}.`, details: { name: sound.name, volume: sound.volume, emoji: sound.emoji?.toString() ?? null, url: sound.url } });
  });

  client.on(Events.GuildSoundboardSoundUpdate, async (oldSound, newSound) => {
    const actorId = await actorFromAudit(newSound.guild, AuditLogEvent.SoundboardSoundUpdate, newSound.soundId);
    await recordEvent({ guildId: newSound.guildId, eventKey: 'soundboard.update', actorId, targetId: newSound.soundId, summary: `Modificato il suono ${newSound.name}.`, details: { oldName: oldSound?.name ?? null, newName: newSound.name, oldVolume: oldSound?.volume ?? null, newVolume: newSound.volume, emoji: newSound.emoji?.toString() ?? null } });
  });

  client.on(Events.GuildSoundboardSoundDelete, async (sound) => {
    const item = sound as any;
    const guild = item.guild;
    const guildId = item.guildId ?? guild?.id ?? null;
    if (!guild || !guildId) return;
    const actorId = await actorFromAudit(guild, AuditLogEvent.SoundboardSoundDelete, String(item.soundId));
    await recordEvent({ guildId, eventKey: 'soundboard.delete', actorId, targetId: String(item.soundId), summary: `Eliminato il suono ${item.name}.`, details: { name: item.name } });
  });

  client.on(Events.GuildSoundboardSoundsUpdate, async (sounds, guild) => {
    await recordEvent({ guildId: guild.id, eventKey: 'soundboard.sync', targetId: guild.id, summary: 'L’elenco soundboard del server è stato aggiornato.', details: { count: sounds.size, soundIds: [...sounds.keys()] } });
  });


  client.on(Events.ApplicationCommandPermissionsUpdate, async (data) => {
    await recordEvent({
      guildId: data.guildId,
      eventKey: 'application.permissions_update',
      targetId: data.id,
      summary: 'Sono cambiati i permessi di un comando o entita applicazione.',
      details: {
        applicationId: data.applicationId,
        commandOrEntityId: data.id,
        permissions: data.permissions.map((permission) => ({ id: permission.id, type: permission.type, permission: permission.permission }))
      }
    });
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.guildId || interaction.user.id === client.user?.id) return;

    if (interaction.isChatInputCommand()) {
      const path = commandPath(interaction);
      await recordEvent({
        guildId: interaction.guildId,
        eventKey: 'command.use',
        actorId: interaction.user.id,
        channelId: interaction.channelId,
        summary: `${interaction.user.tag} ha usato ${path} con Sentinel.`,
        details: {
          commandPath: path,
          botUserId: client.user?.id ?? null,
          applicationId: interaction.applicationId,
          commandId: interaction.commandId,
          source: 'direct',
          actorBot: interaction.user.bot,
          actorRoleIds: (interaction.member as any)?.roles?.cache ? [...(interaction.member as any).roles.cache.keys()] : []
        }
      });
      return;
    }

    const item = interaction as any;
    await recordEvent({
      guildId: interaction.guildId,
      eventKey: 'interaction.create',
      actorId: interaction.user.id,
      targetId: item.customId ?? null,
      channelId: interaction.channelId,
      summary: `${interaction.user.tag} ha usato un’interazione di Sentinel.`,
      details: {
        kind: interaction.type,
        customId: item.customId ?? null,
        actorBot: interaction.user.bot,
        actorRoleIds: (interaction.member as any)?.roles?.cache ? [...(interaction.member as any).roles.cache.keys()] : []
      }
    });
  });

  client.on(Events.UserUpdate, async (oldUser, newUser) => {
    for (const guild of client.guilds.cache.values()) {
      const member = guild.members.cache.get(newUser.id);
      if (!member) continue;
      await recordEvent({
        guildId: guild.id,
        eventKey: 'user.update',
        actorId: newUser.id,
        targetId: newUser.id,
        summary: `Il profilo Discord di ${newUser.tag} è cambiato.`,
        details: { oldUsername: oldUser.username, newUsername: newUser.username, oldAvatar: oldUser.avatarURL(), newAvatar: newUser.avatarURL(), actorBot: newUser.bot, actorRoleIds: roleIds(member) }
      });
    }
  });

  client.on(Events.GuildAuditLogEntryCreate, async (entry, guild) => {
    if (entry.executorId === client.user?.id) return;
    await recordEvent({
      guildId: guild.id,
      eventKey: 'audit.entry',
      actorId: entry.executorId ?? null,
      targetId: entry.targetId ?? null,
      summary: `Nuova voce Audit Log: ${String(entry.action)}.`,
      details: { action: entry.action, reason: entry.reason, changes: jsonSafe(entry.changes ?? []), extra: jsonSafe(entry.extra ?? null) }
    });
  });

  client.on(Events.PresenceUpdate, async (oldPresence, newPresence) => {
    const guild = newPresence.guild;
    if (!guild) return;
    const settings = await getGuildSettings(guild.id);
    if (!settings?.presenceLoggingEnabled || !newPresence.userId) return;
    await recordEvent({ guildId: guild.id, eventKey: 'presence.update', actorId: newPresence.userId, targetId: newPresence.userId, summary: `Presenza modificata per ${newPresence.user?.tag ?? newPresence.userId}.`, details: { oldStatus: oldPresence?.status ?? null, newStatus: newPresence.status, activities: newPresence.activities.map((a) => ({ name: a.name, type: a.type, state: a.state })) } });
  });

  client.on(Events.TypingStart, async (typing) => {
    if (!typing.guild) return;
    const settings = await getGuildSettings(typing.guild.id);
    if (!settings?.typingLoggingEnabled || typing.user.id === client.user?.id) return;
    await recordEvent({ guildId: typing.guild.id, eventKey: 'typing.start', actorId: typing.user.id, channelId: typing.channel.id, summary: `${typing.user.tag} ha iniziato a scrivere.`, details: { actorBot: typing.user.bot } });
  });

  client.on(Events.Raw, async (packet) => {
    const guildId = packet?.d?.guild_id as string | undefined;
    if (!guildId) return;
    if (packet.t === 'MESSAGE_CREATE' && packet.d?.author?.id === client.user?.id) return;
    const settings = await getGuildSettings(guildId);
    if (!settings?.rawGatewayEnabled) return;
    let data = redactSecrets(jsonSafe(packet.d));
    if (!settings.storeMessageContent && data && typeof data === 'object' && !Array.isArray(data) && (packet.t === 'MESSAGE_CREATE' || packet.t === 'MESSAGE_UPDATE')) {
      const redacted = { ...(data as Record<string, unknown>) };
      delete redacted.content;
      delete redacted.embeds;
      data = redacted;
    }
    await recordEvent({ guildId, eventKey: 'raw.gateway', actorId: packet.d?.user_id ?? packet.d?.author?.id ?? null, targetId: packet.d?.id ?? null, channelId: packet.d?.channel_id ?? null, summary: `Gateway event ${packet.t ?? 'UNKNOWN'}.`, details: { opcode: packet.op, type: packet.t, sequence: packet.s, data } });
  });
}
