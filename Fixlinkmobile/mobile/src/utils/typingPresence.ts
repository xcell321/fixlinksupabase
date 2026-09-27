import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';

// Typing presence over Supabase Realtime. No backend changes, no tables.
// Each job thread maps to channel `typing:job:{jobId}`. Typing state travels
// peer to peer through Supabase cloud, so it works through tunnel links, LAN,
// and mobile data. Missing env disables presence silently, chat still works.
//
// One persistent channel per open thread. Ephemeral join/leave churn caused
// flapping (worked, then stopped), so the channel stays joined while the
// thread is open and only the typing flag flips.
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

export interface TypingPeer {
  uid: string;
  name: string;
}

interface OpenThread {
  channel: RealtimeChannel;
  myUid: string;
  myName: string;
  lastSent: boolean;
}

const openThreads = new Map<string, OpenThread>();

const readPeers = (channel: RealtimeChannel | null, myUid: string): TypingPeer[] => {
  const peers: TypingPeer[] = [];
  try {
    const state = channel?.presenceState() ?? {};
    for (const [key, presences] of Object.entries(state)) {
      if (key === myUid) continue;
      const first = (presences as Array<{ typing?: boolean; name?: string }>)[0];
      if (first?.typing) peers.push({ uid: key, name: first.name || 'Peer' });
    }
  } catch {}
  return peers;
};

// Joins the thread channel and streams peer typing state. Callback fires with
// the list of OTHER users currently typing. Leave on thread exit.
export const subscribeTyping = (
  jobId: string,
  me: { uid: string; name: string },
  onPeers: (peers: TypingPeer[]) => void,
): (() => void) => {
  const sb = getClient();
  if (!sb || !jobId || !me.uid) {
    console.log('[typing] disabled: missing env, job, or uid');
    return () => {};
  }
  const key = `${jobId}:${me.uid}`;
  const existing = openThreads.get(key);
  if (existing) {
    onPeers(readPeers(existing.channel, me.uid));
    return () => leaveTyping(jobId, me);
  }
  let channel: RealtimeChannel;
  try {
    channel = sb.channel(`typing:job:${jobId}`, { config: { presence: { key: me.uid } } });
    openThreads.set(key, { channel, myUid: me.uid, myName: me.name, lastSent: false });
    channel
      .on('presence', { event: 'sync' }, () => {
        const peers = readPeers(channel, me.uid);
        console.log(`[typing] sync job=${jobId} peers=${peers.length}`);
        onPeers(peers);
      })
      .on('presence', { event: 'join' }, () => onPeers(readPeers(channel, me.uid)))
      .on('presence', { event: 'leave' }, () => onPeers(readPeers(channel, me.uid)))
      .subscribe((status) => {
        console.log(`[typing] subscribe job=${jobId} status=${status}`);
      });
  } catch {
    openThreads.delete(key);
    return () => {};
  }
  return () => leaveTyping(jobId, me);
};

const leaveTyping = (jobId: string, me: { uid: string }): void => {
  const key = `${jobId}:${me.uid}`;
  const open = openThreads.get(key);
  if (!open) return;
  openThreads.delete(key);
  const sb = getClient();
  if (!sb) return;
  try {
    void open.channel.untrack().finally(() => {
      try {
        sb.removeChannel(open.channel);
      } catch {}
    });
  } catch {
    try {
      sb.removeChannel(open.channel);
    } catch {}
  }
};

// Flips my typing flag on the open thread channel. Throttle keystrokes at the
// call site. False on send, clear, and thread exit. Never throws.
export const setTyping = async (
  jobId: string,
  me: { uid: string; name: string },
  typing: boolean,
): Promise<void> => {
  const open = openThreads.get(`${jobId}:${me.uid}`);
  if (!open || open.lastSent === typing) return;
  open.lastSent = typing;
  open.myName = me.name;
  try {
    await open.channel.track({ typing, name: me.name });
  } catch {
    open.lastSent = !typing;
  }
};
