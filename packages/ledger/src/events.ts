// zod/mini keeps the same schemas at a fraction of the bundle (§12 Live Table budget).
import { z } from 'zod/mini';

const id = z.string().check(z.minLength(1));
const amount = z.int().check(z.positive());
const chips = z.int().check(z.nonnegative());
const chipBreakdown = z.optional(z.record(z.string(), z.int().check(z.nonnegative())));

export const ChipSetSchema = z.array(
  z.object({ label: z.string().check(z.minLength(1)), color: z.string().check(z.minLength(1)), value: amount }),
);
export const KittySchema = z.object({ amount, holderMemberId: id });

export const VoidReasonSchema = z.enum(['undo', 'wrong_amount', 'wrong_player', 'duplicate', 'other']);
export const ResolutionSchema = z.enum(['bank_absorbs', 'split_equal', 'assigned']);

export const PayloadSchemas = {
  SESSION_STARTED: z.object({
    title: z.string().check(z.minLength(1)),
    buyIn: amount,
    topUp: amount,
    bankHolderMemberId: id,
    chipSet: z.nullish(ChipSetSchema),
    kitty: z.nullish(KittySchema),
  }),
  PLAYER_JOINED: z.object({ stintId: id, memberId: id }),
  BUY_IN: z.object({ stintId: id, amount }),
  TOP_UP: z.object({ stintId: id, amount }),
  SHORT_TAKEN: z.object({ stintId: id, amount, note: z.optional(z.string()) }),
  SHORT_REPAID: z.object({ stintId: id, amount, method: z.enum(['cash', 'chips']) }),
  PLAYER_LEFT: z.object({ stintId: id, finalChips: chips, chipBreakdown, settledNow: z.int() }),
  COUNTING_STARTED: z.object({}),
  COUNTING_REOPENED: z.object({}),
  FINAL_COUNT: z.object({ stintId: id, finalChips: chips, chipBreakdown }),
  ADJUSTMENT: z.object({
    stintId: id,
    amount: z.int().check(z.refine((n) => n !== 0, 'Amount must not be 0')),
    resolution: ResolutionSchema,
    gapAtTime: z.int(),
  }),
  BANK_CHECK: z.object({ counted: chips, expected: z.int() }),
  BANK_TRANSFERRED: z.object({
    fromMemberId: id,
    toMemberId: id,
    counted: chips,
    expected: z.int(),
  }),
  HOST_TRANSFERRED: z.object({ fromUserId: id, toUserId: id, forced: z.boolean() }),
  TRANSFER_MARKED: z.object({ from: id, to: id, amount, paid: z.boolean() }),
  KITTY_MARKED: z.object({ memberId: id, paid: z.boolean() }),
  SESSION_CLOSED: z.object({ reason: z.optional(z.string()) }),
  SESSION_REOPENED: z.object({ reason: z.string().check(z.minLength(1)) }),
  EVENT_VOIDED: z.object({ targetId: id, reason: VoidReasonSchema, note: z.optional(z.string()) }),
} as const;

export type EventType = keyof typeof PayloadSchemas;
export const EVENT_TYPES = Object.keys(PayloadSchemas) as EventType[];
export type PayloadOf<T extends EventType> = z.infer<(typeof PayloadSchemas)[T]>;
export type ChipSet = z.infer<typeof ChipSetSchema>;
export type Kitty = z.infer<typeof KittySchema>;
export type VoidReason = z.infer<typeof VoidReasonSchema>;
export type Resolution = z.infer<typeof ResolutionSchema>;

interface EventBase {
  id: string;
  sessionId: string;
  seq: number;
  hostEpoch: number;
  actorUserId: string;
  clientTs: string;
}

export type LedgerEvent = {
  [T in EventType]: EventBase & { type: T; payload: PayloadOf<T> };
}[EventType];

export type EventOf<T extends EventType> = Extract<LedgerEvent, { type: T }>;

const base = {
  id,
  sessionId: id,
  seq: z.int().check(z.positive()),
  hostEpoch: z.int().check(z.positive()),
  actorUserId: id,
  clientTs: z.string().check(z.minLength(1)),
};

export const LedgerEventSchema = z.discriminatedUnion(
  'type',
  EVENT_TYPES.map((t) => z.object({ ...base, type: z.literal(t), payload: PayloadSchemas[t] })) as unknown as [
    z.ZodMiniObject,
    ...z.ZodMiniObject[],
  ],
);

export function parseEvent(raw: unknown): LedgerEvent {
  return LedgerEventSchema.parse(raw) as unknown as LedgerEvent;
}
