// Types
export type CompanionEventListener = (data: unknown) => void;

// Constants
const eventsUrl = "/api/events";

// State
let source: EventSource | null = null;
const listeners = new Map<string, Set<CompanionEventListener>>();

// Subscription
export function subscribeToCompanionEvent(eventName: string, listener: CompanionEventListener): () => void {
  const eventSource = getSource();
  let eventListeners = listeners.get(eventName);
  if (eventListeners === undefined) {
    const created = new Set<CompanionEventListener>();
    listeners.set(eventName, created);
    eventSource.addEventListener(eventName, (event: MessageEvent<string>) => dispatch(created, event.data));
    eventListeners = created;
  }
  eventListeners.add(listener);
  return () => eventListeners.delete(listener);
}

function getSource(): EventSource {
  source ??= new EventSource(eventsUrl);
  return source;
}

function dispatch(eventListeners: ReadonlySet<CompanionEventListener>, raw: string): void {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return;
  }
  for (const listener of eventListeners) {
    listener(data);
  }
}
