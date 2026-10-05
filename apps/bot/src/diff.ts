// Pure change-detection helpers used by the Gateway handlers.
// They never touch Discord or the database so they can be unit tested.

export const addChangedPair = (
  details: Record<string, unknown>,
  oldKey: string,
  newKey: string,
  oldValue: unknown,
  newValue: unknown
) => {
  if (JSON.stringify(oldValue ?? null) === JSON.stringify(newValue ?? null)) return false;
  details[oldKey] = oldValue ?? null;
  details[newKey] = newValue ?? null;
  return true;
};

const permissionNames = (overwrite: any, side: 'allow' | 'deny') =>
  new Set<string>(overwrite?.[side]?.toArray?.() ?? []);

export const setDifference = (next: Iterable<string>, previous: Iterable<string>) => {
  const before = new Set(previous);
  return [...new Set(next)].filter((value) => !before.has(value));
};

export const permissionOverwriteChanges = (oldChannel: any, newChannel: any) => {
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
      changes.push({ targetId: id, targetType, action: 'added', allowAdded: [...permissionNames(after, 'allow')], denyAdded: [...permissionNames(after, 'deny')] });
      continue;
    }

    if (before && !after) {
      changes.push({ targetId: id, targetType, action: 'removed', allowRemoved: [...permissionNames(before, 'allow')], denyRemoved: [...permissionNames(before, 'deny')] });
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

const permissionArray = (permissions: any): string[] => permissions?.toArray?.() ?? [];

/**
 * Role changes that matter for an audit trail. Position-only changes are
 * deliberately ignored: Discord emits one RoleUpdate per shifted role whenever
 * a role is created or dragged, which would otherwise flood the log channel.
 */
export const roleChanges = (oldRole: any, newRole: any) => {
  const details: Record<string, unknown> = {};
  addChangedPair(details, 'oldName', 'newName', oldRole?.name, newRole?.name);
  addChangedPair(details, 'oldColor', 'newColor', oldRole?.hexColor, newRole?.hexColor);
  addChangedPair(details, 'oldHoist', 'newHoist', oldRole?.hoist, newRole?.hoist);
  addChangedPair(details, 'oldMentionable', 'newMentionable', oldRole?.mentionable, newRole?.mentionable);
  addChangedPair(details, 'oldIcon', 'newIcon', oldRole?.icon ?? oldRole?.unicodeEmoji ?? null, newRole?.icon ?? newRole?.unicodeEmoji ?? null);

  const before = permissionArray(oldRole?.permissions);
  const after = permissionArray(newRole?.permissions);
  const addedPermissions = setDifference(after, before);
  const removedPermissions = setDifference(before, after);
  if (addedPermissions.length) details.addedPermissions = addedPermissions;
  if (removedPermissions.length) details.removedPermissions = removedPermissions;
  return details;
};

export const threadChanges = (oldThread: any, newThread: any) => {
  const details: Record<string, unknown> = {};
  addChangedPair(details, 'oldName', 'newName', oldThread?.name, newThread?.name);
  addChangedPair(details, 'oldArchived', 'newArchived', oldThread?.archived, newThread?.archived);
  addChangedPair(details, 'oldLocked', 'newLocked', oldThread?.locked, newThread?.locked);
  addChangedPair(details, 'oldAutoArchiveDuration', 'newAutoArchiveDuration', oldThread?.autoArchiveDuration, newThread?.autoArchiveDuration);
  addChangedPair(details, 'oldSlowmode', 'newSlowmode', oldThread?.rateLimitPerUser, newThread?.rateLimitPerUser);
  addChangedPair(details, 'oldInvitable', 'newInvitable', oldThread?.invitable, newThread?.invitable);
  addChangedPair(details, 'oldAppliedTags', 'newAppliedTags', oldThread?.appliedTags ?? [], newThread?.appliedTags ?? []);
  return details;
};

const GUILD_FIELDS: Array<[string, (guild: any) => unknown]> = [
  ['Name', (guild) => guild?.name],
  ['Description', (guild) => guild?.description],
  ['Icon', (guild) => guild?.iconURL?.() ?? null],
  ['Banner', (guild) => guild?.bannerURL?.() ?? null],
  ['Splash', (guild) => guild?.splashURL?.() ?? null],
  ['OwnerId', (guild) => guild?.ownerId],
  ['VerificationLevel', (guild) => guild?.verificationLevel],
  ['ExplicitContentFilter', (guild) => guild?.explicitContentFilter],
  ['MfaLevel', (guild) => guild?.mfaLevel],
  ['NsfwLevel', (guild) => guild?.nsfwLevel],
  ['DefaultMessageNotifications', (guild) => guild?.defaultMessageNotifications],
  ['AfkChannelId', (guild) => guild?.afkChannelId],
  ['AfkTimeout', (guild) => guild?.afkTimeout],
  ['SystemChannelId', (guild) => guild?.systemChannelId],
  ['RulesChannelId', (guild) => guild?.rulesChannelId],
  ['PublicUpdatesChannelId', (guild) => guild?.publicUpdatesChannelId],
  ['VanityUrlCode', (guild) => guild?.vanityURLCode],
  ['PreferredLocale', (guild) => guild?.preferredLocale],
  ['PremiumProgressBarEnabled', (guild) => guild?.premiumProgressBarEnabled]
];

export const guildChanges = (oldGuild: any, newGuild: any) => {
  const details: Record<string, unknown> = {};
  for (const [field, read] of GUILD_FIELDS) {
    addChangedPair(details, `old${field}`, `new${field}`, read(oldGuild), read(newGuild));
  }
  return details;
};

/**
 * MESSAGE_UPDATE is also emitted when Discord resolves link embeds, when a
 * message is pinned, or when polls/components refresh. Only a changed
 * edited_timestamp marks an edit made by the author.
 */
export const isAuthorEdit = (
  oldMessage: { partial?: boolean; editedTimestamp?: number | null } | null | undefined,
  newMessage: { editedTimestamp?: number | null }
) => {
  if (!newMessage.editedTimestamp) return false;
  if (oldMessage && !oldMessage.partial && oldMessage.editedTimestamp === newMessage.editedTimestamp) return false;
  return true;
};

export const attachmentIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((item) => String((item as { id?: unknown })?.id ?? '')).filter(Boolean).sort()
    : [];

export const sameAttachments = (before: unknown, after: unknown) =>
  JSON.stringify(attachmentIds(before)) === JSON.stringify(attachmentIds(after));
