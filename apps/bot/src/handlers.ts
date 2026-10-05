import {
  AuditLogEvent,
  Events,
  InteractionType,
  type Client,
  type ClientEvents,
  type Guild,
  type GuildMember,
  type Message,
  type PartialMessage
} from 'discord.js';
import { prisma } from '@sentinel/db';
import { ensureGuild, getGuildSettings, isGuildInstallBlocked, isUserInstallBlocked, snapshotMessage } from './store.js';
import { recordEvent, shouldCapture } from './recorder.js';
import { findRecentAuditEntry, jsonSafe, redactSecrets } from './utils.js';
import { decryptText, redactText, unprotectJson } from './security.js';
import { leaveGuild } from './discord-actions.js';
import { logger } from './logger.js';
import {
  addChangedPair,
  guildChanges,
  isAuthorEdit,
  permissionOverwriteChanges,
  roleChanges,
  sameAttachments,
  threadChanges
} from './diff.js';

const roleIds = (member: GuildMember | null | undefined | any): string[] => member?.roles?.cache ? [...member.roles.cache.keys()] : [];

/**
 * Resolves the moderator behind an action through the Audit Log, but only when
 * the event will actually be stored: the lookup waits ~700 ms and costs a REST
 * call, which is wasted (and rate-limited) for disabled loggers.
 */
