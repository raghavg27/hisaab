import { derive, reconcile, tableTotals } from './core';
import { PayloadSchemas, type EventType, type LedgerEvent } from './events';
import {
  activeStintOfMember,
  activeStints,
  applyEvent,
  emptyState,
  sortBySeq,
  stintOf,
  voidedMap,
  type NightState,
} from './project';

export const MAX_PLAYERS = 12;

export type ErrorCode =
  | 'invalid_payload'
  | 'not_started'
  | 'already_started'
  | 'closed'
  | 'not_live'
  | 'not_counting'
  | 'not_closed'
  | 'unknown_stint'
  | 'stint_left'
  | 'duplicate_stint'
  | 'member_active'
  | 'table_full'
  | 'repay_exceeds'
  | 'bank_holder_must_handover'
  | 'settle_out_of_range'
  | 'bank_short'
  | 'no_players'
  | 'not_bank_holder'
  | 'same_member'
  | 'not_counted'
  | 'gap_not_zero'
  | 'kitty_off'
  | 'unknown_target'
  | 'already_voided'
  | 'not_voidable'
  | 'void_breaks_log';

export type CanApply =
  | { ok: true }
  | { ok: false; code: ErrorCode; message: string; params?: Record<string, number | string> };

const ok: CanApply = { ok: true };
const fail = (code: ErrorCode, message: string, params?: Record<string, number | string>): CanApply => ({
  ok: false,
  code,
  message,
  params,
});

const LIVE_ONLY: EventType[] = ['PLAYER_JOINED', 'BUY_IN', 'TOP_UP', 'SHORT_TAKEN', 'SHORT_REPAID', 'PLAYER_LEFT'];

export const VOIDABLE: EventType[] = [
  'PLAYER_JOINED',
  'BUY_IN',
  'TOP_UP',
  'SHORT_TAKEN',
  'SHORT_REPAID',
  'PLAYER_LEFT',
  'FINAL_COUNT',
  'ADJUSTMENT',
  'BANK_CHECK',
  'BANK_TRANSFERRED',
  'TRANSFER_MARKED',
  'KITTY_MARKED',
];

/** All active stints counted and gap = 0. */
export function isSettleable(state: NightState): boolean {
  const active = activeStints(state);
  return active.length > 0 && active.every((s) => s.final !== null) && reconcile(state.stints).gap === 0;
}

