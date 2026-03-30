/**
 * Compatibility Scoring Engine
 *
 * Scores range 0–100. Higher = more compatible.
 * Weights:
 *   - Shared fitness goals  : 50 pts
 *   - Matching fitness level: 25 pts
 *   - Activity recency      : 15 pts  (based on current_streak)
 *   - Distance proximity    : 10 pts
 */

const GOAL_WEIGHT      = 50;
const LEVEL_WEIGHT     = 25;
const ACTIVITY_WEIGHT  = 15;
const DISTANCE_WEIGHT  = 10;

const LEVEL_ORDER = { beginner: 0, intermediate: 1, advanced: 2 };

/**
 * Computes compatibility score between two profile objects.
 * @param {object} me     — requester's profile row
 * @param {object} target — candidate's profile row
 * @param {number} distanceKm — haversine distance between the two users
 * @returns {number} score 0–100
 */
function computeScore(me, target, distanceKm) {
  let score = 0;

  // 1. Shared fitness goals
  const myGoals     = new Set(me.fitness_goals     || []);
  const theirGoals  = new Set(target.fitness_goals || []);
  const sharedCount = [...myGoals].filter(g => theirGoals.has(g)).length;
  const totalUnique = new Set([...myGoals, ...theirGoals]).size || 1;
  score += (sharedCount / totalUnique) * GOAL_WEIGHT;

  // 2. Fitness level compatibility (adjacent levels score partial credit)
  const myLevel  = LEVEL_ORDER[me.fitness_level]     ?? 1;
  const theirLvl = LEVEL_ORDER[target.fitness_level] ?? 1;
  const diff     = Math.abs(myLevel - theirLvl);
  const levelScore = diff === 0 ? LEVEL_WEIGHT : diff === 1 ? LEVEL_WEIGHT * 0.6 : 0;
  score += levelScore;

  // 3. Activity recency (streak)
  const streak = target.current_streak || 0;
  const activityScore = streak >= 30 ? ACTIVITY_WEIGHT
    : streak >= 7  ? ACTIVITY_WEIGHT * 0.7
    : streak >= 1  ? ACTIVITY_WEIGHT * 0.4
    : 0;
  score += activityScore;

  // 4. Distance proximity
  const distScore = distanceKm <= 5  ? DISTANCE_WEIGHT
    : distanceKm <= 15 ? DISTANCE_WEIGHT * 0.8
    : distanceKm <= 30 ? DISTANCE_WEIGHT * 0.5
    : distanceKm <= 50 ? DISTANCE_WEIGHT * 0.2
    : 0;
  score += distScore;

  return Math.round(score);
}

/**
 * Haversine formula — returns distance in km between two lat/lng points.
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = _toRad(lat2 - lat1);
  const dLon = _toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(_toRad(lat1)) * Math.cos(_toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function _toRad(deg) { return (deg * Math.PI) / 180; }

module.exports = { computeScore, haversineKm };
