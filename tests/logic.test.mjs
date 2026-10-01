// Run with: npm test   (needs only Node.js, nothing to install)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  epley1RM, setVolume, sessionVolume, isCountedSet, findLastPerformance, exerciseSessions, exerciseStats,
  sevenDayAverage, thirtyDayChange, movingAverage, toDisplay, toCanonical, formatNumber, LB_PER_KG,
  parseDecimal, parseInteger, sanitizeDecimal, localDateKey, parseDateKey, addDays, dayDiff, isValidDateKey,
  subtractMonths, rangeStart, filterByRange, buildBackup, validateBackup, parseBackupText, SCHEMA_VERSION,
} from '../js/logic.js';
import { LIBRARY, LIBRARY_IDS } from '../js/exercises.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} is not close to ${b}`);
const set = (weight, reps, isCompleted = true) => ({ id: `${weight}-${reps}-${Math.random()}`, weight, reps, isCompleted });
const at = (y, m, d, h = 18) => new Date(y, m - 1, d, h).getTime();
const workout = (id, startedAt, exercises, isCompleted = true) => ({
  id, startedAt, completedAt: isCompleted ? startedAt + 3600000 : null, isCompleted, notes: '',
  exercises: exercises.map(([exerciseId, sets, notes = ''], i) => ({ id: `${id}-e${i}`, exerciseId, notes, sets })),
});
const IDP = 'incline-dumbbell-press';

test('1. estimated 1RM uses Epley', () => {
  near(epley1RM(70, 10), 70 * (1 + 10 / 30));
  near(epley1RM(100, 30), 200);
  assert.equal(epley1RM(225, 1), 225, 'a single is its own max');
  assert.equal(epley1RM(0, 12), 0);
  assert.equal(epley1RM(100, 0), 0);
});

test('2. workout volume', () => {
  assert.equal(setVolume(set(70, 10)), 700);
  assert.equal(sessionVolume([set(70, 10), set(70, 9), set(65, 11)]), 700 + 630 + 715);
  assert.equal(sessionVolume([]), 0);
  assert.equal(sessionVolume([set(67.5, 8)]), 540, 'decimal weights');
});

test('3. Last Time finds the most recent completed workout with that exercise', () => {
  const workouts = [
    workout('a', at(2026, 9, 16), [[IDP, [set(60, 12), set(60, 11), set(60, 10)]]]),
    workout('c', at(2026, 9, 28), [[IDP, [set(70, 10), set(70, 9), set(65, 11)], 'Bench notch 4']]),
    workout('b', at(2026, 9, 22), [[IDP, [set(65, 11), set(65, 10), set(65, 9)]]]),
    workout('d', at(2026, 9, 30), [['cable-fly', [set(30, 12)]]]),
    workout('active', at(2026, 10, 1), [[IDP, [set(75, 8)]]], false),
  ];
  const last = findLastPerformance(workouts, IDP);
  assert.equal(last.workoutId, 'c');
  assert.deepEqual(last.sets, [{ weight: 70, reps: 10 }, { weight: 70, reps: 9 }, { weight: 65, reps: 11 }]);
  assert.equal(last.notes, 'Bench notch 4');
  assert.equal(findLastPerformance(workouts, 'hack-squat'), null, 'never performed');
  assert.equal(findLastPerformance([], IDP), null, 'no workouts at all');
  // editing an old workout looks only at earlier ones
  assert.equal(findLastPerformance(workouts, IDP, { before: at(2026, 9, 28), excludeId: 'c' }).workoutId, 'b');
  assert.equal(findLastPerformance(workouts, IDP, { before: at(2026, 9, 16), excludeId: 'a' }), null);
  // a newly finished workout becomes Last Time; deleting it falls back
  const more = [...workouts, workout('e', at(2026, 10, 1, 19), [[IDP, [set(72.5, 10)]]])];
  assert.equal(findLastPerformance(more, IDP).workoutId, 'e');
  assert.equal(findLastPerformance(more.filter((w) => w.id !== 'e'), IDP).workoutId, 'c');
});

test('4. 7-day weight average uses whatever entries exist', () => {
  const m = [
    { date: '2026-10-01', weight: 184 }, { date: '2026-09-29', weight: 185 }, { date: '2026-09-25', weight: 186 },
    { date: '2026-09-24', weight: 200 }, // 7 days before Oct 1: outside the window
  ];
  near(sevenDayAverage(m, '2026-10-01'), (184 + 185 + 186) / 3);
  assert.equal(sevenDayAverage([], '2026-10-01'), null);
  assert.equal(sevenDayAverage([{ date: '2026-09-01', weight: 190 }], '2026-10-01'), null);
  near(sevenDayAverage([{ date: '2026-10-01', weight: 184.6 }], '2026-10-01'), 184.6);
  assert.equal(sevenDayAverage([{ date: '2026-10-02', weight: 150 }], '2026-10-01'), null, 'future dates ignored');
});

