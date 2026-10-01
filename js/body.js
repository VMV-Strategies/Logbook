// Body tab: daily weight and body-fat %, with trends.
import { h, layout, segmented, actionSheet, toast, rerenderAll, fmtDay, fmtW, fmtSigned, unit } from './ui.js';
import * as store from './store.js';
import { state } from './store.js';
import {
  localDateKey, parseDateKey, isValidDateKey, parseDecimal, sanitizeDecimal, toCanonical, toDisplay, roundTo,
  sortMeasurements, sevenDayAverage, thirtyDayChange, movingAverage, filterByRange, RANGES,
} from './logic.js';
import { drawChart } from './chart.js';
import { settingsButton } from './workout.js';

let formDate = null;      // null = today
let draft = null;         // { weight, bodyFat } typed but not yet saved
let chartMetric = 'weight';
let range = '3M';
let showAll = false;

const ts = (key) => parseDateKey(key).getTime();

export function renderBodyTab(root) {
  const today = localDateKey();
  const date = formDate || today;
  const existing = state.body.find((m) => m.date === date);
  const u = unit();
  const values = draft || {
    weight: existing ? fmtW(existing.weight, 1) : '',
    bodyFat: existing && existing.bodyFat != null ? String(roundTo(existing.bodyFat, 1)) : '',
  };
  const keep = () => { draft = { weight: weightIn.value, bodyFat: fatIn.value }; };
  const decimalInput = (label, value, placeholder) => {
    const input = h('input', {
      type: 'text', class: 'field-input', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'done', maxlength: '6',
      'aria-label': label, placeholder, value,
    });
    input.addEventListener('input', () => {
      const clean = sanitizeDecimal(input.value);
      if (clean !== input.value) input.value = clean;
      error.textContent = '';
      keep();
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
    return input;
  };
  const weightIn = decimalInput(`Weight in ${u}`, values.weight, '0.0');
  const fatIn = decimalInput('Body fat percent, optional', values.bodyFat, 'Optional');
  const error = h('p', { class: 'form-error', role: 'alert' });
  const dateIn = h('input', {
    type: 'date', class: 'date-input', 'aria-label': 'Date', max: today, value: date,
    onchange: (e) => {
      const v = e.target.value;
      formDate = isValidDateKey(v) && v <= today && v !== today ? v : null;
      draft = null;
      rerenderAll();
    },
  });

  const save = async () => {
    const w = parseDecimal(weightIn.value);
    const fatText = fatIn.value.trim();
    const fat = fatText === '' ? null : parseDecimal(fatText);
    if (w == null || w <= 0) { error.textContent = 'Enter your weight.'; weightIn.focus(); return; }
    if (toCanonical(w, u) > 1500) { error.textContent = 'That weight looks too high. Check the number.'; weightIn.focus(); return; }
    if (fatText !== '' && (fat == null || fat > 100)) { error.textContent = 'Body fat must be between 0 and 100.'; fatIn.focus(); return; }
    const ok = await store.saveMeasurement({ date, weight: toCanonical(w, u), bodyFat: fat });
    if (!ok) return;
    draft = null; formDate = null;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    rerenderAll();
    toast(existing ? 'Entry updated' : 'Entry saved');
  };

  const newest = sortMeasurements(state.body);
  const current = newest[0];
  const currentFat = newest.find((m) => m.bodyFat != null);
  const avg = sevenDayAverage(state.body, today);
  const wChange = thirtyDayChange(state.body, 'weight', today);
  const fChange = thirtyDayChange(state.body, 'bodyFat', today);
  const stat = (label, value, detail) => h('div', { class: 'stat' },
    h('dt', {}, label), h('dd', {}, value, detail && h('span', { class: 'stat-detail' }, detail)));
  const chart = h('div', { class: 'chart' });
  const shown = showAll ? newest : newest.slice(0, 14);

  layout(root, { right: settingsButton() }, [
    h('h1', { class: 'large-title' }, 'Body'),
    h('div', { class: 'form' },
      h('label', { class: 'field-row' }, h('span', {}, date === today ? 'Today' : 'Date'), dateIn),
      h('label', { class: 'field-row' }, h('span', {}, 'Weight'), weightIn, h('span', { class: 'field-unit' }, u)),
      h('label', { class: 'field-row' }, h('span', {}, 'Body Fat'), fatIn, h('span', { class: 'field-unit' }, '%'))),
    error,
    h('button', { type: 'button', class: 'btn primary', onclick: save }, existing ? 'Update' : 'Save'),
    existing && date !== today && h('button', {
      type: 'button', class: 'btn plain', onclick: () => { formDate = null; draft = null; rerenderAll(); },
    }, 'Back to Today'),

    current && [
      h('dl', { class: 'stats' },
        stat('Current weight', `${fmtW(current.weight, 1)} ${u}`, fmtDay(ts(current.date))),
        stat('7-day average', avg == null ? '–' : `${fmtW(avg, 1)} ${u}`),
        stat('30-day change', wChange ? `${fmtSigned(toDisplay(wChange.change, u))} ${u}` : '–'),
        stat('Current body fat', currentFat ? `${roundTo(currentFat.bodyFat, 1)}%` : '–', currentFat ? fmtDay(ts(currentFat.date)) : null),
        stat('30-day body-fat change', fChange ? `${fmtSigned(fChange.change)}%` : '–')),
      segmented('Chart', [{ id: 'weight', label: 'Weight' }, { id: 'bodyFat', label: 'Body Fat' }], chartMetric,
        (id) => { chartMetric = id; rerenderAll(); }),
      chart,
      segmented('Time range', RANGES.map((r) => r.id), range, (id) => { range = id; rerenderAll(); }),
      chartMetric === 'weight' && h('p', { class: 'footnote' }, 'The line is your 7-day average. Dots are daily weigh-ins.'),
      h('h2', { class: 'section-title' }, 'History'),
      h('div', { class: 'list' }, shown.map((m) => h('button', {
        type: 'button', class: 'row body-row',
        'aria-label': `${fmtDay(ts(m.date))}, ${fmtW(m.weight, 1)} ${u}${m.bodyFat != null ? `, ${roundTo(m.bodyFat, 1)} percent body fat` : ''}. Edit or delete`,
        onclick: () => actionSheet({
          title: fmtDay(ts(m.date)),
          actions: [
            { label: 'Edit Entry', onSelect: () => {
              formDate = m.date === today ? null : m.date; draft = null; rerenderAll();
              const sc = document.querySelector('#tab .scroll'); if (sc) sc.scrollTop = 0;
            } },
            { label: 'Delete Entry', destructive: true, onSelect: async () => {
              await store.deleteMeasurement(m.date);
              if (formDate === m.date) formDate = null;
              draft = null; rerenderAll(); toast('Entry deleted');
            } },
          ],
        }),
      }, h('span', { class: 'b-date' }, fmtDay(ts(m.date))),
      h('span', { class: 'b-weight' }, `${fmtW(m.weight, 1)} ${u}`),
      h('span', { class: 'b-fat' }, m.bodyFat != null ? `${roundTo(m.bodyFat, 1)}%` : '–')))),
      newest.length > shown.length && h('button', { type: 'button', class: 'btn plain', onclick: () => { showAll = true; rerenderAll(); } },
        `Show All ${newest.length} Entries`),
    ],
    !current && h('p', { class: 'empty' }, 'No measurements yet. Save today’s weight to start your trend.'),
  ]);

  if (current) {
    const now = new Date();
    if (chartMetric === 'weight') {
      const daily = filterByRange(sortMeasurements(state.body, false), range, (m) => ts(m.date), now)
        .map((m) => ({ t: ts(m.date), v: roundTo(toDisplay(m.weight, u), 1) }));
      const trend = filterByRange(movingAverage(state.body), range, (p) => ts(p.date), now)
        .map((p) => ({ t: ts(p.date), v: roundTo(toDisplay(p.value, u), 1) }));
      drawChart(chart, {
        series: [{ points: trend, dots: false }, { points: daily, muted: true }],
        label: 'Body weight, 7-day average', format: (v) => `${roundTo(v, 1)} ${u} avg`,
        emptyText: 'No weigh-ins in this range. Try a longer one.',
      });
    } else {
      const points = filterByRange(sortMeasurements(state.body, false).filter((m) => m.bodyFat != null), range, (m) => ts(m.date), now)
        .map((m) => ({ t: ts(m.date), v: roundTo(m.bodyFat, 1) }));
      drawChart(chart, {
        series: [{ points }], label: 'Body fat percentage', format: (v) => `${roundTo(v, 1)}%`,
        emptyText: 'No body-fat entries in this range.',
      });
    }
  }
}
