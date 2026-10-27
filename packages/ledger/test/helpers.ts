import {
  applyEvent,
  canApply,
  emptyState,
  type EventType,
  type LedgerEvent,
  type NightState,
  type PayloadOf,
  project,
} from '../src';

/** Appends validated events with incrementing seq, keeping an incremental state. */
export class Night {
  events: LedgerEvent[] = [];
  state: NightState = emptyState();
  private n = 0;

  constructor(
    readonly sessionId = 's1',
    readonly actor = 'u-host',
  ) {}

  make<T extends EventType>(type: T, payload: PayloadOf<T>): LedgerEvent {
    this.n += 1;
    return {
      id: `e${this.n}`,
      sessionId: this.sessionId,
      seq: this.state.lastSeq + 1,
      hostEpoch: 1,
      type,
      payload,
      actorUserId: this.actor,
      clientTs: new Date(Date.UTC(2026, 10, 8, 14, 0, this.n)).toISOString(),
    } as LedgerEvent;
  }

  /** Throws if the ledger rejects the event. */
  add<T extends EventType>(type: T, payload: PayloadOf<T>): LedgerEvent {
    const e = this.make(type, payload);
    const r = canApply(this.state, e);
    if (!r.ok) throw new Error(`${type} rejected: ${r.message}`);
    this.push(e);
    return e;
  }

  /** Returns false (and appends nothing) if rejected. */
  try<T extends EventType>(type: T, payload: PayloadOf<T>): boolean {
    const e = this.make(type, payload);
    if (!canApply(this.state, e).ok) return false;
    this.push(e);
    return true;
  }

  push(e: LedgerEvent) {
    this.events.push(e);
    if (e.type === 'EVENT_VOIDED') {
      this.state = project(this.events);
      return;
    }
    this.state.log.push({ event: e, voided: null });
    applyEvent(this.state, e);
  }
}
