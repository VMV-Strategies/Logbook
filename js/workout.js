// Workout tab: start, log, finish, history, exercise history, exercise picker.
import {
  h, icon, layout, pushPage, backButton, openSheet, sheetHeader, actionSheet, toast, rerenderAll,
  fmtDay, fmtWeekday, fmtTime, fmtDuration, fmtW, fmtSet, unit,
} from './ui.js';
import * as store from './store.js';
import { state } from './store.js';
import {
  findLastPerformance, exerciseSessions, isCountedSet, parseDecimal, parseInteger, sanitizeDecimal,
  toCanonical, uid, MUSCLE_GROUPS, localDateKey, parseDateKey, isValidDateKey,
} from './logic.js';
import { openSettings } from './settings.js';

let showAllWorkouts = false;
let timer = null;

const hasReps = (s) => Number.isInteger(s.reps) && s.reps > 0;
const exerciseNames = (w) => w.exercises.map((e) => store.getExercise(e.exerciseId).name);
export function settingsButton() {
  return h('button', { type: 'button', class: 'nav-btn icon-only', 'aria-label': 'Settings', onclick: openSettings }, icon('gear'));
}

export function renderWorkoutTab(root) {
  clearInterval(timer);
  const active = store.activeWorkout();
  if (active) renderActive(root, active); else renderHome(root);
}

/* ---------- home: Start Workout + recent workouts ---------- */
function renderHome(root) {
  const done = store.completedWorkouts();
  const shown = showAllWorkouts ? done : done.slice(0, 15);
  layout(root, { right: settingsButton() }, [
    h('h1', { class: 'large-title' }, 'Workout'),
    h('button', { type: 'button', class: 'btn primary', onclick: startWorkout }, 'Start Workout'),
    h('h2', { class: 'section-title' }, 'Recent workouts'),
    done.length
      ? h('div', { class: 'list' }, shown.map((w) => h('button', {
        type: 'button', class: 'row', onclick: () => openWorkoutDetail(w.id),
      },
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, fmtWeekday(w.startedAt)),
        h('span', { class: 'row-sub' }, exerciseNames(w).join(', ') || 'No exercises')),
      icon('chevron', 'chev'))))
      : h('p', { class: 'empty' }, 'No workouts yet. Your finished workouts will be listed here.'),
    done.length > shown.length && h('button', {
      type: 'button', class: 'btn plain', onclick: () => { showAllWorkouts = true; rerenderAll(); },
    }, `Show All ${done.length} Workouts`),
  ]);
}

function startWorkout() {
  if (store.activeWorkout()) return;
  store.addWorkout({ id: uid(), startedAt: Date.now(), completedAt: null, isCompleted: false, notes: '', exercises: [] });
  rerenderAll();
}

/* ---------- active workout ---------- */
function renderActive(root, w) {
  const elapsed = h('p', { class: 'subtitle' });
  const tick = () => { elapsed.textContent = `Started ${fmtTime(w.startedAt)} · ${fmtDuration(Date.now() - w.startedAt)}`; };
  tick();
  timer = setInterval(() => { if (document.contains(elapsed)) tick(); else clearInterval(timer); }, 20000);

  const ctx = { mode: 'active', refresh: rerenderAll, root };
  layout(root, {
    left: settingsButton(),
    right: h('button', { type: 'button', class: 'nav-btn strong', onclick: () => finishWorkout(w) }, 'Finish'),
  }, [
    h('h1', { class: 'large-title' }, fmtWeekday(w.startedAt)),
    elapsed,
    editorBody(w, ctx),
    h('button', { type: 'button', class: 'btn primary', onclick: () => finishWorkout(w) }, 'Finish Workout'),
    h('button', { type: 'button', class: 'btn plain destructive', onclick: () => discardWorkout(w) }, 'Discard Workout'),
  ]);
}

