// Pure logic: no DOM, no storage. Everything here is covered by tests/logic.test.mjs.

export const SCHEMA_VERSION = 1;
export const CANONICAL_UNIT = 'lb'; // every stored weight is in pounds; kg is display/input only
export const LB_PER_KG = 2.2046226218;
export const MUSCLE_GROUPS = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads',
  'Hamstrings / Glutes', 'Calves', 'Abs', 'Other'];

export function uid() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 8);
}

/* ---------- numbers and units ---------- */

export function roundTo(n, dp = 2) {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}
export function toDisplay(lb, unit) {
  if (lb == null) return null;
  return unit === 'kg' ? lb / LB_PER_KG : lb;
}
export function toCanonical(value, unit) {
  if (value == null) return null;
  return unit === 'kg' ? value * LB_PER_KG : value;
}
export function formatNumber(n, dp = 2) {
  if (n == null || !Number.isFinite(n)) return '';
  return String(roundTo(n, dp));
}
/** Keeps only digits and one decimal point. Accepts a comma as the decimal mark. */
export function sanitizeDecimal(str) {
  let s = String(str).replace(/,/g, '.').replace(/[^0-9.]/g, '');
  const i = s.indexOf('.');
  if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '');
  return s;
}
/** "70", "67.5", "67,5" -> number. Blank, negative or junk -> null. */
export function parseDecimal(str) {
  if (typeof str !== 'string') return null;
  const s = str.trim().replace(',', '.');
  if (s === '' || s === '.' || !/^\d*\.?\d*$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
/** Whole numbers only. Blank, negative, decimal or junk -> null. */
export function parseInteger(str) {
  if (typeof str !== 'string') return null;
  const s = str.trim();
  if (!/^\d+$/.test(s)) return null;
  return Number(s);
}

/* ---------- sets, volume, estimated 1RM ---------- */

/** A set counts toward history and stats only when it is checked off and has reps. */
export function isCountedSet(set) {
  return !!set && set.isCompleted === true && Number.isInteger(set.reps) && set.reps > 0;
}
/** Epley: weight x (1 + reps / 30). A single rep is the weight itself. */
export function epley1RM(weight, reps) {
  if (!(weight > 0) || !(reps > 0)) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}
export function setVolume(set) {
  return (set.weight || 0) * (set.reps || 0);
}
export function sessionVolume(sets) {
  return sets.filter(isCountedSet).reduce((sum, s) => sum + setVolume(s), 0);
}

/* ---------- workout history ---------- */

/**
 * The most recent COMPLETED workout containing this exercise.
 * opts.before: only workouts that started before this timestamp.
 * opts.excludeId: skip this workout (the one being edited).
 */
export function findLastPerformance(workouts, exerciseId, opts = {}) {
  const before = opts.before ?? Infinity;
  const excludeId = opts.excludeId ?? null;
  let best = null;
  for (const w of workouts) {
    if (!w.isCompleted || w.id === excludeId || !(w.startedAt < before)) continue;
    if (best && w.startedAt <= best.startedAt) continue;
    const entries = w.exercises.filter((e) => e.exerciseId === exerciseId);
    const sets = entries.flatMap((e) => e.sets.filter(isCountedSet));
    if (!sets.length) continue;
    best = {
      workoutId: w.id,
      startedAt: w.startedAt,
      sets: sets.map((s) => ({ weight: s.weight || 0, reps: s.reps })),
      notes: entries.map((e) => e.notes || '').filter(Boolean).join(' · '),
    };
  }
  return best;
}

/** Every completed session of an exercise, oldest first. */
export function exerciseSessions(workouts, exerciseId) {
  const out = [];
  for (const w of workouts) {
    if (!w.isCompleted) continue;
    const entries = w.exercises.filter((e) => e.exerciseId === exerciseId);
    const sets = entries.flatMap((e) => e.sets.filter(isCountedSet))
      .map((s) => ({ weight: s.weight || 0, reps: s.reps }));
    if (!sets.length) continue;
    out.push({
      workoutId: w.id,
      date: w.startedAt,
      sets,
      notes: entries.map((e) => e.notes || '').filter(Boolean).join(' · '),
      volume: sets.reduce((sum, s) => sum + s.weight * s.reps, 0),
      topWeight: Math.max(...sets.map((s) => s.weight)),
      best1RM: Math.max(...sets.map((s) => epley1RM(s.weight, s.reps))),
    });
  }
  return out.sort((a, b) => a.date - b.date);
}

export function exerciseStats(sessions) {
  if (!sessions.length) return null;
  let heaviest = null;
  let best = null;
  for (const s of sessions) {
    for (const set of s.sets) {
      if (!heaviest || set.weight > heaviest.weight ||
          (set.weight === heaviest.weight && set.reps > heaviest.reps)) {
        heaviest = { weight: set.weight, reps: set.reps, date: s.date };
      }
      const e = epley1RM(set.weight, set.reps);
      if (!best || e > best.value) best = { value: e, weight: set.weight, reps: set.reps, date: s.date };
    }
  }
  const last = sessions[sessions.length - 1];
  const rank = (s) => epley1RM(s.weight, s.reps) || s.reps / 1000;
  const topSet = last.sets.reduce((a, b) => (rank(b) > rank(a) ? b : a));
  return {
    sessionCount: sessions.length,
    last: { date: last.date, topSet, volume: last.volume, sets: last.sets },
    heaviest, // .reps is the most reps ever done at that heaviest weight
    best1RM: best,
  };
}

/* ---------- dates (always the user's LOCAL calendar) ---------- */

const pad2 = (n) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD. Never goes through UTC, so late-evening entries stay on the right day. */
export function localDateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
export function isValidDateKey(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  return localDateKey(parseDateKey(key)) === key;
}
/** YYYY-MM-DD -> Date at local midnight. */
export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(key, n) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + n);
  return localDateKey(d);
}
/** Whole days from a to b (b - a). Daylight-saving safe. */
export function dayDiff(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

export const RANGES = [
  { id: '1M', months: 1 }, { id: '3M', months: 3 }, { id: '6M', months: 6 },
  { id: '1Y', months: 12 }, { id: 'All', months: null },
];
/** Calendar-month subtraction, clamped to the month's last day (Mar 31 - 1M = Feb 28/29). Returns local midnight. */
export function subtractMonths(date, months) {
  const d = new Date(date.getFullYear(), date.getMonth() - months, 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(date.getDate(), lastDay));
  return d;
}
export function rangeStart(rangeId, now = new Date()) {
  const r = RANGES.find((x) => x.id === rangeId);
  if (!r || r.months == null) return null;
  return subtractMonths(now, r.months);
}
export function filterByRange(items, rangeId, getTime, now = new Date()) {
  const start = rangeStart(rangeId, now);
  if (!start) return items.slice();
  const t0 = start.getTime();
  return items.filter((it) => getTime(it) >= t0);
}

/* ---------- body measurements ---------- */

export function sortMeasurements(list, newestFirst = true) {
  return list.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) * (newestFirst ? -1 : 1));
}
/** Average of whatever weigh-ins exist in the 7 days ending today. Missing days are simply skipped. */
export function sevenDayAverage(measurements, todayKey = localDateKey()) {
  const vals = measurements
    .filter((m) => m.weight != null && dayDiff(m.date, todayKey) >= 0 && dayDiff(m.date, todayKey) <= 6)
    .map((m) => m.weight);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
/**
 * Change across the last 30 days: newest entry minus the oldest entry inside the window.
 * Entries without the field (e.g. no body fat that day) are ignored. Needs two entries.
 */
export function thirtyDayChange(measurements, field, todayKey = localDateKey()) {
  const inWindow = sortMeasurements(measurements, false).filter((m) => {
    const diff = dayDiff(m.date, todayKey);
    return m[field] != null && diff >= 0 && diff <= 30;
  });
  if (inWindow.length < 2) return null;
  const first = inWindow[0];
  const last = inWindow[inWindow.length - 1];
  return { change: last[field] - first[field], from: first.date, to: last.date };
}
/** Trailing moving average of weight, one value per weigh-in date, oldest first. */
export function movingAverage(measurements, windowDays = 7) {
  const asc = sortMeasurements(measurements.filter((m) => m.weight != null), false);
  return asc.map((m) => {
    const vals = asc.filter((o) => {
      const diff = dayDiff(o.date, m.date);
      return diff >= 0 && diff < windowDays;
    }).map((o) => o.weight);
    return { date: m.date, value: vals.reduce((a, b) => a + b, 0) / vals.length };
  });
}

/* ---------- backup ---------- */

export function buildBackup(data, now = new Date()) {
  return {
    app: 'logbook',
    schemaVersion: SCHEMA_VERSION,
    canonicalWeightUnit: CANONICAL_UNIT,
    exportedAt: now.toISOString(),
    settings: { weightUnit: data.settings?.weightUnit || 'lb', theme: data.settings?.theme || 'system' },
    customExercises: data.customExercises || [],
    workouts: data.workouts || [],
    bodyMeasurements: data.body || [],
  };
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const str = (v) => (typeof v === 'string' ? v : '');

/**
 * Checks a parsed backup file and returns a clean copy of its data.
 * Never throws. { ok: true, data, warnings } or { ok: false, error }.
 * libraryIds: ids of the built-in exercises, so unknown ids can be kept as placeholders.
 */
export function validateBackup(raw, libraryIds = new Set()) {
  const fail = (error) => ({ ok: false, error });
  try {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.app !== 'logbook') {
      return fail('This file is not a Logbook backup.');
    }
    if (!Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1) {
      return fail('This backup has no valid version number.');
    }
    if (raw.schemaVersion > SCHEMA_VERSION) {
      return fail('This backup was made by a newer version of Logbook. Update the app, then try again.');
    }
    for (const key of ['customExercises', 'workouts', 'bodyMeasurements']) {
      if (!Array.isArray(raw[key])) return fail(`The backup is missing its "${key}" list.`);
    }
    const warnings = [];
    const now = Date.now();

    const customExercises = [];
    const customIds = new Set();
    for (const e of raw.customExercises) {
      if (!e || typeof e.id !== 'string' || !e.id || typeof e.name !== 'string' || !e.name.trim()) {
        return fail('The backup contains a custom exercise with no name or id.');
      }
      if (customIds.has(e.id) || libraryIds.has(e.id)) continue;
      customIds.add(e.id);
      customExercises.push({
        id: e.id, name: e.name.trim().slice(0, 80),
        muscleGroup: MUSCLE_GROUPS.includes(e.muscleGroup) ? e.muscleGroup : 'Other',
        isCustom: true, createdAt: isNum(e.createdAt) ? e.createdAt : now,
      });
    }

    const workouts = [];
    const workoutIds = new Set();
    let unfinished = 0;
    for (const w of raw.workouts) {
      if (!w || typeof w.id !== 'string' || !w.id || workoutIds.has(w.id)) return fail('The backup contains a workout with a missing or repeated id.');
      if (!isNum(w.startedAt) || w.startedAt <= 0) return fail('The backup contains a workout with no start time.');
      if (typeof w.isCompleted !== 'boolean') return fail('The backup contains a workout with no completion status.');
      if (!Array.isArray(w.exercises)) return fail('The backup contains a workout with no exercise list.');
      if (!w.isCompleted && ++unfinished > 1) return fail('The backup contains more than one unfinished workout.');
      workoutIds.add(w.id);
      const exercises = [];
      for (const e of w.exercises) {
        if (!e || typeof e.exerciseId !== 'string' || !e.exerciseId || !Array.isArray(e.sets)) {
          return fail('The backup contains an exercise entry that cannot be read.');
        }
        if (!libraryIds.has(e.exerciseId) && !customIds.has(e.exerciseId)) {
          customIds.add(e.exerciseId);
          customExercises.push({ id: e.exerciseId, name: 'Imported exercise', muscleGroup: 'Other', isCustom: true, createdAt: now });
          warnings.push('An exercise that is no longer in the library was kept as "Imported exercise".');
        }
        const sets = [];
        for (const s of e.sets) {
          if (!s || typeof s !== 'object') return fail('The backup contains a set that cannot be read.');
          const weightOk = s.weight == null || (isNum(s.weight) && s.weight >= 0);
          const repsOk = s.reps == null || (Number.isInteger(s.reps) && s.reps >= 0);
          if (!weightOk || !repsOk) return fail('The backup contains a set with an invalid weight or rep count.');
          sets.push({ id: str(s.id) || uid(), weight: s.weight ?? null, reps: s.reps ?? null, isCompleted: s.isCompleted === true });
        }
        exercises.push({ id: str(e.id) || uid(), exerciseId: e.exerciseId, notes: str(e.notes), sets });
      }
      workouts.push({
        id: w.id, startedAt: w.startedAt,
        completedAt: w.isCompleted ? (isNum(w.completedAt) ? w.completedAt : w.startedAt) : null,
        isCompleted: w.isCompleted, notes: str(w.notes), exercises,
      });
    }

    const body = [];
    const dates = new Set();
    for (const m of raw.bodyMeasurements) {
      if (!m || !isValidDateKey(m.date)) return fail('The backup contains a body entry with an invalid date.');
      if (dates.has(m.date)) return fail(`The backup contains two body entries for ${m.date}.`);
      if (!isNum(m.weight) || m.weight <= 0) return fail('The backup contains a body entry with an invalid weight.');
      const bf = m.bodyFat ?? null;
      if (bf !== null && (!isNum(bf) || bf < 0 || bf > 100)) return fail('The backup contains a body entry with an invalid body-fat value.');
      dates.add(m.date);
      body.push({
        id: str(m.id) || uid(), date: m.date, weight: m.weight, bodyFat: bf,
        createdAt: isNum(m.createdAt) ? m.createdAt : now, updatedAt: isNum(m.updatedAt) ? m.updatedAt : now,
      });
    }

    const s = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
    const settings = {
      weightUnit: s.weightUnit === 'kg' ? 'kg' : 'lb',
      theme: ['system', 'light', 'dark'].includes(s.theme) ? s.theme : 'system',
    };
    return {
      ok: true,
      data: { workouts, body, customExercises, settings },
      warnings: [...new Set(warnings)],
      exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : null,
    };
  } catch (err) {
    return fail('This backup file could not be read.');
  }
}

/** Text of a file -> validated backup. Bad JSON becomes a friendly error instead of a crash. */
export function parseBackupText(text, libraryIds) {
  let raw;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: 'This file is not valid JSON, so it cannot be a Logbook backup.' }; }
  return validateBackup(raw, libraryIds);
}
