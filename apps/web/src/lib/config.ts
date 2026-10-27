export const APP_NAME = 'Hisaab';

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const FLAGS = {
  googleAuth: process.env.NEXT_PUBLIC_GOOGLE_AUTH === 'true',
  phoneAuth: process.env.NEXT_PUBLIC_PHONE_AUTH === 'true',
};

/** Undo window after every action (§8.4). */
export const UNDO_MS = 6000;
/** Any single amount above this × buy-in asks for a second confirm. */
export const TYPO_MULTIPLE = 5;
export const BUY_IN_PRESETS = [100, 200, 500, 1000];
