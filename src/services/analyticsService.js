const { supabaseAdmin } = require('../config/supabase');

async function getOverview() {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const monthStartStr = monthStart.split('T')[0];

  const [
    { count: totalUsers },
    { data: todayCheckins },
    { count: newThisWeek },
    { count: totalMatches },
    { count: totalMessages },
    { count: bannedUsers },
    { count: verifiedUsers },
    { data: mauCheckins },
  ] = await Promise.all([
    supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('checkins').select('user_id').eq('date', todayStr),
    supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo.toISOString()),
    supabaseAdmin.from('matches').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('messages').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).eq('is_banned', true),
    supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).eq('is_verified', true),
    supabaseAdmin.from('checkins').select('user_id').gte('date', monthStartStr),
  ]);

  // Deduplicate — count distinct users, not rows
  const activeToday = new Set((todayCheckins || []).map(r => r.user_id)).size;
  const mau         = new Set((mauCheckins   || []).map(r => r.user_id)).size;

  return {
    total_users:    totalUsers,
    active_today:   activeToday,
    new_this_week:  newThisWeek,
    total_matches:  totalMatches,
    total_messages: totalMessages,
    banned_users:   bannedUsers,
    verified_users: verifiedUsers,
    mau,
    as_of:          now.toISOString(),
  };
}

async function getDailyActiveUsers(days) {
  const from = new Date();
  from.setDate(from.getDate() - days);
  const fromStr = from.toISOString().split('T')[0];

  // Count unique users who checked in each day
  const { data, error } = await supabaseAdmin
    .from('checkins')
    .select('date, user_id')
    .gte('date', fromStr)
    .order('date', { ascending: true });

  if (error) throw new Error(error.message);

  // Group by date
  const byDate = {};
  for (const row of data || []) {
    if (!byDate[row.date]) byDate[row.date] = new Set();
    byDate[row.date].add(row.user_id);
  }

  // Fill every day in range with 0 if no data
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    result.push({ date: dateStr, count: byDate[dateStr] ? byDate[dateStr].size : 0 });
  }

  return { data: result, days };
}

async function getMonthlyActiveUsers(months) {
  const from = new Date();
  from.setMonth(from.getMonth() - months);
  const fromStr = from.toISOString().split('T')[0];

  const { data, error } = await supabaseAdmin
    .from('checkins')
    .select('date, user_id')
    .gte('date', fromStr);

  if (error) throw new Error(error.message);

  // Group by YYYY-MM
  const byMonth = {};
  for (const row of data || []) {
    const month = row.date.slice(0, 7); // "YYYY-MM"
    if (!byMonth[month]) byMonth[month] = new Set();
    byMonth[month].add(row.user_id);
  }

  const result = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, users]) => ({ month, active_users: users.size }));

  return { mau: result, months };
}

async function getRetention() {
  // D1, D7, D30 retention: of users who signed up N days ago, how many checked in yesterday?
  const cohorts = [
    { label: 'D1',  days_ago_signup: 1 },
    { label: 'D7',  days_ago_signup: 7 },
    { label: 'D30', days_ago_signup: 30 },
  ];

  const now = new Date();
  const yesterdayStr = new Date(now.getTime() - 86400000).toISOString().split('T')[0];

  const results = await Promise.all(cohorts.map(async ({ label, days_ago_signup }) => {
    const cohortDate = new Date(now.getTime() - days_ago_signup * 86400000).toISOString().split('T')[0];

    // Users who created profile on cohort date
    const { data: cohortUsers } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .gte('created_at', `${cohortDate}T00:00:00Z`)
      .lt('created_at',  `${cohortDate}T23:59:59Z`);

    if (!cohortUsers || cohortUsers.length === 0) return { label, cohort_size: 0, retained: 0, rate: 0 };

    const cohortIds = cohortUsers.map(u => u.id);

    // How many checked in yesterday
    const { count: retained } = await supabaseAdmin
      .from('checkins')
      .select('user_id', { count: 'exact', head: true })
      .eq('date', yesterdayStr)
      .in('user_id', cohortIds);

    return {
      label,
      cohort_date: cohortDate,
      cohort_size: cohortIds.length,
      retained: retained || 0,
      rate: cohortIds.length > 0 ? Math.round(((retained || 0) / cohortIds.length) * 100) : 0,
    };
  }));

  const byLabel = {};
  for (const r of results) byLabel[r.label.toLowerCase()] = r.rate;
  return { d1: byLabel.d1 ?? 0, d7: byLabel.d7 ?? 0, d30: byLabel.d30 ?? 0, detail: results };
}

async function getUserGrowth(days) {
  const from = new Date();
  from.setDate(from.getDate() - days);

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('created_at')
    .gte('created_at', from.toISOString())
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);

  const byDate = {};
  for (const row of data || []) {
    const date = row.created_at.split('T')[0];
    byDate[date] = (byDate[date] || 0) + 1;
  }

  // Fill every day in range with 0 if no signups
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    result.push({ date: dateStr, count: byDate[dateStr] || 0 });
  }

  return { data: result, days, total_new: (data || []).length };
}

async function getMatchStats(days) {
  const from = new Date();
  from.setDate(from.getDate() - days);

  const { data, error } = await supabaseAdmin
    .from('matches')
    .select('created_at')
    .gte('created_at', from.toISOString())
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);

  const byDate = {};
  for (const row of data || []) {
    const date = row.created_at.split('T')[0];
    byDate[date] = (byDate[date] || 0) + 1;
  }

  // Fill every day in range with 0
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    result.push({ date: dateStr, count: byDate[dateStr] || 0 });
  }

  return { data: result, days, total_matches: (data || []).length };
}

module.exports = { getOverview, getDailyActiveUsers, getMonthlyActiveUsers, getRetention, getUserGrowth, getMatchStats };
