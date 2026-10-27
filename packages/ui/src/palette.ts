/** 12 member colors, readable on --bg. Keys are stored in the DB. */
export const MEMBER_COLORS = {
  marigold: '#F5B83D',
  saffron: '#FF8A3D',
  rani: '#F0679A',
  coral: '#FF6B5B',
  peacock: '#2BB3B1',
  mint: '#7BD8A6',
  sky: '#6CB8FF',
  indigo: '#8C8CFF',
  lilac: '#C38CFF',
  henna: '#C9784A',
  lime: '#B8D85A',
  sand: '#D8C7A0',
} as const;

export type MemberColor = keyof typeof MEMBER_COLORS;
export const MEMBER_COLOR_KEYS = Object.keys(MEMBER_COLORS) as MemberColor[];

export function colorHex(key: string): string {
  return MEMBER_COLORS[key as MemberColor] ?? MEMBER_COLORS.sand;
}

/** First color not used yet, cycling when all 12 are taken. */
export function nextColor(used: string[]): MemberColor {
  return MEMBER_COLOR_KEYS.find((c) => !used.includes(c)) ?? MEMBER_COLOR_KEYS[used.length % 12]!;
}
