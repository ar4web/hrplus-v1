// Stub of the Supabase client for unit tests that must observe auth calls.
// Records every setSession / signInWithIdToken invocation on globalThis.__authCalls.
globalThis.__authCalls = [];
const record = (kind) => async (args) => {
  globalThis.__authCalls.push({ kind, args });
  return { data: {}, error: null };
};
export default {
  auth: {
    setSession: record('setSession'),
    signInWithIdToken: record('signInWithIdToken'),
    getSession: async () => ({ data: { session: null }, error: null }),
  },
};
