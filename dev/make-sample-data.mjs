// Builds dev/sample-data.json: about six weeks of realistic workouts and body
// measurements, ending yesterday. FOR TESTING ONLY.
//
// The app never loads this by itself. To look at the app with data in it, use
// Settings -> Import Data and pick dev/sample-data.json (this REPLACES the data
// on that device, so do it in a desktop browser, not on your real phone log).
import { writeFileSync } from 'node:fs';
import { buildBackup, localDateKey } from '../js/logic.js';

let seed = 20261001;
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const id = (p, n) => `sample-${p}-${n}`;

// [exerciseId, starting weight (lb), weekly increase, sets, top reps, note]
const DAYS = {
  push: [['incline-dumbbell-press', 60, 2.5, 3, 11, 'Bench notch 4'], ['cable-fly', 30, 1.25, 3, 13, ''],
    ['dumbbell-lateral-raise', 17.5, 0.5, 4, 14, 'Slow eccentric'], ['triceps-pushdown', 50, 2.5, 3, 12, '']],
  pull: [['lat-pulldown', 130, 2.5, 3, 11, ''], ['chest-supported-row', 90, 5, 3, 10, 'Seat 3'], ['preacher-curl', 60, 1.25, 3, 11, '']],
  legs: [['hack-squat', 180, 10, 3, 9, ''], ['leg-extension', 120, 5, 3, 13, ''], ['romanian-deadlift', 185, 5, 3, 9, ''],
    ['seated-leg-curl', 100, 2.5, 3, 12, ''], ['standing-calf-raise', 150, 5, 4, 13, '']],
};
const WEEK = { 1: 'push', 2: 'pull', 4: 'legs', 5: 'push', 6: 'pull' }; // Mon, Tue, Thu, Fri, Sat

const today = new Date();
const workouts = [];
let n = 0;
for (let back = 42; back >= 1; back--) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back, 17, 30 + Math.floor(rand() * 40));
  const kind = WEEK[d.getDay()];
  if (!kind || rand() < 0.08) continue; // the occasional missed day
  const week = Math.floor((42 - back) / 7);
  n += 1;
  const exercises = DAYS[kind].map(([exerciseId, start, inc, setCount, topReps, note], ei) => {
    const weight = Math.round((start + inc * week) / 2.5) * 2.5;
    return {
      id: id(`we${n}`, ei), exerciseId, notes: note,
      sets: Array.from({ length: setCount }, (_, si) => ({
        id: id(`s${n}-${ei}`, si),
        weight: si === setCount - 1 && setCount > 2 ? weight - (weight >= 100 ? 10 : 5) : weight,
        reps: Math.max(5, topReps - si - Math.floor(rand() * 2) + (si === setCount - 1 ? 2 : 0)),
        isCompleted: true,
      })),
    };
  });
  const startedAt = d.getTime();
  workouts.push({ id: id('w', n), startedAt, completedAt: startedAt + (48 + Math.floor(rand() * 25)) * 60000, isCompleted: true, notes: '', exercises });
}

const body = [];
for (let back = 45; back >= 1; back--) {
  if (rand() < 0.15) continue; // not weighed every day
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back);
  const t = (45 - back) / 45;
  const stamp = d.getTime() + 7 * 3600000;
  body.push({
    id: id('b', back), date: localDateKey(d),
    weight: Math.round((187.2 - 2.6 * t + (rand() - 0.5) * 1.1) * 10) / 10,
    bodyFat: rand() < 0.3 ? null : Math.round((14.7 - 0.9 * t + (rand() - 0.5) * 0.3) * 10) / 10,
    createdAt: stamp, updatedAt: stamp,
  });
}

const backup = buildBackup({ workouts, body, customExercises: [], settings: { weightUnit: 'lb', theme: 'system' } });
writeFileSync(new URL('./sample-data.json', import.meta.url), JSON.stringify(backup, null, 2));
console.log(`Wrote dev/sample-data.json: ${workouts.length} workouts, ${body.length} body entries.`);
