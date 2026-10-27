import Dexie, { type EntityTable } from 'dexie';
import type { ChipSet, Kitty, LedgerEvent } from '@hisaab/ledger';

export type Role = 'owner' | 'admin' | 'member';
export type SessionStatus = 'live' | 'counting' | 'settling' | 'closed' | 'needs_review';

/** dirty = 1 means it still has to be pushed to Supabase. */
export interface LocalProfile {
  id: string;
  displayName: string;
  avatarColor: string;
  locale: string;
  ageConfirmedAt: string | null;
}

export interface LocalGroup {
  id: string;
  name: string;
  emoji: string;
  ownerId: string | null;
  defaultBuyIn: number;
  chipSet: ChipSet | null;
  festiveSeason: { start: string; end: string } | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  dirty: 0 | 1;
}

export interface LocalMember {
  id: string;
  groupId: string;
  nickname: string;
  color: string;
  userId: string | null;
  role: Role;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  dirty: 0 | 1;
}

export interface SessionConfig {
  buyIn: number;
  topUp: number;
  chipSet: ChipSet | null;
  kitty: Kitty | null;
}

export interface LocalSession {
  id: string;
  groupId: string;
  title: string;
  status: SessionStatus;
  hostUserId: string;
  hostEpoch: number;
  hostLastSeenAt: string | null;
  bankHolderMemberId: string;
  config: SessionConfig;
  viewToken: string;
  startedAt: string;
  closedAt: string | null;
  verifiedAt: string | null;
  reviewNote: string | null;
  dirty: 0 | 1;
}

export type LocalEvent = LedgerEvent & { synced: 0 | 1 };

/** Events the server refused because this device was no longer the host (§8.8). */
export interface RejectedEvent {
  id: string;
  sessionId: string;
  event: LedgerEvent;
  rejectedAt: string;
}

export interface Meta {
  key: string;
  value: unknown;
}

export class HisaabDB extends Dexie {
  profiles!: EntityTable<LocalProfile, 'id'>;
  groups!: EntityTable<LocalGroup, 'id'>;
  members!: EntityTable<LocalMember, 'id'>;
  sessions!: EntityTable<LocalSession, 'id'>;
  events!: EntityTable<LocalEvent, 'id'>;
  rejected!: EntityTable<RejectedEvent, 'id'>;
  meta!: EntityTable<Meta, 'key'>;

  constructor(name = 'hisaab') {
    super(name);
    this.version(1).stores({
      profiles: 'id',
      groups: 'id, dirty, updatedAt',
      members: 'id, groupId, userId, dirty',
      sessions: 'id, groupId, status, startedAt, dirty',
      events: 'id, sessionId, [sessionId+seq], synced',
      rejected: 'id, sessionId',
      meta: 'key',
    });
  }
}

export const db = new HisaabDB();

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value });
}