test('5. 30-day weight change', () => {
  const m = [
    { date: '2026-10-01', weight: 184.6 }, { date: '2026-09-15', weight: 185.8 },
    { date: '2026-09-02', weight: 186.4 }, { date: '2026-08-20', weight: 190 },
  ];
  const c = thirtyDayChange(m, 'weight', '2026-10-01');
  near(c.change, 184.6 - 186.4);
  assert.equal(c.from, '2026-09-02');
  assert.equal(thirtyDayChange([{ date: '2026-10-01', weight: 184 }], 'weight', '2026-10-01'), null, 'one entry is not a trend');
  assert.equal(thirtyDayChange([], 'weight', '2026-10-01'), null);
});

test('6. lb/kg conversion never changes stored data', () => {
  near(toDisplay(220.46226218, 'kg'), 100);
  assert.equal(toDisplay(70, 'lb'), 70);
  assert.equal(formatNumber(toDisplay(toCanonical(32.5, 'kg'), 'kg')), '32.5', 'kg entry round-trips');
  assert.equal(formatNumber(toDisplay(toCanonical(70, 'lb'), 'lb')), '70');
  for (const kg of [2.5, 20, 42.5, 67.5, 100, 142.5, 200]) assert.equal(formatNumber(toDisplay(toCanonical(kg, 'kg'), 'kg')), String(kg));
  assert.equal(formatNumber(toDisplay(70, 'kg')), '31.75');
  assert.equal(toDisplay(null, 'kg'), null);
  near(LB_PER_KG, 2.2046226218);
});

test('7. date-range filtering (1M, 3M, 6M, 1Y, All)', () => {
  const now = new Date(2026, 9, 1, 15, 0); // Oct 1 2026
  const items = [at(2026, 9, 30), at(2026, 9, 1, 0), at(2026, 8, 31), at(2026, 7, 2), at(2026, 4, 1, 0), at(2025, 10, 1, 0), at(2025, 9, 30), at(2020, 1, 1)];
  const count = (r) => filterByRange(items, r, (t) => t, now).length;
  assert.equal(count('1M'), 2);
  assert.equal(count('3M'), 4);
  assert.equal(count('6M'), 5);
  assert.equal(count('1Y'), 6);
  assert.equal(count('All'), 8);
  assert.equal(localDateKey(rangeStart('1M', now)), '2026-09-01');
  assert.equal(rangeStart('All', now), null);
  assert.equal(localDateKey(subtractMonths(new Date(2026, 2, 31), 1)), '2026-02-28', 'clamps to month end');
  assert.equal(localDateKey(subtractMonths(new Date(2024, 2, 31), 1)), '2024-02-29', 'leap year');
  assert.equal(localDateKey(subtractMonths(new Date(2026, 0, 15), 3)), '2025-10-15', 'crosses a year');
});

test('7b. local calendar dates never shift through UTC', () => {
  assert.equal(localDateKey(new Date(2026, 9, 1, 23, 45)), '2026-10-01', 'late evening stays today');
  assert.equal(localDateKey(new Date(2026, 9, 1, 0, 5)), '2026-10-01', 'just after midnight stays today');
  assert.equal(localDateKey(parseDateKey('2026-03-08')), '2026-03-08');
  assert.equal(addDays('2026-03-07', 1), '2026-03-08');
  assert.equal(addDays('2026-11-01', 1), '2026-11-02', 'across a daylight-saving change');
  assert.equal(dayDiff('2026-03-01', '2026-03-31'), 30);
  assert.equal(dayDiff('2026-10-25', '2026-11-05'), 11);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.ok(isValidDateKey('2024-02-29'));
  assert.ok(!isValidDateKey('2026-02-30'));
  assert.ok(!isValidDateKey('2026-2-3'));
});

