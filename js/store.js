// App state. Everything is kept in memory for instant screens, and every change
// is written to IndexedDB straight away (no Save button, nothing waits for "Finish").
import { db } from './db.js';
import { LIBRARY } from './exercises.js';
import { uid } from './logic.js';

const DEFAULT_SETTINGS = { weightUnit: 'lb', theme: 'system', progressExerciseId: null, lastExportAt: null };

export const state = {
  workouts: [],
  body: [],
  customExercises: [],
  settings: { ...DEFAULT_SETTINGS },
  storageOk: true,
};

let errorHandler = () => {};
export function onStorageError(fn) { errorHandler = fn; }
function guard(promise) {
  return promise.then(() => true, (err) => { console.error(err); errorHandler(err); return false; });
}

export async function load() {
  try {
    const all = await db.loadAll();
    state.workouts = all.workouts || [];
    state.body = all.body || [];
    state.customExercises = all.exercises || [];
    state.settings = { ...DEFAULT_SETTINGS };
    for (const row of all.settings || []) if (row.key in DEFAULT_SETTINGS) state.settings[row.key] = row.value;
  } catch (err) {
    console.error(err);
    state.storageOk = false;
  }
}

/* ---------- exercises ---------- */
export function allExercises() { return [...LIBRARY, ...state.customExercises]; }
export function getExercise(id) {
  return LIBRARY.find((e) => e.id === id) || state.customExercises.find((e) => e.id === id) ||
    { id, name: 'Unknown exercise', muscleGroup: 'Other', isCustom: true };
}
export function addCustomExercise(name, muscleGroup) {
  const ex = { id: 'custom-' + uid(), name, muscleGroup, isCustom: true, createdAt: Date.now() };
  state.customExercises.push(ex);
  guard(db.put('exercises', ex));
  return ex;
}
export function renameCustomExercise(id, name) {
  const ex = state.customExercises.find((e) => e.id === id);
  if (!ex) return;
  ex.name = name;
  return guard(db.put('exercises', ex));
}

/* ---------- workouts ---------- */
export function activeWorkout() {
  return state.workouts.filter((w) => !w.isCompleted).sort((a, b) => b.startedAt - a.startedAt)[0] || null;
}
export function completedWorkouts() {
  return state.workouts.filter((w) => w.isCompleted).sort((a, b) => b.startedAt - a.startedAt);
}
export function addWorkout(w) {
  state.workouts.push(w);
  return guard(db.put('workouts', w));
}
export function saveWorkout(w) {
  if (!state.workouts.includes(w)) return Promise.resolve(false); // deleted meanwhile: never resurrect it
  return guard(db.put('workouts', w));
}
export function deleteWorkout(id) {
  state.workouts = state.workouts.filter((w) => w.id !== id);
  return guard(db.delete('workouts', id));
}

/* ---------- body ---------- */
/** One record per calendar date: saving an existing date updates it instead of adding a duplicate. */
export function saveMeasurement({ date, weight, bodyFat }) {
  const now = Date.now();
  const i = state.body.findIndex((m) => m.date === date);
  const rec = i >= 0
    ? { ...state.body[i], weight, bodyFat, updatedAt: now }
    : { id: uid(), date, weight, bodyFat, createdAt: now, updatedAt: now };
  if (i >= 0) state.body[i] = rec; else state.body.push(rec);
  return guard(db.put('body', rec));
}
export function deleteMeasurement(date) {
  state.body = state.body.filter((m) => m.date !== date);
  return guard(db.delete('body', date));
}

/* ---------- settings ---------- */
export function setSetting(key, value) {
  state.settings[key] = value;
  return guard(db.put('settings', { key, value }));
}

/* ---------- restore ---------- */
/** Database first; memory only changes if the database write succeeded. */
export async function replaceAll(data) {
  const settings = { ...DEFAULT_SETTINGS, ...data.settings };
  await db.replaceAll({ ...data, settings });
  state.workouts = data.workouts;
  state.body = data.body;
  state.customExercises = data.customExercises;
  state.settings = settings;
}
