import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type RealtimeOptions = NonNullable<NonNullable<Parameters<typeof createClient>[2]>['realtime']>;

// Standard client for auth (runs in anon context)
const realtime: RealtimeOptions = {
  // @types/ws exposes a stricter Node-only constructor overload than the
  // WebSocketLike constructor accepted by realtime-js. Runtime behavior is
  // compatible; keep the adapter at this integration boundary.
  transport: WebSocket as unknown as NonNullable<RealtimeOptions['transport']>,
};

// Node 20 does not expose a native WebSocket. Supplying the existing ws
// transport keeps route-handler imports/runtime tests deterministic without
// weakening authentication or QStash verification.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, { realtime });

// Client admin untuk bypass RLS (Gunakan HANYA di server side)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, { realtime });
