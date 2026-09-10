/**
 * Authoritative Streak Calculation Service
 *
 * Calculates the current consecutive practice day streak from a list of test results.
 * Key properties:
 * 1. Independent of pagination: processes all user test result timestamps.
 * 2. Day-deduplication: multiple tests completed on the same calendar day count as one practice day.
 * 3. Gap-breaking: missing calendar days break the current streak.
 *    If the user practiced today, the streak includes today and consecutive previous days.
 *    If the user has not practiced today yet but practiced yesterday, the streak remains active
 *    from yesterday. If yesterday was missed as well, the streak is broken (0).
 * 4. Timezone-independent: all day boundaries and comparisons use UTC calendar dates.
 */

function extractUtcDateString(item) {
  if (!item) return null;
  const raw = item.createdAt || item.date || item;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function calculateStreak(results, referenceDate = new Date()) {
  if (!Array.isArray(results) || results.length === 0) {
    return 0;
  }

  const ref = new Date(referenceDate);
  if (Number.isNaN(ref.getTime())) {
    return 0;
  }

  // Extract unique UTC dates (YYYY-MM-DD)
  const uniqueDays = new Set();
  for (const item of results) {
    const dateStr = extractUtcDateString(item);
    if (dateStr) {
      uniqueDays.add(dateStr);
    }
  }

  if (uniqueDays.size === 0) {
    return 0;
  }

  const refYear = ref.getUTCFullYear();
  const refMonth = ref.getUTCMonth();
  const refDay = ref.getUTCDate();

  const todayUtcStr = new Date(Date.UTC(refYear, refMonth, refDay)).toISOString().slice(0, 10);
  const yesterdayUtcStr = new Date(Date.UTC(refYear, refMonth, refDay - 1)).toISOString().slice(0, 10);

  // Filter out any anomalous future dates beyond the reference day and sort descending
  const sortedDays = Array.from(uniqueDays)
    .filter((day) => day <= todayUtcStr)
    .sort()
    .reverse();

  if (sortedDays.length === 0) {
    return 0;
  }

  const mostRecentDay = sortedDays[0];

  // If the most recent test was neither today nor yesterday, the streak is broken
  if (mostRecentDay !== todayUtcStr && mostRecentDay !== yesterdayUtcStr) {
    return 0;
  }

  // Starting anchor: today if practiced today; yesterday if not yet practiced today
  const isToday = mostRecentDay === todayUtcStr;
  const startOffset = isToday ? 0 : 1;

  let streak = 0;
  for (let i = 0; i < sortedDays.length; i++) {
    const expectedStr = new Date(
      Date.UTC(refYear, refMonth, refDay - startOffset - i)
    ).toISOString().slice(0, 10);

    if (sortedDays[i] === expectedStr) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

module.exports = {
  calculateStreak,
  extractUtcDateString,
};
