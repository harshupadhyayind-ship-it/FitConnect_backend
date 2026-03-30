const { supabaseAdmin } = require('../config/supabase');

/**
 * Admin guard — runs AFTER fastify.authenticate.
 * Checks that the authenticated user has is_admin = true in the profiles table.
 *
 * Usage on a route:
 *   { onRequest: [fastify.authenticate, fastify.adminOnly] }
 */
async function adminOnly(request, reply) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', request.user.sub)
    .single();

  if (error || !data?.is_admin) {
    return reply.code(403).send({ error: 'Forbidden — admin access required' });
  }
}

module.exports = { adminOnly };
