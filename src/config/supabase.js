const { createClient } = require('@supabase/supabase-js');

let _supabaseAdmin = null;

/**
 * Supabase is used as a DATABASE ONLY in this project.
 * Firebase handles all authentication.
 *
 * We only need the service role (admin) client — it bypasses RLS and is used
 * exclusively on the backend. Never expose this key to mobile clients.
 */
function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
    }
    _supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }
  return _supabaseAdmin;
}

const supabaseAdmin = new Proxy({}, {
  get(_, prop) { return getSupabaseAdmin()[prop]; },
});

module.exports = { supabaseAdmin };