/** The exercise list + Add Exercise + workout note. Shared by the active workout and by Edit. */
function editorBody(w, ctx) {
  const note = h('input', {
    type: 'text', class: 'note', maxlength: '200', enterkeyhint: 'done', autocomplete: 'off',
    placeholder: 'Workout note', 'aria-label': 'Workout note', value: w.notes || '',
    oninput: (e) => { w.notes = e.target.value; store.saveWorkout(w); },
  });
  return h('div', { class: 'editor' },
    w.exercises.length
      ? w.exercises.map((we) => exerciseSection(w, we, ctx))
      : h('p', { class: 'empty' }, 'Add your first exercise to begin.'),
    h('button', {
      type: 'button', class: 'btn tinted', onclick: () => openExercisePicker({
        title: 'Add Exercise',
        excludeIds: w.exercises.map((e) => e.exerciseId),
        onPick: (exerciseId) => {
          const we = { id: uid(), exerciseId, notes: '', sets: [{ id: uid(), weight: null, reps: null, isCompleted: false }] };
          w.exercises.push(we);
          store.saveWorkout(w);
          ctx.refresh();
          const node = ctx.root.querySelector(`[data-we="${we.id}"]`);
          if (node) node.scrollIntoView({ block: 'start', behavior: 'smooth' });
        },
      }),
    }, icon('plus'), 'Add Exercise'),
    w.exercises.length > 0 && note);
}

