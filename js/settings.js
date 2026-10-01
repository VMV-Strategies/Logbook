// Settings sheet: units, appearance, backup. Deliberately not a tab.
import { h, openSheet, sheetHeader, segmented, actionSheet, toast, rerenderAll, applyTheme, fmtDayYear } from './ui.js';
import * as store from './store.js';
import { state } from './store.js';
import { buildBackup, parseBackupText, localDateKey } from './logic.js';
import { LIBRARY_IDS } from './exercises.js';
import { APP_NAME, APP_VERSION } from './config.js';

export function openSettings() {
  const sheet = openSheet((panel) => {
    const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'visually-hidden', tabindex: '-1', 'aria-hidden': 'true' });
    file.addEventListener('change', () => { const f = file.files && file.files[0]; file.value = ''; if (f) importFile(f, sheet); });
    panel.append(
      sheetHeader('Settings', null, h('button', { type: 'button', class: 'nav-btn strong', onclick: () => sheet.close() }, 'Done')),
      h('div', { class: 'sheet-scroll padded' },
        h('h3', { class: 'section-title' }, 'Weight unit'),
        segmented('Weight unit', ['lb', 'kg'], state.settings.weightUnit, (id) => {
          store.setSetting('weightUnit', id); sheet.render(); rerenderAll();
        }),
        h('h3', { class: 'section-title' }, 'Appearance'),
        segmented('Appearance', [{ id: 'system', label: 'System' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }],
          state.settings.theme, (id) => { store.setSetting('theme', id); applyTheme(id); sheet.render(); rerenderAll(); }),
        h('h3', { class: 'section-title' }, 'Backup'),
        h('div', { class: 'list' },
          h('button', { type: 'button', class: 'row tint', onclick: () => exportData(sheet) }, 'Export Data'),
          h('button', { type: 'button', class: 'row tint', onclick: () => file.click() }, 'Import Data')),
        file,
        h('p', { class: 'footnote' },
          `Your data is stored only on this device. Export a backup regularly and keep the file in Files or iCloud Drive. Last backup: ${
            state.settings.lastExportAt ? fmtDayYear(state.settings.lastExportAt) : 'never'}.`),
        h('p', { class: 'footnote about' }, `${APP_NAME} ${APP_VERSION}`)));
  }, { tall: true, label: 'Settings' });
}

async function exportData(sheet) {
  const backup = buildBackup({ workouts: state.workouts, body: state.body, customExercises: state.customExercises, settings: state.settings });
  const name = `logbook-backup-${localDateKey()}.json`;
  const json = JSON.stringify(backup, null, 2);
  try {
    const fileObj = new File([json], name, { type: 'application/json' });
    const touch = matchMedia('(pointer: coarse)').matches;
    if (touch && navigator.canShare && navigator.canShare({ files: [fileObj] })) {
      await navigator.share({ files: [fileObj] }); // iPhone share sheet: choose "Save to Files"
    } else {
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = h('a', { href: url, download: name });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
    await store.setSetting('lastExportAt', Date.now());
    sheet.render();
    toast('Backup exported');
  } catch (err) {
    if (err && err.name === 'AbortError') return; // share sheet dismissed
    console.error(err);
    actionSheet({ title: 'Export failed', message: 'The backup file could not be created. Nothing was changed.', actions: [] });
  }
}

async function importFile(f, sheet) {
  let text;
  try { text = await f.text(); } catch { text = null; }
  const result = text == null ? { ok: false, error: 'This file could not be opened.' } : parseBackupText(text, LIBRARY_IDS);
  if (!result.ok) {
    actionSheet({ title: 'This file can’t be imported', message: `${result.error} Your current data was not changed.`, actions: [] });
    return;
  }
  const { data } = result;
  const when = result.exportedAt && !Number.isNaN(Date.parse(result.exportedAt)) ? `, exported ${fmtDayYear(Date.parse(result.exportedAt))}` : '';
  actionSheet({
    title: 'Replace all data on this device?',
    message: `The backup has ${data.workouts.length} workouts and ${data.body.length} body entries${when}. ` +
      'Everything currently in Logbook on this device will be replaced by it.',
    actions: [{ label: 'Replace My Data', destructive: true, onSelect: async () => {
      try {
        await store.replaceAll(data);
        applyTheme(state.settings.theme);
        sheet.close();
        rerenderAll();
        toast('Backup restored');
      } catch (err) {
        console.error(err);
        actionSheet({ title: 'Import failed', message: 'The backup could not be saved. Your existing data was left as it was.', actions: [] });
      }
    } }],
  });
}