test('8. missing body-fat data is handled', () => {
  const m = [
    { date: '2026-10-01', weight: 184.6, bodyFat: null }, { date: '2026-09-28', weight: 185, bodyFat: 13.8 },
    { date: '2026-09-20', weight: 185.5 }, { date: '2026-09-05', weight: 186, bodyFat: 14.4 },
  ];
  const c = thirtyDayChange(m, 'bodyFat', '2026-10-01');
  near(c.change, 13.8 - 14.4);
  assert.equal(thirtyDayChange(m.slice(0, 3), 'bodyFat', '2026-10-01'), null, 'a single body-fat entry');
  assert.equal(thirtyDayChange([{ date: '2026-10-01', weight: 184 }], 'bodyFat', '2026-10-01'), null);
  const avg = movingAverage(m);
  assert.equal(avg.length, 4);
  near(avg[avg.length - 1].value, (184.6 + 185) / 2);
  near(avg[0].value, 186);
});

test('9. incomplete sets and unfinished workouts never count', () => {
  assert.ok(!isCountedSet(set(70, 10, false)));
  assert.ok(!isCountedSet(set(70, null)));
  assert.ok(!isCountedSet(set(70, 0)));
  assert.ok(isCountedSet(set(0, 12)), 'bodyweight set counts');
  assert.equal(sessionVolume([set(70, 10), set(70, 9, false), set(65, null)]), 700);
  const workouts = [
    workout('a', at(2026, 9, 20), [[IDP, [set(65, 10)]]]),
    workout('b', at(2026, 9, 25), [[IDP, [set(70, 10), set(70, 9, false)]]]),
    workout('c', at(2026, 9, 28), [[IDP, [set(80, 5, false)]]]),          // finished, nothing checked
    workout('d', at(2026, 9, 30), [[IDP, [set(90, 5)]]], false),          // still in progress
  ];
  const last = findLastPerformance(workouts, IDP);
  assert.equal(last.workoutId, 'b');
  assert.deepEqual(last.sets, [{ weight: 70, reps: 10 }]);
  const sessions = exerciseSessions(workouts, IDP);
  assert.equal(sessions.length, 2);
  const stats = exerciseStats(sessions);
  assert.equal(stats.heaviest.weight, 70);
  assert.equal(stats.sessionCount, 2);
  assert.equal(stats.last.volume, 700);
  near(stats.best1RM.value, 70 * (1 + 10 / 30));
  assert.equal(exerciseStats([]), null);
});

test('9b. exercise stats across sessions', () => {
  const workouts = [
    workout('a', at(2026, 9, 16), [[IDP, [set(60, 12), set(60, 11), set(60, 10)]]]),
    workout('b', at(2026, 9, 22), [[IDP, [set(65, 11), set(65, 10), set(65, 9)]]]),
    workout('c', at(2026, 9, 28), [[IDP, [set(70, 10), set(70, 9), set(65, 11)]]]),
  ];
  const sessions = exerciseSessions(workouts, IDP);
  assert.deepEqual(sessions.map((s) => s.topWeight), [60, 65, 70]);
  assert.equal(sessions[2].volume, 2045);
  const stats = exerciseStats(sessions);
  assert.deepEqual([stats.heaviest.weight, stats.heaviest.reps], [70, 10], 'most reps at the heaviest weight');
  assert.deepEqual(stats.last.topSet, { weight: 70, reps: 10 });
});