function exerciseSection(w, we, ctx) {
  const ex = store.getExercise(we.exerciseId);
  const last = findLastPerformance(state.workouts, we.exerciseId,
    ctx.mode === 'edit' ? { before: w.startedAt, excludeId: w.id } : { excludeId: w.id });
  const section = h('section', { class: 'ex', 'data-we': we.id, 'aria-label': ex.name });
  const redraw = () => section.replaceWith(exerciseSection(w, we, ctx));
  const save = () => store.saveWorkout(w);

  const useLast = () => {
    const apply = () => {
      we.sets = last.sets.map((s) => ({ id: uid(), weight: s.weight, reps: s.reps, isCompleted: ctx.mode === 'edit' }));
      save(); redraw();
    };
    if (we.sets.some((s) => s.weight != null || s.reps != null)) {
      actionSheet({
        title: 'Replace the sets you entered?',
        message: `Today's sets for ${ex.name} will be replaced with last time's.`,
        actions: [{ label: 'Replace Sets', destructive: true, onSelect: apply }],
      });
    } else apply();
  };

  const menu = () => actionSheet({
    title: ex.name,
    actions: [
      { label: 'Exercise History', onSelect: () => openExerciseHistory(ex.id) },
      { label: 'Remove Exercise', destructive: true, onSelect: () => {
        w.exercises = w.exercises.filter((e) => e !== we);
        save(); ctx.refresh();
      } },
    ],
  });

  section.append(
    h('div', { class: 'ex-head' },
      h('h2', { class: 'ex-name' }, ex.name),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Options for ${ex.name}`, onclick: menu }, icon('more'))),
    last
      ? h('div', { class: 'last' },
        h('div', { class: 'last-head' },
          h('span', { class: 'last-title' }, `Last Time · ${fmtDay(last.startedAt)}`),
          h('button', { type: 'button', class: 'pill', onclick: useLast }, 'Use Last Time')),
        h('ul', { class: 'last-sets' }, last.sets.map((s) => h('li', {}, fmtSet(s)))),
        last.notes && h('p', { class: 'last-note' }, last.notes))
      : h('div', { class: 'last' }, h('span', { class: 'last-title' }, 'No previous history')),
    h('div', { class: 'sets' },
      h('div', { class: 'sets-head', 'aria-hidden': 'true' },
        h('span', {}, 'Set'), h('span', {}, `Weight (${unit()})`), h('span', {}, 'Reps'), h('span', {}, 'Done')),
      we.sets.map((set, i) => setRow(w, we, set, i, last, ctx, redraw))),
    h('button', {
      type: 'button', class: 'add-set', onclick: () => {
        const prev = we.sets[we.sets.length - 1];
        we.sets.push({
          id: uid(), weight: prev ? prev.weight : null, reps: prev ? prev.reps : null,
          isCompleted: ctx.mode === 'edit' && !!prev && hasReps(prev),
        });
        save(); redraw();
      },
    }, icon('plus'), 'Add Set'),
    h('input', {
      type: 'text', class: 'note', maxlength: '200', enterkeyhint: 'done', autocomplete: 'off',
      placeholder: 'Add note (seat, notch, tempo)', 'aria-label': `Note for ${ex.name}`, value: we.notes || '',
      oninput: (e) => { we.notes = e.target.value; save(); },
    }));
  return section;
}

function setRow(w, we, set, i, last, ctx, redraw) {
  const u = unit();
  const hint = last ? last.sets[i] : null; // last time's matching set, shown as a grey suggestion
  const save = () => store.saveWorkout(w);
  const row = h('div', { class: 'set-row' + (set.isCompleted ? ' done' : '') });

  const weight = h('input', {
    type: 'text', class: 'num', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'done', maxlength: '7',
    'aria-label': `Set ${i + 1} weight in ${u}`, placeholder: hint ? (fmtW(hint.weight) || '0') : '–',
    value: set.weight == null ? '' : fmtW(set.weight),
  });
  const reps = h('input', {
    type: 'text', class: 'num', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off', enterkeyhint: 'done', maxlength: '3',
    'aria-label': `Set ${i + 1} reps`, placeholder: hint ? String(hint.reps) : '–',
    value: set.reps == null ? '' : String(set.reps),
  });
  const check = h('button', { type: 'button', class: 'check', 'aria-pressed': String(!!set.isCompleted), 'aria-label': `Set ${i + 1} done` },
    h('span', { class: 'ring' }, icon('check')));
  const sync = () => {
    row.classList.toggle('done', !!set.isCompleted);
    check.setAttribute('aria-pressed', String(!!set.isCompleted));
  };

  weight.addEventListener('input', () => {
    const clean = sanitizeDecimal(weight.value);
    if (clean !== weight.value) weight.value = clean;
    const v = parseDecimal(clean);
    set.weight = v == null ? null : toCanonical(v, u);
    save();
  });
  reps.addEventListener('input', () => {
    const clean = reps.value.replace(/\D/g, '');
    if (clean !== reps.value) reps.value = clean;
    set.reps = parseInteger(clean);
    if (!hasReps(set) && set.isCompleted) { set.isCompleted = false; sync(); }
    save();
  });
  for (const input of [weight, reps]) {
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  }
  check.addEventListener('click', () => {
    if (set.isCompleted) { set.isCompleted = false; sync(); save(); return; }
    // Blank row with a grey suggestion from last time: one tap accepts it.
    if (!hasReps(set) && hint && reps.value === '') { set.reps = hint.reps; reps.value = String(hint.reps); }
    if (set.weight == null && hint && weight.value === '' && hasReps(set)) { set.weight = hint.weight; weight.value = fmtW(hint.weight); }
    if (!hasReps(set)) { reps.focus(); return; }
    set.isCompleted = true; sync(); save();
  });

  const remove = () => { we.sets = we.sets.filter((s) => s !== set); save(); redraw(); };
  const number = h('button', {
    type: 'button', class: 'set-num', 'aria-label': `Set ${i + 1}. Tap to delete`,
    onclick: () => {
      if (set.weight == null && set.reps == null) { remove(); return; }
      actionSheet({ title: `Set ${i + 1}`, actions: [{ label: 'Delete Set', destructive: true, onSelect: remove }] });
    },
  }, String(i + 1));

  row.append(number, weight, reps, check);
  return row;
}

function finishWorkout(w) {
  const sets = w.exercises.flatMap((e) => e.sets);
  const filled = sets.filter(hasReps);
  const unchecked = filled.filter((s) => !s.isCompleted);
  if (!filled.length) {
    actionSheet({
      title: 'Nothing logged yet',
      message: 'Enter reps for at least one set before finishing, or discard this workout.',
      actions: [{ label: 'Discard Workout', destructive: true, onSelect: () => { store.deleteWorkout(w.id); rerenderAll(); } }],
    });
    return;
  }
  const complete = async (checkAll) => {
    for (const we of w.exercises) {
      we.sets = we.sets.filter(hasReps); // blank rows are dropped; entered sets are always kept
      if (checkAll) we.sets.forEach((s) => { s.isCompleted = true; });
    }
    w.exercises = w.exercises.filter((we) => we.sets.length);
    w.isCompleted = true;
    w.completedAt = Date.now();
    const ok = await store.saveWorkout(w);
    rerenderAll();
    const scroll = document.querySelector('#tab .scroll');
    if (scroll) scroll.scrollTop = 0;
    if (ok) toast('Workout saved');
  };
  if (unchecked.length) {
    const n = unchecked.length;
    actionSheet({
      title: `${n} ${n === 1 ? 'set is' : 'sets are'} not checked off`,
      message: 'Only checked sets count toward Last Time and your stats.',
      actions: [
        { label: 'Check All and Finish', onSelect: () => complete(true) },
        { label: 'Finish Without Them', onSelect: () => complete(false) },
      ],
    });
  } else {
    actionSheet({ title: 'Finish this workout?', actions: [{ label: 'Finish Workout', onSelect: () => complete(false) }] });
  }
}

function discardWorkout(w) {
  actionSheet({
    title: 'Discard this workout?',
    message: 'Everything entered in this workout will be deleted.',
    actions: [{ label: 'Discard Workout', destructive: true, onSelect: () => { store.deleteWorkout(w.id); rerenderAll(); } }],
  });
}

/* ---------- workout detail ---------- */
export function openWorkoutDetail(id) {
  pushPage((el, page) => {
    const w = state.workouts.find((x) => x.id === id);
    if (!w) { el.replaceChildren(); return; }
    const counted = w.exercises.flatMap((e) => e.sets).filter(isCountedSet).length;
    const meta = [fmtTime(w.startedAt)];
    if (w.completedAt && w.completedAt > w.startedAt) meta.push(fmtDuration(w.completedAt - w.startedAt));
    meta.push(`${counted} ${counted === 1 ? 'set' : 'sets'}`);
    layout(el, {
      left: backButton(page, 'Workouts'),
      right: h('button', { type: 'button', class: 'nav-btn', onclick: () => openWorkoutEdit(id) }, 'Edit'),
    }, [
      h('h1', { class: 'large-title' }, fmtWeekday(w.startedAt)),
      h('p', { class: 'subtitle' }, meta.join(' · ')),
      w.notes && h('p', { class: 'body-note' }, w.notes),
      w.exercises.length ? w.exercises.map((we) => {
        const ex = store.getExercise(we.exerciseId);
        return h('section', { class: 'ex read' },
          h('button', { type: 'button', class: 'ex-link', onclick: () => openExerciseHistory(ex.id) },
            h('span', {}, ex.name), icon('chevron', 'chev')),
          h('ol', { class: 'set-lines' }, we.sets.map((s, i) => h('li', { class: isCountedSet(s) ? '' : 'skipped' },
            h('span', { class: 'idx' }, String(i + 1)),
            h('span', {}, hasReps(s) ? fmtSet({ weight: s.weight || 0, reps: s.reps }) : '–'),
            !isCountedSet(s) && h('span', { class: 'tag' }, 'not completed')))),
          we.notes && h('p', { class: 'last-note' }, we.notes));
      }) : h('p', { class: 'empty' }, 'This workout has no exercises.'),
      h('button', {
        type: 'button', class: 'btn plain destructive', onclick: () => actionSheet({
          title: 'Delete this workout?',
          message: 'It will be removed from your history and stats. This cannot be undone.',
          actions: [{ label: 'Delete Workout', destructive: true, onSelect: async () => {
            await store.deleteWorkout(id);
            page.close();
            toast('Workout deleted');
          } }],
        }),
      }, 'Delete Workout'),
    ]);
  });
}

/* ---------- edit a finished workout ---------- */
function openWorkoutEdit(id) {
  pushPage((el, page) => {
    const w = state.workouts.find((x) => x.id === id);
    if (!w) { el.replaceChildren(); return; }
    const done = () => {
      for (const we of w.exercises) we.sets = we.sets.filter(hasReps);
      w.exercises = w.exercises.filter((we) => we.sets.length);
      store.saveWorkout(w);
      page.close();
    };
    const date = h('input', {
      type: 'date', class: 'date-input', 'aria-label': 'Workout date',
      max: localDateKey(), value: localDateKey(new Date(w.startedAt)),
      onchange: (e) => {
        if (!isValidDateKey(e.target.value) || e.target.value > localDateKey()) { e.target.value = localDateKey(new Date(w.startedAt)); return; }
        const old = new Date(w.startedAt);
        const day = parseDateKey(e.target.value);
        const moved = new Date(day.getFullYear(), day.getMonth(), day.getDate(), old.getHours(), old.getMinutes(), old.getSeconds()).getTime();
        if (w.completedAt) w.completedAt += moved - w.startedAt;
        w.startedAt = moved;
        store.saveWorkout(w);
        page.render();
      },
    });
    const ctx = { mode: 'edit', refresh: () => page.render(), root: el };
    layout(el, {
      title: 'Edit Workout',
      right: h('button', { type: 'button', class: 'nav-btn strong', onclick: done }, 'Done'),
    }, [
      h('label', { class: 'field-row' }, h('span', {}, 'Date'), date),
      editorBody(w, ctx),
    ]);
  });
}

/* ---------- exercise history ---------- */
export function openExerciseHistory(exerciseId) {
  pushPage((el, page) => {
    const ex = store.getExercise(exerciseId);
    const sessions = exerciseSessions(state.workouts, exerciseId).reverse();
    const rename = () => {
      const sheet = openSheet((panel) => {
        const input = h('input', { type: 'text', class: 'text-input', maxlength: '60', value: ex.name, 'aria-label': 'Exercise name', autocapitalize: 'words' });
        const saveName = () => {
          const name = input.value.trim();
          if (!name) return;
          store.renameCustomExercise(ex.id, name);
          sheet.close(); rerenderAll();
        };
        panel.append(
          sheetHeader('Rename Exercise',
            h('button', { type: 'button', class: 'nav-btn', onclick: () => sheet.close() }, 'Cancel'),
            h('button', { type: 'button', class: 'nav-btn strong', onclick: saveName }, 'Save')),
          h('div', { class: 'sheet-body' }, input));
      }, { label: 'Rename exercise' });
    };
    layout(el, {
      left: backButton(page),
      right: ex.isCustom && state.customExercises.includes(ex)
        ? h('button', { type: 'button', class: 'nav-btn', onclick: rename }, 'Rename') : null,
    }, [
      h('h1', { class: 'large-title small' }, ex.name),
      h('p', { class: 'subtitle' }, sessions.length
        ? `${ex.muscleGroup} · ${sessions.length} ${sessions.length === 1 ? 'session' : 'sessions'}` : ex.muscleGroup),
      sessions.length ? sessions.map((s) => h('section', { class: 'hist' },
        h('h2', { class: 'hist-date' }, fmtDay(s.date)),
        h('ul', { class: 'hist-sets' }, s.sets.map((set) => h('li', {}, fmtSet(set)))),
        s.notes && h('p', { class: 'last-note' }, s.notes)))
        : h('p', { class: 'empty' }, 'No previous history'),
    ]);
  });
}

/* ---------- exercise picker ---------- */
function recentExerciseIds(limit = 6) {
  const ids = [];
  const sorted = state.workouts.slice().sort((a, b) => b.startedAt - a.startedAt);
  for (const w of sorted) for (const e of w.exercises) {
    if (!ids.includes(e.exerciseId)) ids.push(e.exerciseId);
    if (ids.length >= limit) return ids;
  }
  return ids;
}

export function openExercisePicker({ title, onPick, excludeIds = [], allowCreate = true }) {
  let query = '';
  let group = 'All';
  let creating = false;

  const sheet = openSheet((panel) => {
    if (creating) { renderCreate(panel); return; }
    const list = h('div', { class: 'sheet-scroll' });
    const row = (ex, detail) => {
      const added = excludeIds.includes(ex.id);
      return h('button', {
        type: 'button', class: 'row', disabled: added,
        onclick: () => { sheet.close(); onPick(ex.id); },
      }, h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, ex.name)),
      (added || detail) && h('span', { class: 'row-detail' }, added ? 'Added' : detail));
    };
    const draw = () => {
      const q = query.trim().toLowerCase();
      const items = store.allExercises().filter((e) => (group === 'All' || e.muscleGroup === group) && (!q || e.name.toLowerCase().includes(q)));
      const out = [];
      if (!q && group === 'All') {
        const recent = recentExerciseIds().map((id) => store.getExercise(id));
        if (recent.length) out.push(h('h3', { class: 'section-title' }, 'Recently used'), h('div', { class: 'list' }, recent.map((e) => row(e))));
        out.push(h('h3', { class: 'section-title' }, 'All exercises'));
      }
      if (q) {
        if (items.length) out.push(h('div', { class: 'list' }, items.map((e) => row(e, e.muscleGroup))));
      } else {
        for (const g of MUSCLE_GROUPS) {
          const inGroup = items.filter((e) => e.muscleGroup === g);
          if (!inGroup.length) continue;
          out.push(h('h4', { class: 'group-title' }, g), h('div', { class: 'list' }, inGroup.map((e) => row(e))));
        }
      }
      if (!items.length) out.push(h('p', { class: 'empty' }, q ? `No exercise matches “${query.trim()}”.` : 'No exercises in this group yet.'));
      if (allowCreate) {
        out.push(h('button', { type: 'button', class: 'row create', onclick: () => { creating = true; sheet.render(); } },
          icon('plus'), h('span', {}, q && !items.length ? `Create “${query.trim()}”` : 'Create Custom Exercise')));
      }
      list.replaceChildren(...out);
    };
    const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Muscle group' });
    for (const g of ['All', ...MUSCLE_GROUPS]) {
      chips.append(h('button', {
        type: 'button', class: 'chip' + (g === group ? ' on' : ''), 'aria-pressed': String(g === group),
        onclick: (e) => {
          group = g;
          for (const c of chips.children) { c.classList.toggle('on', c === e.currentTarget); c.setAttribute('aria-pressed', String(c === e.currentTarget)); }
          draw(); list.scrollTop = 0;
        },
      }, g));
    }
    panel.append(
      sheetHeader(title, h('button', { type: 'button', class: 'nav-btn', onclick: () => sheet.close() }, 'Cancel')),
      h('div', { class: 'search-wrap' }, icon('search'),
        h('input', {
          type: 'search', class: 'search', placeholder: 'Search', 'aria-label': 'Search exercises', value: query,
          autocomplete: 'off', autocorrect: 'off', autocapitalize: 'none', spellcheck: 'false', enterkeyhint: 'search',
          oninput: (e) => { query = e.target.value; draw(); list.scrollTop = 0; },
          onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
        })),
      chips, list);
    draw();
  }, { tall: true, label: title });

  function renderCreate(panel) {
    let name = query.trim();
    let muscle = group === 'All' ? null : group;
    const add = h('button', { type: 'button', class: 'btn primary' }, 'Add Exercise');
    const input = h('input', {
      type: 'text', class: 'text-input', maxlength: '60', placeholder: 'Exercise name', 'aria-label': 'Exercise name',
      autocapitalize: 'words', autocomplete: 'off', enterkeyhint: 'done', value: name,
      oninput: (e) => { name = e.target.value.trim(); update(); },
      onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
    });
    const groups = h('div', { class: 'chips wrap', role: 'group', 'aria-label': 'Muscle group' });
    const update = () => {
      add.disabled = !(name && muscle);
      for (const c of groups.children) { const on = c.textContent === muscle; c.classList.toggle('on', on); c.setAttribute('aria-pressed', String(on)); }
    };
    for (const g of MUSCLE_GROUPS) groups.append(h('button', { type: 'button', class: 'chip', onclick: () => { muscle = g; update(); } }, g));
    add.addEventListener('click', () => {
      if (!(name && muscle)) return;
      const existing = store.allExercises().find((e) => e.name.toLowerCase() === name.toLowerCase());
      const ex = existing || store.addCustomExercise(name, muscle);
      sheet.close();
      onPick(ex.id);
    });
    panel.append(
      sheetHeader('New Exercise', h('button', { type: 'button', class: 'nav-btn back', onclick: () => { creating = false; sheet.render(); } }, icon('back'), 'Back')),
      h('div', { class: 'sheet-scroll padded' },
        h('h3', { class: 'section-title' }, 'Name'), input,
        h('h3', { class: 'section-title' }, 'Muscle group'), groups, add));
    update();
  }
  return sheet;
}
