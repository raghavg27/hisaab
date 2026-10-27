import { DiyaMark } from './DiyaMark';

/** Static placeholder while auth/local data loads. */
export function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Loading">
      <DiyaMark size={40} className="animate-pulse" />
    </div>
  );
}
