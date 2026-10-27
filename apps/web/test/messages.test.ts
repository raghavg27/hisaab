import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import hi from '@/messages/hi-Latn.json';

type Tree = { [k: string]: string | Tree };
const flat = (d: Tree, p = ''): [string, string][] =>
  Object.entries(d).flatMap(([k, v]) => (typeof v === 'string' ? [[p + k, v] as [string, string]] : flat(v, `${p + k}.`)));

describe('messages', () => {
  it('Hinglish has exactly the English keys', () => {
    expect(flat(hi).map(([k]) => k)).toEqual(flat(en).map(([k]) => k));
  });

  it.each([
    ['en', en],
    ['hi-Latn', hi],
  ] as const)('every %s message is valid ICU and formats with the English arguments', (locale, messages) => {
    const errors: string[] = [];
    const t = createTranslator({ locale, messages, onError: (e) => errors.push(e.message) });
    for (const [key, text] of flat(en)) {
      const args = Object.fromEntries([...text.matchAll(/\{(\w+)/g)].map((m) => [m[1], 1]));
      t(key as never, args as never);
    }
    expect(errors).toEqual([]);
  });

  it('Hinglish uses the PRD microcopy (§11.6)', () => {
    expect(hi.count.missing).toBe('Table se {amount} gayab hain');
    expect(hi.settle.settleTitle).toBe('Kisko kitna dena hai');
    expect(hi.home.emptyTitle).toBe('Table khaali hai. Sabko bulao.');
  });
});
