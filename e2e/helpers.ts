import { createClient, type Session } from '@supabase/supabase-js';
import type { BrowserContext, Page } from '@playwright/test';

const URL = process.env.SUPABASE_URL!;
const SECRET = process.env.SUPABASE_SECRET_KEY!;
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY!;
const REF = new globalThis.URL(URL).hostname.split('.')[0];

export const admin = () => createClient(URL, SECRET, { auth: { persistSession: false } });

/** Creates a confirmed user with a profile (18+ confirmed) and returns a live session. */
export async function makeUser(name: string): Promise<{ session: Session; userId: string; email: string }> {
  const email = `e2e-${name.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@hisaab.test`;
  const password = `pw-${Math.random().toString(36).slice(2)}A1!`;
  const a = admin();
  const { data, error } = await a.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const userId = data.user.id;
  const { error: pErr } = await a
    .from('profiles')
    .insert({ id: userId, display_name: name, avatar_color: 'marigold', age_confirmed_at: new Date().toISOString() });
  if (pErr) throw pErr;
  const client = createClient(URL, PUBLISHABLE, { auth: { persistSession: false } });
  const { data: s, error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw sErr;
  return { session: s.session!, userId, email };
}

/** Puts the Supabase session where supabase-js looks for it, before any app script runs. */
export async function signIn(context: BrowserContext, session: Session, { splash = false } = {}) {
  await context.addInitScript(
    ([key, value, skipSplash]) => {
      if (!localStorage.getItem(key!)) localStorage.setItem(key!, value!);
      if (skipSplash) localStorage.setItem('hisaab-splash-day', new Date().toDateString());
    },
    [`sb-${REF}-auth-token`, JSON.stringify(session), !splash] as const,
  );
}

export async function deleteUser(userId: string) {
  await admin().auth.admin.deleteUser(userId);
}

/** Taps a button by accessible name inside the open dialog. */
export function sheet(page: Page) {
  return page.getByRole('dialog');
}
