import { track as vercelTrack } from '@vercel/analytics';

type Events = {
  night_started: { players: number };
  event_recorded: { type: string };
  gap_found: { sign: 'missing' | 'extra' };
  night_closed: { duration_bucket: string };
  pwa_installed: Record<string, never>;
};

/** Custom analytics without names or amounts (§13). */
export function track<K extends keyof Events>(name: K, props: Events[K]) {
  try {
    vercelTrack(name, props);
  } catch {
    // analytics must never break the app
  }
}

export function durationBucket(ms: number) {
  const h = ms / 3_600_000;
  return h < 1 ? '<1h' : h < 2 ? '1-2h' : h < 4 ? '2-4h' : h < 6 ? '4-6h' : '6h+';
}