/** Validation lives here, not in the UI. Returns the reason an event can't be appended. */
export function canApply(state: NightState, e: LedgerEvent): CanApply {
  const parsed = PayloadSchemas[e.type].safeParse(e.payload);
  if (!parsed.success) {
    const amt = (e.payload as { amount?: unknown }).amount;
    if (typeof amt === 'number' && amt <= 0) return fail('invalid_payload', 'Amount must be more than ₹0');
    return fail('invalid_payload', parsed.error.issues[0]?.message ?? 'Invalid entry');
  }

  if (state.status === 'empty' && e.type !== 'SESSION_STARTED') return fail('not_started', 'Night not started');
  if (state.status !== 'empty' && e.type === 'SESSION_STARTED') return fail('already_started', 'Already started');
  if (state.status === 'closed' && e.type !== 'SESSION_REOPENED') return fail('closed', 'This night is closed');
  if (LIVE_ONLY.includes(e.type) && state.status !== 'live')
    return fail('not_live', 'Counting has started. Go back to the game first.');

  const needStint = (stintId: string): CanApply | null => {
    const s = stintOf(state, stintId);
    if (!s) return fail('unknown_stint', 'Unknown player');
    if (s.left) return fail('stint_left', 'This player has left the table');
    return null;
  };

  switch (e.type) {
    case 'SESSION_STARTED':
      return ok;
    case 'PLAYER_JOINED': {
      if (stintOf(state, e.payload.stintId)) return fail('duplicate_stint', 'Duplicate entry');
      if (activeStintOfMember(state, e.payload.memberId))
        return fail('member_active', 'Already at the table');
      if (activeStints(state).length >= MAX_PLAYERS)
        return fail('table_full', `Max ${MAX_PLAYERS} players`, { max: MAX_PLAYERS });
      return ok;
    }
    case 'BUY_IN':
    case 'TOP_UP':
    case 'SHORT_TAKEN':
      return needStint(e.payload.stintId) ?? ok;
    case 'SHORT_REPAID': {
      const err = needStint(e.payload.stintId);
      if (err) return err;
      const max = derive(stintOf(state, e.payload.stintId)!).shortOutstanding;
      if (e.payload.amount > max)
        return fail('repay_exceeds', `Can repay at most ₹${max}`, { max });
      return ok;
    }
    case 'PLAYER_LEFT': {
      const err = needStint(e.payload.stintId);
      if (err) return err;
      const s = stintOf(state, e.payload.stintId)!;
      if (s.memberId === state.bankHolderMemberId)
        return fail('bank_holder_must_handover', 'Hand over the bank before leaving');
      const owes = e.payload.finalChips - derive(s).shortOutstanding;
      const settled = e.payload.settledNow;
      const lo = Math.min(0, owes),
        hi = Math.max(0, owes);
      if (settled < lo || settled > hi)
        return fail('settle_out_of_range', 'Settled amount is more than what is owed', { owes });
      const { bankCash } = tableTotals(state.stints);
      if (settled > bankCash) return fail('bank_short', `Bank only has ₹${bankCash}`, { bankCash });
      return ok;
    }
    case 'COUNTING_STARTED':
      if (state.status !== 'live') return fail('not_live', 'Not live');
      if (!activeStints(state).length) return fail('no_players', 'No one is at the table');
      return ok;
    case 'COUNTING_REOPENED':
      return state.status === 'counting' ? ok : fail('not_counting', 'Counting has not started');
    case 'FINAL_COUNT':
    case 'ADJUSTMENT':
      if (state.status !== 'counting') return fail('not_counting', 'Counting has not started');
      return needStint(e.payload.stintId) ?? ok;
    case 'BANK_CHECK':
    case 'HOST_TRANSFERRED':
      return ok;
    case 'BANK_TRANSFERRED': {
      if (e.payload.fromMemberId !== state.bankHolderMemberId)
        return fail('not_bank_holder', 'Only the bank holder can hand over the bank');
      if (e.payload.toMemberId === e.payload.fromMemberId) return fail('same_member', 'Pick someone else');
      if (!activeStintOfMember(state, e.payload.toMemberId))
        return fail('stint_left', 'The new bank holder must be at the table');
      return ok;
    }
    case 'TRANSFER_MARKED':
      if (state.status !== 'counting') return fail('not_counting', 'Counting has not started');
      return isSettleable(state) ? ok : fail('gap_not_zero', 'Fix the count first');
    case 'KITTY_MARKED':
      return state.config?.kitty ? ok : fail('kitty_off', 'Kitty is off for this night');
    case 'SESSION_CLOSED': {
      if (state.status !== 'counting') return fail('not_counting', 'Finish the count first');
      const active = activeStints(state);
      if (active.some((s) => s.final === null)) return fail('not_counted', 'Count everyone first');
      const { gap } = reconcile(state.stints);
      if (gap !== 0) return fail('gap_not_zero', 'The count does not match yet', { gap });
      return ok;
    }
    case 'SESSION_REOPENED':
      return state.status === 'closed' ? ok : fail('not_closed', 'Night is not closed');
    case 'EVENT_VOIDED':
      return canVoid(state, e.payload.targetId, e.id);
  }
}

function canVoid(state: NightState, targetId: string, voidId: string): CanApply {
  const entry = state.log.find((l) => l.event.id === targetId);
  if (!entry) return fail('unknown_target', 'Entry not found');
  if (entry.voided) return fail('already_voided', 'Already voided');
  if (!VOIDABLE.includes(entry.event.type)) return fail('not_voidable', "This entry can't be voided");
  // The log without the target (and anything it implies) must still be valid, in order.
  const events = state.log.map((l) => l.event);
  const voidEvent = {
    ...entry.event,
    id: voidId,
    seq: state.lastSeq + 1,
    type: 'EVENT_VOIDED',
    payload: { targetId, reason: 'other' },
  } as LedgerEvent;
  const voided = voidedMap([...events, voidEvent]);
  const effective = events.filter((e) => !voided.has(e.id) && e.type !== 'EVENT_VOIDED');
  const bad = firstInvalid(effective);
  if (bad) return fail('void_breaks_log', `A later entry depends on this one (#${bad.event.seq}): ${bad.message}`);
  return ok;
}

/**
 * Replays an effective (void-free) log in seq order, validating each event against the state before it.
 * A close that was later reopened is history, so it isn't re-validated.
 */
export function firstInvalid(events: LedgerEvent[]): { event: LedgerEvent; message: string; code: ErrorCode } | null {
  const state = emptyState();
  const sorted = sortBySeq(events);
  const lastReopen = sorted.findLast((e) => e.type === 'SESSION_REOPENED')?.seq ?? 0;
  for (const e of sorted) {
    const r = e.type === 'SESSION_CLOSED' && e.seq < lastReopen ? ok : canApply(state, e);
    if (!r.ok) return { event: e, message: r.message, code: r.code };
    state.log.push({ event: e, voided: null });
    applyEvent(state, e);
  }
  return null;
}
