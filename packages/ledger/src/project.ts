import type { Stint } from './core';
import type { EventOf, LedgerEvent, PayloadOf, VoidReason } from './events';

export type Status = 'empty' | 'live' | 'counting' | 'closed';

export interface StintState extends Stint {
  /** Seat order across the night (join order). */
  seat: number;
  joinedAt: string;
  leftAt: string | null;
  shortsCount: number;
}

export interface VoidInfo {
  byEventId: string;
  reason: VoidReason;
  note?: string;
  /** True when voided as a side effect (a lone BUY_IN's PLAYER_JOINED). */
  implied: boolean;
}

export interface LogEntry {
  event: LedgerEvent;
  voided: VoidInfo | null;
}

export interface NightState {
  sessionId: string | null;
  config: PayloadOf<'SESSION_STARTED'> | null;
  status: Status;
  hostUserId: string | null;
  bankHolderMemberId: string | null;
  startedAt: string | null;
  closedAt: string | null;
  stints: StintState[];
  bankChecks: EventOf<'BANK_CHECK'>[];
  bankTransfers: EventOf<'BANK_TRANSFERRED'>[];
  hostTransfers: EventOf<'HOST_TRANSFERRED'>[];
  /** Latest mark per `${from}>${to}` pair. */
  transferMarks: Record<string, { amount: number; paid: boolean }>;
  kittyPaid: Record<string, boolean>;
  /** Chronological (by seq), including voided entries. */
  log: LogEntry[];
  lastSeq: number;
}

export function emptyState(): NightState {
  return {
    sessionId: null,
    config: null,
    status: 'empty',
    hostUserId: null,
    bankHolderMemberId: null,
    startedAt: null,
    closedAt: null,
    stints: [],
    bankChecks: [],
    bankTransfers: [],
    hostTransfers: [],
    transferMarks: {},
    kittyPaid: {},
    log: [],
    lastSeq: 0,
  };
}

export const transferKey = (from: string, to: string) => `${from}>${to}`;

export function stintOf(state: NightState, stintId: string): StintState | undefined {
  return state.stints.find((s) => s.id === stintId);
}

export function activeStints(state: NightState): StintState[] {
  return state.stints.filter((s) => !s.left);
}

export function activeStintOfMember(state: NightState, memberId: string): StintState | undefined {
  return state.stints.find((s) => s.memberId === memberId && !s.left);
}

function stintIdOf(e: LedgerEvent): string | undefined {
  const p = e.payload as { stintId?: string };
  return p.stintId;
}

/**
 * Which events are voided, including implied voids:
 * voiding a stint's only BUY_IN also voids its PLAYER_JOINED.
 */
export function voidedMap(events: LedgerEvent[]): Map<string, VoidInfo> {
  const voided = new Map<string, VoidInfo>();
  const byId = new Map(events.map((e) => [e.id, e]));
  for (const e of events) {
    if (e.type !== 'EVENT_VOIDED') continue;
    const { targetId, reason, note } = e.payload;
    if (!byId.has(targetId) || voided.has(targetId)) continue;
    voided.set(targetId, { byEventId: e.id, reason, note, implied: false });
  }
  for (const [targetId, info] of [...voided]) {
    const target = byId.get(targetId)!;
    if (target.type !== 'BUY_IN') continue;
    const stintId = target.payload.stintId;
    const rest = events.filter((e) => stintIdOf(e) === stintId && e.type !== 'PLAYER_JOINED' && !voided.has(e.id));
    if (rest.length) continue;
    const join = events.find((e) => e.type === 'PLAYER_JOINED' && e.payload.stintId === stintId);
    if (join && !voided.has(join.id)) voided.set(join.id, { ...info, implied: true });
  }
  return voided;
}

/** Applies one (non-voided) event to a state in place. */
export function applyEvent(state: NightState, e: LedgerEvent): void {
  state.lastSeq = Math.max(state.lastSeq, e.seq);
  const stint = () => {
    const s = stintOf(state, stintIdOf(e)!);
    if (!s) throw new Error(`${e.type} #${e.seq}: unknown stint`);
    return s;
  };
  switch (e.type) {
    case 'SESSION_STARTED':
      state.sessionId = e.sessionId;
      state.config = e.payload;
      state.status = 'live';
      state.hostUserId = e.actorUserId;
      state.bankHolderMemberId = e.payload.bankHolderMemberId;
      state.startedAt = e.clientTs;
      break;
    case 'PLAYER_JOINED':
      state.stints.push({
        id: e.payload.stintId,
        memberId: e.payload.memberId,
        buyIns: 0,
        topUps: 0,
        shortsTaken: 0,
        repaidCash: 0,
        repaidChips: 0,
        final: null,
        adj: 0,
        left: false,
        settledNow: 0,
        seat: state.stints.length,
        joinedAt: e.clientTs,
        leftAt: null,
        shortsCount: 0,
      });
      break;
    case 'BUY_IN':
      stint().buyIns += e.payload.amount;
      break;
    case 'TOP_UP':
      stint().topUps += e.payload.amount;
      break;
    case 'SHORT_TAKEN': {
      const s = stint();
      s.shortsTaken += e.payload.amount;
      s.shortsCount += 1;
      break;
    }
    case 'SHORT_REPAID':
      if (e.payload.method === 'cash') stint().repaidCash += e.payload.amount;
      else stint().repaidChips += e.payload.amount;
      break;
    case 'PLAYER_LEFT': {
      const s = stint();
      s.left = true;
      s.final = e.payload.finalChips;
      s.settledNow = e.payload.settledNow;
      s.leftAt = e.clientTs;
      break;
    }
    case 'COUNTING_STARTED':
      state.status = 'counting';
      break;
    case 'COUNTING_REOPENED':
      state.status = 'live';
      for (const s of state.stints) if (!s.left) s.final = null;
      break;
    case 'FINAL_COUNT':
      stint().final = e.payload.finalChips;
      break;
    case 'ADJUSTMENT':
      stint().adj += e.payload.amount;
      break;
    case 'BANK_CHECK':
      state.bankChecks.push(e);
      break;
    case 'BANK_TRANSFERRED':
      state.bankTransfers.push(e);
      state.bankHolderMemberId = e.payload.toMemberId;
      break;
    case 'HOST_TRANSFERRED':
      state.hostTransfers.push(e);
      state.hostUserId = e.payload.toUserId;
      break;
    case 'TRANSFER_MARKED':
      state.transferMarks[transferKey(e.payload.from, e.payload.to)] = {
        amount: e.payload.amount,
        paid: e.payload.paid,
      };
      break;
    case 'KITTY_MARKED':
      state.kittyPaid[e.payload.memberId] = e.payload.paid;
      break;
    case 'SESSION_CLOSED':
      state.status = 'closed';
      state.closedAt = e.clientTs;
      break;
    case 'SESSION_REOPENED':
      state.status = 'counting';
      state.closedAt = null;
      break;
    case 'EVENT_VOIDED':
      break;
  }
}

export function sortBySeq(events: LedgerEvent[]): LedgerEvent[] {
  return [...events].sort((a, b) => a.seq - b.seq);
}

/** Pure full replay. Ordering is by seq, never by clock. */
export function project(events: LedgerEvent[]): NightState {
  const sorted = sortBySeq(events);
  const voided = voidedMap(sorted);
  const state = emptyState();
  for (const e of sorted) {
    const v = voided.get(e.id) ?? null;
    state.log.push({ event: e, voided: v });
    if (!v) applyEvent(state, e);
    else state.lastSeq = Math.max(state.lastSeq, e.seq);
  }
  return state;
}
