type Listener = () => void;
const listeners = new Set<Listener>();

/** Ask the sync worker to flush soon (it debounces). */
export function requestFlush() {
  listeners.forEach((l) => l());
}

export function onFlushRequest(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}