test('10. backup export/import validation', () => {
  const data = {
    workouts: [workout('a', at(2026, 9, 28), [[IDP, [set(70, 10), set(67.5, 9)], 'Seat 3'], ['custom-1', [set(0, 15)]]])],
    body: [{ id: 'b1', date: '2026-10-01', weight: 184.6, bodyFat: 13.8, createdAt: 1, updatedAt: 2 }, { id: 'b2', date: '2026-09-30', weight: 184.9, bodyFat: null, createdAt: 1, updatedAt: 1 }],
    customExercises: [{ id: 'custom-1', name: 'Reverse Hyper', muscleGroup: 'Hamstrings / Glutes', isCustom: true, createdAt: 5 }],
    settings: { weightUnit: 'kg', theme: 'dark' },
  };
  const backup = JSON.parse(JSON.stringify(buildBackup(data)));
  assert.equal(backup.schemaVersion, SCHEMA_VERSION);
  assert.equal(backup.app, 'logbook');
  const ok = validateBackup(backup, LIBRARY_IDS);
  assert.ok(ok.ok, ok.error);
  assert.deepEqual(ok.data.workouts[0].exercises[0].sets.map((s) => [s.weight, s.reps, s.isCompleted]), [[70, 10, true], [67.5, 9, true]]);
  assert.equal(ok.data.workouts[0].exercises[0].notes, 'Seat 3');
  assert.deepEqual(ok.data.body.map((m) => [m.date, m.weight, m.bodyFat]), [['2026-10-01', 184.6, 13.8], ['2026-09-30', 184.9, null]]);
  assert.equal(ok.data.customExercises[0].name, 'Reverse Hyper');
  assert.deepEqual(ok.data.settings, { weightUnit: 'kg', theme: 'dark' });
  assert.equal(ok.warnings.length, 0);

  const bad = (mutate) => { const b = JSON.parse(JSON.stringify(backup)); mutate(b); return validateBackup(b, LIBRARY_IDS); };
  for (const junk of [null, 42, 'hello', [], {}, { app: 'something-else', schemaVersion: 1 }]) assert.equal(validateBackup(junk, LIBRARY_IDS).ok, false);
  assert.equal(bad((b) => { b.schemaVersion = SCHEMA_VERSION + 1; }).ok, false, 'newer version refused');
  assert.equal(bad((b) => { delete b.schemaVersion; }).ok, false);
  assert.equal(bad((b) => { delete b.workouts; }).ok, false);
  assert.equal(bad((b) => { b.bodyMeasurements = 'nope'; }).ok, false);
  assert.equal(bad((b) => { b.workouts[0].exercises[0].sets[0].weight = -5; }).ok, false, 'negative weight');
  assert.equal(bad((b) => { b.workouts[0].exercises[0].sets[0].reps = 2.5; }).ok, false, 'fractional reps');
  assert.equal(bad((b) => { b.workouts[0].exercises[0].sets[0].reps = -1; }).ok, false, 'negative reps');
  assert.equal(bad((b) => { b.workouts[0].startedAt = 'yesterday'; }).ok, false);
  assert.equal(bad((b) => { b.workouts.push(b.workouts[0]); }).ok, false, 'repeated workout id');
  assert.equal(bad((b) => { b.bodyMeasurements[0].bodyFat = 140; }).ok, false, 'body fat above 100');
  assert.equal(bad((b) => { b.bodyMeasurements[0].weight = -1; }).ok, false, 'negative body weight');
  assert.equal(bad((b) => { b.bodyMeasurements[0].date = '2026-13-40'; }).ok, false, 'impossible date');
  assert.equal(bad((b) => { b.bodyMeasurements[1].date = b.bodyMeasurements[0].date; }).ok, false, 'two entries for one day');

  const unknown = bad((b) => { b.workouts[0].exercises[0].exerciseId = 'removed-exercise'; });
  assert.ok(unknown.ok, 'unknown exercises are kept, not rejected');
  assert.ok(unknown.data.customExercises.some((e) => e.id === 'removed-exercise'));
  assert.equal(unknown.warnings.length, 1);

  assert.equal(parseBackupText('{not json', LIBRARY_IDS).ok, false);
  assert.equal(parseBackupText('', LIBRARY_IDS).ok, false);
  assert.ok(parseBackupText(JSON.stringify(backup), LIBRARY_IDS).ok);
});

test('input parsing: blanks, decimals, negatives', () => {
  assert.equal(parseDecimal(''), null);
  assert.equal(parseDecimal('.'), null);
  assert.equal(parseDecimal('67.5'), 67.5);
  assert.equal(parseDecimal('67,5'), 67.5);
  assert.equal(parseDecimal('70.'), 70);
  assert.equal(parseDecimal('-5'), null);
  assert.equal(parseDecimal('abc'), null);
  assert.equal(parseInteger('10'), 10);
  assert.equal(parseInteger(''), null);
  assert.equal(parseInteger('9.5'), null);
  assert.equal(parseInteger('-3'), null);
  assert.equal(sanitizeDecimal('-7a0..5,2'), '70.52');
  assert.equal(sanitizeDecimal('67,5'), '67.5');
});

test('exercise library is well formed', () => {
  assert.equal(LIBRARY_IDS.size, LIBRARY.length, 'ids are unique');
  assert.equal(LIBRARY.length, 58);
  assert.ok(LIBRARY.every((e) => /^[a-z0-9-]+$/.test(e.id) && e.name && e.muscleGroup));
});

test('the sample data file is a valid backup', { skip: !existsSync(new URL('../dev/sample-data.json', import.meta.url)) }, () => {
  const result = parseBackupText(readFileSync(new URL('../dev/sample-data.json', import.meta.url), 'utf8'), LIBRARY_IDS);
  assert.ok(result.ok, result.error);
  assert.ok(result.data.workouts.length >= 15);
  assert.ok(result.data.body.length >= 30);
  assert.equal(result.warnings.length, 0);
});
