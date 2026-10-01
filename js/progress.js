// Progress tab: "Am I getting stronger?" for one exercise at a time.
import { h, icon, layout, segmented, rerenderAll, fmtDay, fmtW, fmtSet, unit } from './ui.js';
import * as store from './store.js';
import { state } from './store.js';
import { exerciseSessions, exerciseStats, filterByRange, toDisplay, roundTo, RANGES } from './logic.js';
import { drawChart } from './chart.js';
import { openExercisePicker, openExerciseHistory, settingsButton } from './workout.js';

let metric = 'e1rm';
let range = '3M';

const METRICS = [
  { id: 'e1rm', label: 'Est. 1RM', name: 'Estimated 1RM', get: (s) => s.best1RM },
  { id: 'top', label: 'Top Weight', name: 'Top working weight', get: (s) => s.topWeight },
  { id: 'volume', label: 'Volume', name: 'Session volume', get: (s) => s.volume },
];

function defaultExerciseId() {
  const saved = state.settings.progressExerciseId;
  if (saved && exerciseSessions(state.workouts, saved).length) return saved;
  const latest = store.completedWorkouts().find((w) => w.exercises.length);
  return latest ? latest.exercises[0].exerciseId : saved || null;
}

export function renderProgressTab(root) {
  const exerciseId = defaultExerciseId();
  const ex = exerciseId ? store.getExercise(exerciseId) : null;
  const sessions = exerciseId ? exerciseSessions(state.workouts, exerciseId) : [];
  const stats = exerciseStats(sessions);
  const u = unit();
  const w1 = (lb) => `${fmtW(lb, 1)} ${u}`;
  const vol = (lbReps) => `${Math.round(toDisplay(lbReps, u)).toLocaleString('en-US')} ${u}`;

  const selector = h('button', {
    type: 'button', class: 'select-row', onclick: () => openExercisePicker({
      title: 'Select Exercise', allowCreate: false,
      onPick: (id) => { store.setSetting('progressExerciseId', id); rerenderAll(); },
    }),
  }, h('span', { class: 'select-label' }, 'Exercise'), h('span', { class: 'select-value' }, ex ? ex.name : 'Select Exercise'), icon('chevron', 'chev'));

  const chart = h('div', { class: 'chart' });
  const m = METRICS.find((x) => x.id === metric);
  const stat = (label, value, detail) => h('div', { class: 'stat' },
    h('dt', {}, label), h('dd', {}, value, detail && h('span', { class: 'stat-detail' }, detail)));

  layout(root, { right: settingsButton() }, [
    h('h1', { class: 'large-title' }, 'Progress'),
    selector,
    !stats && h('p', { class: 'empty' }, ex
      ? 'No completed sessions for this exercise yet. Finish a workout that includes it and your numbers will appear here.'
      : 'Finish a workout to see how your lifts are moving.'),
    stats && [
      segmented('Chart', METRICS, metric, (id) => { metric = id; rerenderAll(); }),
      chart,
      segmented('Time range', RANGES.map((r) => r.id), range, (id) => { range = id; rerenderAll(); }),
      h('dl', { class: 'stats' },
        stat('Last session', fmtSet(stats.last.topSet), fmtDay(stats.last.date)),
        stat('Heaviest weight', w1(stats.heaviest.weight), fmtDay(stats.heaviest.date)),
        stats.heaviest.weight > 0 && stat(`Most reps at ${w1(stats.heaviest.weight)}`, String(stats.heaviest.reps)),
        stat('Best estimated 1RM', stats.best1RM.value > 0 ? w1(stats.best1RM.value) : '–',
          stats.best1RM.value > 0 ? `${fmtSet(stats.best1RM)} · ${fmtDay(stats.best1RM.date)}` : null),
        stat('Last session volume', vol(stats.last.volume)),
        stat('Completed sessions', String(stats.sessionCount))),
      h('p', { class: 'footnote' }, 'Estimated 1RM uses the Epley formula. It is an estimate, not a tested max.'),
      h('button', { type: 'button', class: 'btn tinted', onclick: () => openExerciseHistory(exerciseId) }, 'Exercise History'),
    ],
  ]);

  if (stats) {
    const points = filterByRange(sessions, range, (s) => s.date)
      .map((s) => ({ t: s.date, v: roundTo(toDisplay(m.get(s), u), metric === 'volume' ? 0 : 1) }));
    drawChart(chart, {
      series: [{ points }],
      label: `${m.name} for ${ex.name}`,
      format: (v) => `${metric === 'volume' ? Math.round(v).toLocaleString('en-US') : roundTo(v, 1)} ${u}`,
      emptyText: `No sessions in this range. Try a longer one.`,
    });
  }
}
