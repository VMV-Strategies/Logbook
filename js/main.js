// App start-up: load data, draw the tab bar, wire up iPhone-specific behavior.
import * as store from './store.js';
import { state } from './store.js';
import { h, icon, setRootRenderer, rerenderAll, applyTheme, actionSheet } from './ui.js';
import { renderWorkoutTab } from './workout.js';
import { renderProgressTab } from './progress.js';
import { renderBodyTab } from './body.js';
import { APP_NAME } from './config.js';

const TABS = [
  { id: 'workout', label: 'Workout', icon: 'tabWorkout', render: renderWorkoutTab },
  { id: 'progress', label: 'Progress', icon: 'tabProgress', render: renderProgressTab },
  { id: 'body', label: 'Body', icon: 'tabBody', render: renderBodyTab },
];
let current = 'workout';

function renderTab() {
  const root = document.getElementById('tab');
  const prev = root.querySelector('.scroll');
  const top = prev && root.dataset.tab === current ? prev.scrollTop : 0;
  root.dataset.tab = current;
  TABS.find((t) => t.id === current).render(root);
  const next = root.querySelector('.scroll');
  if (next) next.scrollTop = top;
  for (const b of document.querySelectorAll('#tabbar button')) {
    const on = b.dataset.tab === current;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
}

function buildTabBar() {
  const bar = document.getElementById('tabbar');
  bar.replaceChildren(h('div', { class: 'tabbar-inner' }, TABS.map((t) => h('button', {
    type: 'button', 'data-tab': t.id,
    onclick: () => {
      if (current === t.id) { const sc = document.querySelector('#tab .scroll'); if (sc) sc.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      current = t.id; renderTab();
    },
  }, icon(t.icon), h('span', {}, t.label)))));
}

// Keep the layout above the iPhone keyboard and the focused field in view.
function watchKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  const update = () => {
    const open = Math.abs(vv.scale - 1) < 0.01 && window.innerHeight - vv.height > 120;
    root.classList.toggle('kb-open', open);
    if (open) {
      root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
      window.scrollTo(0, 0);
      const el = document.activeElement;
      if (el && el.matches('input, textarea')) setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
    } else {
      root.style.removeProperty('--vvh');
    }
  };
  vv.addEventListener('resize', update);
}

async function boot() {
  document.title = APP_NAME;
  store.onStorageError(() => actionSheet({
    title: 'Couldn’t save',
    message: 'Your last change may not have been stored. Free up space on this device, then try again. Export a backup from Settings when you can.',
    actions: [],
  }));
  await store.load();
  applyTheme(state.settings.theme);
  buildTabBar();
  setRootRenderer(renderTab);
  renderTab();
  document.documentElement.classList.add('ready');

  if (!state.storageOk) {
    document.getElementById('banner').textContent =
      'Storage is unavailable in this browser window (for example Private Browsing), so nothing can be saved. Open Logbook normally.';
    document.getElementById('banner').hidden = false;
  }

  // Ask the browser not to clear this app's data when the device runs low on space.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Offline support unavailable', err));

  watchKeyboard();
  // Select the whole number on focus so typing replaces last time's value.
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (el instanceof HTMLInputElement && (el.classList.contains('num') || el.classList.contains('field-input'))) {
      setTimeout(() => { try { el.setSelectionRange(0, el.value.length); } catch { /* not selectable */ } }, 0);
    }
  });
  document.addEventListener('touchstart', () => {}, { passive: true }); // enables :active styles on iOS
  let width = window.innerWidth;
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (window.innerWidth === width) return;
    width = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (!document.activeElement || !document.activeElement.matches('input')) rerenderAll(); }, 150);
  });
}

boot();