const actorFromAudit = async (eventKey: string, guild: Guild | null | undefined, type: AuditLogEvent, targetId?: string) => {
  if (!guild || !(await shouldCapture(guild.id, eventKey))) return null;
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
  // Every handler is async: without this wrapper a single failure (database
  // hiccup, missing partial) becomes an anonymous unhandled rejection.
  const report = (event: string, error: unknown) => {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    logger.error({ event, error: redactText(message) }, 'Gateway handler failed');
  };
  const on = <Event extends keyof ClientEvents>(event: Event, handler: (...args: ClientEvents[Event]) => Promise<unknown>) => {
    client.on(event, (...args: ClientEvents[Event]) => {
      handler(...args).catch((error: unknown) => report(event, error));
    });
  };

  on(Events.GuildCreate, async (guild) => {
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

  on(Events.GuildMemberAdd, async (member) => {
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

  on(Events.GuildMemberRemove, async (member) => {
    const [kickCaptured, leaveCaptured] = await Promise.all([
      shouldCapture(member.guild.id, 'moderation.kick'),
      shouldCapture(member.guild.id, 'member.leave')
    ]);
    if (!kickCaptured && !leaveCaptured) return;
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

  on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    const oldRoles = roleIds(oldMember);
    const newRoles = roleIds(newMember);
    const addedRoles = newRoles.filter((id) => !oldRoles.includes(id));
    const removedRoles = oldRoles.filter((id) => !newRoles.includes(id));
    const rolesChanged = addedRoles.length > 0 || removedRoles.length > 0;
    const details: Record<string, unknown> = {};

    // A partial old member has no reliable previous state: only role changes
    // can be derived safely from it.
    if (!oldMember.partial) {
      addChangedPair(details, 'oldNickname', 'newNickname', oldMember.nickname, newMember.nickname);
      addChangedPair(details, 'oldTimeout', 'newTimeout', oldMember.communicationDisabledUntil?.toISOString() ?? null, newMember.communicationDisabledUntil?.toISOString() ?? null);
      addChangedPair(details, 'oldBoostSince', 'newBoostSince', oldMember.premiumSince?.toISOString() ?? null, newMember.premiumSince?.toISOString() ?? null);
      addChangedPair(details, 'oldPending', 'newPending', oldMember.pending, newMember.pending);
    }
    if (!oldMember.partial || oldRoles.length) {
      if (addedRoles.length) details.addedRoles = addedRoles;
      if (removedRoles.length) details.removedRoles = removedRoles;
    }

    if (!Object.keys(details).length) return;

    const type = rolesChanged ? AuditLogEvent.MemberRoleUpdate : AuditLogEvent.MemberUpdate;
    const actorId = await actorFromAudit('member.update', newMember.guild, type, newMember.id);
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

  on(Events.GuildBanAdd, async (ban) => {
    if (!(await shouldCapture(ban.guild.id, 'moderation.ban'))) return;
    const entry = await findRecentAuditEntry(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
    await recordEvent({
      guildId: ban.guild.id,
      eventKey: 'moderation.ban',
      actorId: entry?.executorId ?? null,
      targetId: ban.user.id,
      summary: `${ban.user.tag} è stato bannato.`,
      details: { reason: entry?.reason ?? ban.reason ?? null, username: ban.user.tag, actorBot: entry?.executor?.bot ?? false }
    });
  });

  on(Events.GuildBanRemove, async (ban) => {
    if (!(await shouldCapture(ban.guild.id, 'moderation.unban'))) return;
    const entry = await findRecentAuditEntry(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
    await recordEvent({
      guildId: ban.guild.id,
      eventKey: 'moderation.unban',
      actorId: entry?.executorId ?? null,
      targetId: ban.user.id,
      summary: `Il ban di ${ban.user.tag} è stato rimosso.`,
      details: { username: ban.user.tag, actorBot: entry?.executor?.bot ?? false }
    });
  });

  on(Events.MessageCreate, async (message) => {
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

  on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    if (!newMessage.guildId || newMessage.author?.id === client.user?.id) return;
    if (newMessage.partial) {
      const fetched = await newMessage.fetch().catch(() => null);
      if (!fetched) return;
    }
    if (!newMessage.author || newMessage.author.id === client.user?.id) return;

    // Link-embed resolution, pins and component refreshes also emit
    // MESSAGE_UPDATE; they must neither be logged nor overwrite the snapshot
    // that holds the author's last real version.
    if (!isAuthorEdit(oldMessage, newMessage)) return;

    const before = await prisma.messageSnapshot.findUnique({ where: { messageId: newMessage.id } });
    const settings = await getGuildSettings(newMessage.guildId);
    await snapshotMessage(newMessage as Message);

    const previousContent = decryptText(before?.content) ?? (oldMessage.partial ? null : oldMessage.content) ?? null;
    const previousAttachments = before ? unprotectJson(before.attachments) : (oldMessage.partial ? null : attachmentData(oldMessage));
    const currentAttachments = attachmentData(newMessage);
    const contentKnown = previousContent !== null;
    const contentChanged = contentKnown && previousContent !== (newMessage.content ?? '');
    const attachmentsChanged = previousAttachments !== null && !sameAttachments(previousAttachments, currentAttachments);
    if (contentKnown && !contentChanged && !attachmentsChanged) return;

    await recordEvent({
      guildId: newMessage.guildId,
      eventKey: 'message.edit',
      actorId: newMessage.author.id,
      targetId: newMessage.id,
      channelId: newMessage.channelId,
      summary: `${newMessage.author.tag} ha modificato un messaggio.`,
      details: {
        oldContent: settings?.storeMessageContent ? previousContent : null,
        newContent: settings?.storeMessageContent ? (newMessage.content ?? null) : null,
        attachments: currentAttachments,
        messageId: newMessage.id,
        actorBot: newMessage.author.bot,
        actorRoleIds: roleIds(newMessage.member)
      }
    });
  });

  on(Events.MessageDelete, async (message) => {
    if (!message.guildId) return;
    const snapshot = await prisma.messageSnapshot.findUnique({ where: { messageId: message.id } });
    if (snapshot?.authorId === client.user?.id || message.author?.id === client.user?.id) return;
    const settings = await getGuildSettings(message.guildId);
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

  on(Events.MessageBulkDelete, async (messages, channel) => {
    const ids = [...messages.keys()];
    await recordEvent({
      guildId: channel.guild.id,
      eventKey: 'message.bulk_delete',
      channelId: channel.id,
      summary: `Sono stati eliminati ${messages.size} messaggi.`,
      details: { count: messages.size, messageIds: ids.slice(0, 100) }
    });
  });

  on(Events.MessageReactionAdd, async (reaction, user) => {
    if (!reaction.message.guildId || user.id === client.user?.id) return;
    await recordEvent({
      guildId: reaction.message.guildId,
      eventKey: 'reaction.add',
      actorId: user.id,
      targetId: reaction.message.id,
      channelId: reaction.message.channelId,
      summary: `${user.tag ?? user.id} ha aggiunto una reaction.`,
      details: { emoji: reaction.emoji.toString(), actorBot: user.bot ?? false }
    });
  });

  on(Events.MessageReactionRemove, async (reaction, user) => {
    if (!reaction.message.guildId || user.id === client.user?.id) return;
    await recordEvent({
      guildId: reaction.message.guildId,
      eventKey: 'reaction.remove',
      actorId: user.id,
      targetId: reaction.message.id,
      channelId: reaction.message.channelId,
      summary: `${user.tag ?? user.id} ha rimosso una reaction.`,
      details: { emoji: reaction.emoji.toString(), actorBot: user.bot ?? false }
    });
  });

  on(Events.MessageReactionRemoveAll, async (message, reactions) => {
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

  on(Events.MessageReactionRemoveEmoji, async (reaction) => {
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

  on(Events.MessagePollVoteAdd, async (pollAnswer, userId) => {
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

  on(Events.MessagePollVoteRemove, async (pollAnswer, userId) => {
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

  on(Events.VoiceStateUpdate, async (oldState, newState) => {
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

    // Joins and leaves carry the full state in newState/oldState: diffing it
    // against "null" would report every flag as a change.
    if (eventKey === 'voice.state' || eventKey === 'voice.move') {
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
        if (before !== null && after !== null && before !== after) details[key] = after;
      }
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

  on(Events.VoiceServerUpdate, async (data) => {
    await recordEvent({
      guildId: data.guildId,
      eventKey: 'voice.server_update',
      targetId: data.guildId,
      summary: 'Discord ha aggiornato il voice server.',
      details: { endpoint: data.endpoint }
    });
  });

  on(Events.VoiceChannelEffectSend, async (effect) => {
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

  on(Events.GuildRoleCreate, async (role) => {
    const actorId = await actorFromAudit('role.create', role.guild, AuditLogEvent.RoleCreate, role.id);
    await recordEvent({ guildId: role.guild.id, eventKey: 'role.create', actorId, targetId: role.id, summary: `Creato il ruolo ${role.name}.`, details: { name: role.name, color: role.hexColor, permissions: role.permissions.toArray() } });
  });
  on(Events.GuildRoleUpdate, async (oldRole, newRole) => {
    const details = roleChanges(oldRole, newRole);
    if (!Object.keys(details).length) return;
    const actorId = await actorFromAudit('role.update', newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
    await recordEvent({ guildId: newRole.guild.id, eventKey: 'role.update', actorId, targetId: newRole.id, summary: `Modificato il ruolo ${newRole.name}.`, details });
  });
  on(Events.GuildRoleDelete, async (role) => {
    const actorId = await actorFromAudit('role.delete', role.guild, AuditLogEvent.RoleDelete, role.id);
    await recordEvent({ guildId: role.guild.id, eventKey: 'role.delete', actorId, targetId: role.id, summary: `Eliminato il ruolo ${role.name}.`, details: { name: role.name, color: role.hexColor, permissions: role.permissions.toArray() } });
  });

  on(Events.ChannelCreate, async (channel) => {
    if (channel.isDMBased()) return;
    const actorId = await actorFromAudit('channel.create', channel.guild, AuditLogEvent.ChannelCreate, channel.id);
    await recordEvent({ guildId: channel.guild.id, eventKey: 'channel.create', actorId, targetId: channel.id, channelId: channel.id, summary: `Creato il canale ${channel.name}.`, details: { name: channel.name, type: channel.type, parentId: channel.parentId } });
  });
  on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
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

    const actorId = await actorFromAudit('channel.update', newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);
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
      targetId: newChannel.id,
      channelId: newChannel.id,
      summary,
      details
    });
  });
  on(Events.ChannelDelete, async (channel) => {
    if (channel.isDMBased()) return;
    const actorId = await actorFromAudit('channel.delete', channel.guild, AuditLogEvent.ChannelDelete, channel.id);
    await recordEvent({ guildId: channel.guild.id, eventKey: 'channel.delete', actorId, targetId: channel.id, summary: `Eliminato il canale ${channel.name}.`, details: { name: channel.name, type: channel.type, parentId: channel.parentId } });
  });

  on(Events.ChannelPinsUpdate, async (channel, date) => {
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

  on(Events.ThreadCreate, async (thread, newlyCreated) => {
    // ThreadCreate also fires when the bot merely gains access to an existing
    // thread (e.g. it gets added to a private thread).
    if (!newlyCreated) return;
    const actorId = thread.ownerId ?? await actorFromAudit('thread.create', thread.guild, AuditLogEvent.ThreadCreate, thread.id);
    await recordEvent({ guildId: thread.guild.id, eventKey: 'thread.create', actorId, targetId: thread.id, channelId: thread.parentId, summary: `Creato il thread ${thread.name}.`, details: { name: thread.name, parentId: thread.parentId, archived: thread.archived, locked: thread.locked } });
  });
  on(Events.ThreadUpdate, async (oldThread, newThread) => {
    const details = threadChanges(oldThread, newThread);
    if (!Object.keys(details).length) return;
    const actorId = await actorFromAudit('thread.update', newThread.guild, AuditLogEvent.ThreadUpdate, newThread.id);
    await recordEvent({ guildId: newThread.guild.id, eventKey: 'thread.update', actorId, targetId: newThread.id, channelId: newThread.parentId, summary: `Modificato il thread ${newThread.name}.`, details });
  });
  on(Events.ThreadDelete, async (thread) => {
    const actorId = await actorFromAudit('thread.delete', thread.guild, AuditLogEvent.ThreadDelete, thread.id);
    await recordEvent({ guildId: thread.guild.id, eventKey: 'thread.delete', actorId, targetId: thread.id, channelId: thread.parentId, summary: `Eliminato il thread ${thread.name}.`, details: { name: thread.name, parentId: thread.parentId } });
  });

  on(Events.ThreadMembersUpdate, async (addedMembers, removedMembers, thread) => {
    await recordEvent({
      guildId: thread.guild.id,
      eventKey: 'thread.members_update',
      channelId: thread.id,
      targetId: thread.id,
      summary: `Sono cambiati i membri del thread ${thread.name}.`,
      details: { addedUserIds: [...addedMembers.keys()], removedUserIds: [...removedMembers.keys()], parentId: thread.parentId }
    });
  });

  on(Events.ThreadListSync, async (threads, guild) => {
    await recordEvent({
      guildId: guild.id,
      eventKey: 'thread.list_sync',
      targetId: guild.id,
      summary: 'Discord ha sincronizzato i thread accessibili al bot.',
      details: { count: threads.size, threadIds: [...threads.keys()].slice(0, 500) }
    });
  });

  on(Events.ThreadMemberUpdate, async (oldMember, newMember) => {
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

  on(Events.GuildEmojiCreate, async (emoji) => {
    const actorId = await actorFromAudit('emoji.create', emoji.guild, AuditLogEvent.EmojiCreate, emoji.id);
    await recordEvent({ guildId: emoji.guild.id, eventKey: 'emoji.create', actorId, targetId: emoji.id, summary: `Creata l'emoji ${emoji.name ?? emoji.id}.`, details: { name: emoji.name, animated: emoji.animated, url: emoji.imageURL() } });
  });
  on(Events.GuildEmojiUpdate, async (oldEmoji, newEmoji) => {
    if (oldEmoji.name === newEmoji.name) return;
    const actorId = await actorFromAudit('emoji.update', newEmoji.guild, AuditLogEvent.EmojiUpdate, newEmoji.id);
    await recordEvent({ guildId: newEmoji.guild.id, eventKey: 'emoji.update', actorId, targetId: newEmoji.id, summary: `Modificata l'emoji ${newEmoji.name ?? newEmoji.id}.`, details: { oldName: oldEmoji.name, newName: newEmoji.name, url: newEmoji.imageURL() } });
  });
  on(Events.GuildEmojiDelete, async (emoji) => {
    const actorId = await actorFromAudit('emoji.delete', emoji.guild, AuditLogEvent.EmojiDelete, emoji.id);
    await recordEvent({ guildId: emoji.guild.id, eventKey: 'emoji.delete', actorId, targetId: emoji.id, summary: `Eliminata l'emoji ${emoji.name ?? emoji.id}.`, details: { name: emoji.name } });
  });

  on(Events.GuildStickerCreate, async (sticker) => {
    const guild = sticker.guild;
    if (!guild) return;
    const actorId = await actorFromAudit('sticker.create', guild, AuditLogEvent.StickerCreate, sticker.id);
    await recordEvent({ guildId: guild.id, eventKey: 'sticker.create', actorId, targetId: sticker.id, summary: `Creato lo sticker ${sticker.name}.`, details: { name: sticker.name, description: sticker.description } });
  });
  on(Events.GuildStickerUpdate, async (oldSticker, newSticker) => {
    const guild = newSticker.guild;
    if (!guild) return;
    const details: Record<string, unknown> = {};
    addChangedPair(details, 'oldName', 'newName', oldSticker.name, newSticker.name);
    addChangedPair(details, 'oldDescription', 'newDescription', oldSticker.description, newSticker.description);
    addChangedPair(details, 'oldTags', 'newTags', oldSticker.tags, newSticker.tags);
    if (!Object.keys(details).length) return;
    const actorId = await actorFromAudit('sticker.update', guild, AuditLogEvent.StickerUpdate, newSticker.id);
    await recordEvent({ guildId: guild.id, eventKey: 'sticker.update', actorId, targetId: newSticker.id, summary: `Modificato lo sticker ${newSticker.name}.`, details });
  });
  on(Events.GuildStickerDelete, async (sticker) => {
    const guild = sticker.guild;
    if (!guild) return;
    const actorId = await actorFromAudit('sticker.delete', guild, AuditLogEvent.StickerDelete, sticker.id);
    await recordEvent({ guildId: guild.id, eventKey: 'sticker.delete', actorId, targetId: sticker.id, summary: `Eliminato lo sticker ${sticker.name}.`, details: { name: sticker.name } });
  });

  on(Events.InviteCreate, async (invite) => {
    if (!invite.guild) return;
    // The Gateway already says who created the invite; the Audit Log is only a
    // fallback for invites created by integrations without an inviter.
    const actorId = invite.inviterId ?? await actorFromAudit('invite.create', client.guilds.cache.get(invite.guild.id), AuditLogEvent.InviteCreate, invite.code);
    await recordEvent({ guildId: invite.guild.id, eventKey: 'invite.create', actorId, targetId: invite.code, channelId: invite.channelId, summary: `Creato l'invito ${invite.code}.`, details: { code: invite.code, inviterId: invite.inviterId, maxAge: invite.maxAge, maxUses: invite.maxUses, temporary: invite.temporary } });
  });
  on(Events.InviteDelete, async (invite) => {
    if (!invite.guild) return;
    const actorId = await actorFromAudit('invite.delete', client.guilds.cache.get(invite.guild.id), AuditLogEvent.InviteDelete, invite.code);
    await recordEvent({ guildId: invite.guild.id, eventKey: 'invite.delete', actorId, targetId: invite.code, channelId: invite.channelId, summary: `Eliminato l'invito ${invite.code}.`, details: { code: invite.code } });
  });

  on(Events.WebhooksUpdate, async (channel) => {
    await recordEvent({ guildId: channel.guild.id, eventKey: 'webhook.update', channelId: channel.id, summary: `Sono cambiati i webhook di ${channel.name}.`, details: { channelName: channel.name } });
  });

  on(Events.GuildIntegrationsUpdate, async (guild) => {
    await recordEvent({ guildId: guild.id, eventKey: 'integration.update', targetId: guild.id, summary: 'Le integrazioni del server sono cambiate.', details: {} });
  });

  on(Events.GuildAvailable, async (guild) => {
    if (await isGuildInstallBlocked(guild.id)) {
      await leaveGuild(guild, 'blocked-guild').catch(() => null);
      return;
    }
    await ensureGuild(guild);
    await recordEvent({ guildId: guild.id, eventKey: 'guild.available', targetId: guild.id, summary: `Il server ${guild.name} è tornato disponibile.`, details: {} });
  });

  on(Events.GuildUnavailable, async (guild) => {
    const exists = await prisma.guildSettings.findUnique({ where: { guildId: guild.id }, select: { guildId: true } });
    if (!exists) return;
    await recordEvent({ guildId: guild.id, eventKey: 'guild.unavailable', targetId: guild.id, summary: `Il server ${guild.name ?? guild.id} è temporaneamente non disponibile.`, details: {} });
  });

  on(Events.GuildDelete, async (guild) => {
    if (await isGuildInstallBlocked(guild.id)) return;
    const exists = await prisma.guildSettings.findUnique({ where: { guildId: guild.id }, select: { guildId: true } });
    if (!exists) return;
    await recordEvent({ guildId: guild.id, eventKey: 'guild.remove', targetId: guild.id, summary: `Il bot non ha più accesso al server ${guild.name ?? guild.id}.`, details: {} });
  });

  on(Events.GuildUpdate, async (oldGuild, newGuild) => {
    const details = guildChanges(oldGuild, newGuild);
    if (!Object.keys(details).length) return;
    await ensureGuild(newGuild);
    const actorId = await actorFromAudit('guild.update', newGuild, AuditLogEvent.GuildUpdate, newGuild.id);
    await recordEvent({ guildId: newGuild.id, eventKey: 'guild.update', actorId, targetId: newGuild.id, summary: `Le impostazioni del server ${newGuild.name} sono cambiate.`, details });
  });

  on(Events.GuildScheduledEventCreate, async (event) => {
    if (!event.guildId) return;
    const actorId = event.creatorId ?? await actorFromAudit('scheduled.create', event.guild, AuditLogEvent.GuildScheduledEventCreate, event.id);
    await recordEvent({ guildId: event.guildId, eventKey: 'scheduled.create', actorId, targetId: event.id, channelId: event.channelId, summary: `Creato l'evento ${event.name}.`, details: { name: event.name, description: event.description, scheduledStartAt: event.scheduledStartAt, scheduledEndAt: event.scheduledEndAt } });
  });
  on(Events.GuildScheduledEventUpdate, async (oldEvent, newEvent) => {
    if (!newEvent.guildId) return;
    const details: Record<string, unknown> = {};
    addChangedPair(details, 'oldName', 'newName', oldEvent?.name ?? null, newEvent.name);
    addChangedPair(details, 'oldDescription', 'newDescription', oldEvent?.description ?? null, newEvent.description);
    addChangedPair(details, 'oldStatus', 'newStatus', oldEvent?.status ?? null, newEvent.status);
    addChangedPair(details, 'oldChannelId', 'newChannelId', oldEvent?.channelId ?? null, newEvent.channelId);
    addChangedPair(details, 'oldStartAt', 'newStartAt', oldEvent?.scheduledStartAt?.toISOString() ?? null, newEvent.scheduledStartAt?.toISOString() ?? null);
    addChangedPair(details, 'oldEndAt', 'newEndAt', oldEvent?.scheduledEndAt?.toISOString() ?? null, newEvent.scheduledEndAt?.toISOString() ?? null);
    // userCount-only refreshes are not edits.
    if (!Object.keys(details).length) return;
    const actorId = await actorFromAudit('scheduled.update', newEvent.guild, AuditLogEvent.GuildScheduledEventUpdate, newEvent.id);
    await recordEvent({ guildId: newEvent.guildId, eventKey: 'scheduled.update', actorId, targetId: newEvent.id, channelId: newEvent.channelId, summary: `Modificato l'evento ${newEvent.name}.`, details });
  });
  on(Events.GuildScheduledEventDelete, async (event) => {
    if (!event.guildId) return;
    const actorId = await actorFromAudit('scheduled.delete', event.guild, AuditLogEvent.GuildScheduledEventDelete, event.id);
    await recordEvent({ guildId: event.guildId, eventKey: 'scheduled.delete', actorId, targetId: event.id, summary: `Eliminato l'evento ${event.name}.`, details: { name: event.name } });
  });

  on(Events.GuildScheduledEventUserAdd, async (event, user) => {
    if (!event.guildId) return;
    await recordEvent({ guildId: event.guildId, eventKey: 'scheduled.user_add', actorId: user.id, targetId: event.id, channelId: event.channelId, summary: `${user.tag} ha mostrato interesse per ${event.name}.`, details: { eventName: event.name, actorBot: user.bot } });
  });

  on(Events.GuildScheduledEventUserRemove, async (event, user) => {
    if (!event.guildId) return;
    await recordEvent({ guildId: event.guildId, eventKey: 'scheduled.user_remove', actorId: user.id, targetId: event.id, channelId: event.channelId, summary: `${user.tag} ha rimosso l’interesse per ${event.name}.`, details: { eventName: event.name, actorBot: user.bot } });
  });

  on(Events.AutoModerationRuleCreate, async (rule) => {
    await recordEvent({ guildId: rule.guild.id, eventKey: 'automod.rule_create', actorId: rule.creatorId, targetId: rule.id, summary: `Creata la regola AutoMod ${rule.name}.`, details: { name: rule.name, enabled: rule.enabled, eventType: rule.eventType, triggerType: rule.triggerType } });
  });
  on(Events.AutoModerationRuleUpdate, async (oldRule, newRule) => {
    const actorId = await actorFromAudit('automod.rule_update', newRule.guild, AuditLogEvent.AutoModerationRuleUpdate, newRule.id);
    await recordEvent({ guildId: newRule.guild.id, eventKey: 'automod.rule_update', actorId, targetId: newRule.id, summary: `Modificata la regola AutoMod ${newRule.name}.`, details: { oldName: oldRule?.name ?? null, newName: newRule.name, oldEnabled: oldRule?.enabled ?? null, newEnabled: newRule.enabled } });
  });
  on(Events.AutoModerationRuleDelete, async (rule) => {
    const actorId = await actorFromAudit('automod.rule_delete', rule.guild, AuditLogEvent.AutoModerationRuleDelete, rule.id);
    await recordEvent({ guildId: rule.guild.id, eventKey: 'automod.rule_delete', actorId, targetId: rule.id, summary: `Eliminata la regola AutoMod ${rule.name}.`, details: { name: rule.name } });
  });
  on(Events.AutoModerationActionExecution, async (execution) => {
    const settings = await getGuildSettings(execution.guild.id);
    await recordEvent({ guildId: execution.guild.id, eventKey: 'automod.action', actorId: execution.userId, targetId: execution.ruleId, channelId: execution.channelId, summary: 'È stata eseguita un’azione AutoMod.', details: { action: execution.action, ruleId: execution.ruleId, ruleTriggerType: execution.ruleTriggerType, matchedKeyword: execution.matchedKeyword, matchedContent: settings?.storeMessageContent ? execution.matchedContent : null, content: settings?.storeMessageContent ? execution.content : null } });
  });

  on(Events.StageInstanceCreate, async (stage) => {
    if (!stage.guildId) return;
    const actorId = await actorFromAudit('stage.create', stage.guild, AuditLogEvent.StageInstanceCreate, stage.id);
    await recordEvent({ guildId: stage.guildId, eventKey: 'stage.create', actorId, targetId: stage.id, channelId: stage.channelId, summary: 'È stata aperta una Stage.', details: { topic: stage.topic, privacyLevel: stage.privacyLevel } });
  });
  on(Events.StageInstanceUpdate, async (oldStage, newStage) => {
    if (!newStage.guildId) return;
    const actorId = await actorFromAudit('stage.update', newStage.guild, AuditLogEvent.StageInstanceUpdate, newStage.id);
    await recordEvent({ guildId: newStage.guildId, eventKey: 'stage.update', actorId, targetId: newStage.id, channelId: newStage.channelId, summary: 'È stata modificata una Stage.', details: { oldTopic: oldStage?.topic ?? null, newTopic: newStage.topic, privacyLevel: newStage.privacyLevel } });
  });
  on(Events.StageInstanceDelete, async (stage) => {
    if (!stage.guildId) return;
    const actorId = await actorFromAudit('stage.delete', stage.guild, AuditLogEvent.StageInstanceDelete, stage.id);
    await recordEvent({ guildId: stage.guildId, eventKey: 'stage.delete', actorId, targetId: stage.id, channelId: stage.channelId, summary: 'È stata chiusa una Stage.', details: { topic: stage.topic } });
  });

  on(Events.GuildSoundboardSoundCreate, async (sound) => {
    if (!sound.guildId) return;
    const actorId = sound.user?.id ?? await actorFromAudit('soundboard.create', sound.guild, AuditLogEvent.SoundboardSoundCreate, sound.soundId);
    await recordEvent({ guildId: sound.guildId, eventKey: 'soundboard.create', actorId, targetId: sound.soundId, summary: `Creato il suono ${sound.name}.`, details: { name: sound.name, volume: sound.volume, emoji: sound.emoji?.toString() ?? null, url: sound.url } });
  });

  on(Events.GuildSoundboardSoundUpdate, async (oldSound, newSound) => {
    if (!newSound.guildId) return;
    const actorId = await actorFromAudit('soundboard.update', newSound.guild, AuditLogEvent.SoundboardSoundUpdate, newSound.soundId);
    await recordEvent({ guildId: newSound.guildId, eventKey: 'soundboard.update', actorId, targetId: newSound.soundId, summary: `Modificato il suono ${newSound.name}.`, details: { oldName: oldSound?.name ?? null, newName: newSound.name, oldVolume: oldSound?.volume ?? null, newVolume: newSound.volume, emoji: newSound.emoji?.toString() ?? null } });
  });

  on(Events.GuildSoundboardSoundDelete, async (sound) => {
    const item = sound as any;
    const guild = item.guild;
    const guildId = item.guildId ?? guild?.id ?? null;
    if (!guild || !guildId) return;
    const actorId = await actorFromAudit('soundboard.delete', guild, AuditLogEvent.SoundboardSoundDelete, String(item.soundId));
    await recordEvent({ guildId, eventKey: 'soundboard.delete', actorId, targetId: String(item.soundId), summary: `Eliminato il suono ${item.name ?? item.soundId}.`, details: { name: item.name ?? null } });
  });

  on(Events.GuildSoundboardSoundsUpdate, async (sounds, guild) => {
    await recordEvent({ guildId: guild.id, eventKey: 'soundboard.sync', targetId: guild.id, summary: 'L’elenco soundboard del server è stato aggiornato.', details: { count: sounds.size, soundIds: [...sounds.keys()] } });
  });

  on(Events.ApplicationCommandPermissionsUpdate, async (data) => {
    await recordEvent({
      guildId: data.guildId,
      eventKey: 'application.permissions_update',
      targetId: data.id,
      summary: 'Sono cambiati i permessi di un comando o entità applicazione.',
      details: {
        applicationId: data.applicationId,
        commandOrEntityId: data.id,
        permissions: data.permissions.map((permission) => ({ id: permission.id, type: permission.type, permission: permission.permission }))
      }
    });
  });

  on(Events.InteractionCreate, async (interaction) => {
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
          actorRoleIds: roleIds(interaction.member)
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
        actorRoleIds: roleIds(interaction.member)
      }
    });
  });

  on(Events.UserUpdate, async (oldUser, newUser) => {
    // Without the cached previous profile every field would look changed.
    if (oldUser.partial) return;
    const details: Record<string, unknown> = {};
    addChangedPair(details, 'oldUsername', 'newUsername', oldUser.username, newUser.username);
    addChangedPair(details, 'oldGlobalName', 'newGlobalName', oldUser.globalName, newUser.globalName);
    addChangedPair(details, 'oldAvatar', 'newAvatar', oldUser.avatarURL(), newUser.avatarURL());
    if (!Object.keys(details).length) return;
    for (const guild of client.guilds.cache.values()) {
      const member = guild.members.cache.get(newUser.id);
      if (!member) continue;
      await recordEvent({
        guildId: guild.id,
        eventKey: 'user.update',
        actorId: newUser.id,
        targetId: newUser.id,
        summary: `Il profilo Discord di ${newUser.tag} è cambiato.`,
        details: { ...details, actorBot: newUser.bot, actorRoleIds: roleIds(member) }
      });
    }
  });

  on(Events.GuildAuditLogEntryCreate, async (entry, guild) => {
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

  on(Events.PresenceUpdate, async (oldPresence, newPresence) => {
    const guild = newPresence.guild;
    if (!guild) return;
    const settings = await getGuildSettings(guild.id);
    if (!settings?.presenceLoggingEnabled || !newPresence.userId) return;
    await recordEvent({ guildId: guild.id, eventKey: 'presence.update', actorId: newPresence.userId, targetId: newPresence.userId, summary: `Presenza modificata per ${newPresence.user?.tag ?? newPresence.userId}.`, details: { oldStatus: oldPresence?.status ?? null, newStatus: newPresence.status, activities: newPresence.activities.map((a) => ({ name: a.name, type: a.type, state: a.state })) } });
  });

  on(Events.TypingStart, async (typing) => {
    if (!typing.guild) return;
    const settings = await getGuildSettings(typing.guild.id);
    if (!settings?.typingLoggingEnabled || typing.user.id === client.user?.id) return;
    await recordEvent({ guildId: typing.guild.id, eventKey: 'typing.start', actorId: typing.user.id, channelId: typing.channel.id, summary: `${typing.user.tag ?? typing.user.id} ha iniziato a scrivere.`, details: { actorBot: typing.user.bot ?? false } });
  });

  const handleRaw = async (packet: any) => {
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
  };
  client.on(Events.Raw, (packet: any) => {
    handleRaw(packet).catch((error: unknown) => report(Events.Raw, error));
  });
}
