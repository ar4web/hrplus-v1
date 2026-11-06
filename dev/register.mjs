// Installs the module resolve hook that swaps @supabase/supabase-js for the
// local emulator. Usage: node --import ./dev/register.mjs dev/server.mjs
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
