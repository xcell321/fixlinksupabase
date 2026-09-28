import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';

// Who is actually using the app right now, over Supabase Realtime presence —
// the same mechanism the typing indicator already uses. One channel
// (`app:online`) is joined for the whole signed-in session, so a user counts as
// online while the app is open and drops off when it is closed, killed, or
// loses its socket. No backend or schema change.
//
// Missing env disables presence silently; callers then read "offline", which is
// the honest answer — the UI must never claim someone is online when we cannot
// know it.
let client: SupabaseClient | null = null;

const getClient = (): SupabaseClient | null => {
  if (client) return client;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { params: { eventsPerSecond: 5 } },
  });
  return client;
};

const CHANNEL = 'app:online';

// One snapshot shared by every screen: no prop drilling, no extra subscriptions.
let onlineUids: Set<string> = new Set();
const listeners = new Set<(uids: Set<string>) => void>();

const publish = (uids: Set<string>): void => {
  onlineUids = uids;
  for (const listener of listeners) {
    try {
      listener(uids);
    } catch {
      /* a broken listener must not stop the others */
    }
  }
};

// Screens subscribe to re-render when someone comes online or goes away.
export const subscribeOnlineUids = (listener: (uids: Set<string>) => void): (() => void) => {
  listeners.add(listener);
  listener(onlineUids);
  return () => {
    listeners.delete(listener);
  };
};

// The single source of truth for "is this person using the app right now".
export const isUserOnline = (uid?: string | null): boolean =>
  Boolean(uid) && onlineUids.has(String(uid));

let activeChannel: RealtimeChannel | null = null;

// Joins the shared channel and tracks this user until the returned cleanup runs
// (sign-out or app teardown).
export const startOnlinePresence = (me: { uid: string; name?: string }): (() => void) => {
  const sb = getClient();
  if (!sb || !me.uid) return () => {};

  const channel = sb.channel(CHANNEL, { config: { presence: { key: me.uid } } });
  activeChannel = channel;

  const readOnline = (): void => {
    const uids = new Set<string>();
    try {
      for (const key of Object.keys(channel.presenceState())) uids.add(key);
    } catch {
      /* treat an unreadable state as nobody online */
    }
    publish(uids);
  };

  channel
    .on('presence', { event: 'sync' }, readOnline)
    .on('presence', { event: 'join' }, readOnline)
    .on('presence', { event: 'leave' }, readOnline)
    .subscribe((status) => {
      // Track only once the channel is actually joined, otherwise the presence
      // is dropped and everyone looks offline.
      if (status === 'SUBSCRIBED') {
        void channel.track({ uid: me.uid, name: me.name || '', at: Date.now() });
      }
    });

  return () => {
    if (activeChannel === channel) activeChannel = null;
    publish(new Set());
    try {
      void channel.untrack().finally(() => {
        try {
          sb.removeChannel(channel);
        } catch {
          /* already gone */
        }
      });
    } catch {
      try {
        sb.removeChannel(channel);
      } catch {
        /* already gone */
      }
    }
  };
};
