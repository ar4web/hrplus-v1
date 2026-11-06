// Dummy Supabase settings for the local emulator. The API handlers resolve
// their config from the environment, so give them harmless local values; the
// module loader (dev/hooks.mjs) swaps the real client for the emulator anyway.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://127.0.0.1:8787/local-supabase';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'local-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'local-service-role-key';
