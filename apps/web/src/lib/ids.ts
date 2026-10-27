import { v7 } from 'uuid';

export const newId = () => v7();

const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** 128-bit+ random base62 token (22 chars). */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(22));
  return [...bytes].map((b) => B62[b % 62]).join('');
}
