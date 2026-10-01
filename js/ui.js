// Small UI toolkit: element builder, icons, formatting, pushed pages, sheets, toasts.
import { state } from './store.js';
import { toDisplay, formatNumber, roundTo } from './logic.js';

/* ---------- element builder ---------- */
// All user text goes in as text nodes, never as HTML.
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  const add = (kid) => {
    if (kid == null || kid === false) return;
    if (Array.isArray(kid)) kid.forEach(add);
    else el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  };
  kids.forEach(add);
  return el;
}

/* ---------- icons (original line drawings; the gear path is from Feather, MIT) ---------- */
const S = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
const ICONS = {
  chevron: `<svg viewBox="0 0 8 14" width="8" height="14" ${S} stroke-width="2"><path d="M1 1l6 6-6 6"/></svg>`,
  back: `<svg viewBox="0 0 12 20" width="12" height="20" ${S} stroke-width="2.4"><path d="M10 2L2 10l8 8"/></svg>`,
  check: `<svg viewBox="0 0 16 16" width="16" height="16" ${S} stroke-width="2.6"><path d="M3 8.5l3.2 3.2L13 4.8"/></svg>`,
  plus: `<svg viewBox="0 0 16 16" width="16" height="16" ${S} stroke-width="2.2"><path d="M8 2.5v11M2.5 8h11"/></svg>`,
  more: `<svg viewBox="0 0 22 22" width="22" height="22" fill="currentColor"><circle cx="4.5" cy="11" r="1.9"/><circle cx="11" cy="11" r="1.9"/><circle cx="17.5" cy="11" r="1.9"/></svg>`,
  search: `<svg viewBox="0 0 17 17" width="17" height="17" ${S} stroke-width="2"><circle cx="7" cy="7" r="5"/><path d="M11 11l4.5 4.5"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" width="23" height="23" ${S} stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  tabWorkout: `<svg viewBox="0 0 26 26" width="26" height="26" ${S} stroke-width="2.1"><path d="M3.5 10.5v5M7 7.5v11M19 7.5v11M22.5 10.5v5M7 13h12"/></svg>`,
  tabProgress: `<svg viewBox="0 0 26 26" width="26" height="26" ${S} stroke-width="2.1"><path d="M3.5 18.5l6-6 4.5 3.5 8-8.5"/><path d="M16.5 7.5H22V13"/></svg>`,
  tabBody: `<svg viewBox="0 0 26 26" width="26" height="26" ${S} stroke-width="2.1"><circle cx="13" cy="7.6" r="3.6"/><path d="M5.5 21.5c.7-4.4 3.6-6.6 7.5-6.6s6.8 2.2 7.5 6.6"/></svg>`,
};
export function icon(name, cls = '') {
  const s = document.createElement('span');
  s.className = ('icon ' + cls).trim();
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name];
  return s;
}

/* ---------- formatting ---------- */
const LOCALE = 'en-US';
const F = {
  day: new Intl.DateTimeFormat(LOCALE, { month: 'short', day: 'numeric' }),
  dayYear: new Intl.DateTimeFormat(LOCALE, { month: 'short', day: 'numeric', year: 'numeric' }),
  week: new Intl.DateTimeFormat(LOCALE, { weekday: 'short', month: 'short', day: 'numeric' }),
  weekYear: new Intl.DateTimeFormat(LOCALE, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
  time: new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit' }),
};
const thisYear = (d) => d.getFullYear() === new Date().getFullYear();
export function fmtDay(ts) { const d = new Date(ts); return (thisYear(d) ? F.day : F.dayYear).format(d); }
export function fmtDayYear(ts) { return F.dayYear.format(new Date(ts)); }
export function fmtWeekday(ts) { const d = new Date(ts); return (thisYear(d) ? F.week : F.weekYear).format(d); }
export function fmtTime(ts) { return F.time.format(new Date(ts)); }
export function fmtDuration(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}
export const unit = () => state.settings.weightUnit;
export function fmtW(lb, dp = 2) { return formatNumber(toDisplay(lb, unit()), dp); }
export function fmtSet(s) { return s.weight > 0 ? `${fmtW(s.weight)} ${unit()} × ${s.reps}` : `${s.reps} reps`; }
export function fmtSigned(n, dp = 1) {
  const r = roundTo(n, dp);
  return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r);
}

/* ---------- screen layout ---------- */
export function layout(root, nav, children) {
  const bar = h('header', { class: 'navbar' },
    h('div', { class: 'nav-side left' }, nav.left),
    h('div', { class: 'nav-title' }, nav.title || ''),
    h('div', { class: 'nav-side right' }, nav.right));
  const scroll = h('div', { class: 'scroll' }, h('div', { class: 'content' }, children));
  scroll.addEventListener('scroll', () => bar.classList.toggle('scrolled', scroll.scrollTop > 4), { passive: true });
  root.replaceChildren(bar, scroll);
  return scroll;
}

export function segmented(label, options, value, onChange) {
  return h('div', { class: 'segmented', role: 'group', 'aria-label': label },
    options.map((o) => {
      const opt = typeof o === 'string' ? { id: o, label: o } : o;
      return h('button', {
        type: 'button', class: opt.id === value ? 'on' : '', 'aria-pressed': String(opt.id === value),
        onclick: () => { if (opt.id !== value) onChange(opt.id); },
      }, opt.label);
    }));
}

/* ---------- render registry ---------- */
let rootRenderer = () => {};
const pages = [];
export function setRootRenderer(fn) { rootRenderer = fn; }
/** Redraws the current tab and every pushed page from current data. */
export function rerenderAll() {
  rootRenderer();
  pages.forEach((p) => p.render());
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function syncInert() {
  const app = document.getElementById('app');
  const overlays = document.getElementById('overlays');
  const sheetOpen = overlays.childElementCount > 0;
  app.inert = sheetOpen;
  document.getElementById('tab').inert = pages.length > 0;
  document.getElementById('tabbar').inert = pages.length > 0;
  pages.forEach((p, i) => { p.el.inert = i < pages.length - 1; });
}

/* ---------- pushed pages (slide in from the right, like an iOS navigation push) ---------- */
export function pushPage(render) {
  const el = h('div', { class: 'page view' });
  const page = {
    el,
    render() {
      const sc = el.querySelector('.scroll');
      const top = sc ? sc.scrollTop : 0;
      render(el, page);
      const sc2 = el.querySelector('.scroll');
      if (sc2) sc2.scrollTop = top;
    },
    close() {
      const i = pages.indexOf(page);
      if (i === -1) return;
      pages.splice(i, 1);
      el.classList.remove('in');
      el.inert = true;
      setTimeout(() => el.remove(), reducedMotion() ? 0 : 340);
      syncInert();
      rerenderAll();
    },
  };
  pages.push(page);
  document.getElementById('pages').append(el);
  page.render();
  void el.offsetWidth;
  el.classList.add('in');
  syncInert();
  return page;
}
export function backButton(page, label = 'Back') {
  return h('button', { type: 'button', class: 'nav-btn back', onclick: () => page.close() }, icon('back'), label);
}

/* ---------- sheets ---------- */
const sheets = [];
export function openSheet(render, opts = {}) {
  const prevFocus = document.activeElement;
  const layer = h('div', { class: 'sheet-layer' + (opts.action ? ' is-action' : '') });
  const panel = h('div', {
    class: 'sheet' + (opts.tall ? ' tall' : '') + (opts.action ? ' action' : ''),
    role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.label || 'Dialog', tabindex: '-1',
  });
  const sheet = {
    el: panel,
    render() { panel.replaceChildren(); render(panel, sheet); },
    close() {
      const i = sheets.indexOf(sheet);
      if (i === -1) return;
      sheets.splice(i, 1);
      layer.classList.remove('in');
      layer.style.pointerEvents = 'none';
      // Leave the overlay container right away so the app underneath is usable again.
      document.body.append(layer);
      setTimeout(() => layer.remove(), reducedMotion() ? 0 : 300);
      syncInert();
      if (prevFocus && document.contains(prevFocus) && !prevFocus.matches('input, textarea')) {
        try { prevFocus.focus({ preventScroll: true }); } catch { /* ignore */ }
      }
    },
  };
  layer.append(h('div', { class: 'backdrop', onclick: () => sheet.close() }), panel);
  sheets.push(sheet);
  document.getElementById('overlays').append(layer);
  sheet.render();
  void layer.offsetWidth;
  layer.classList.add('in');
  syncInert();
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  try { panel.focus({ preventScroll: true }); } catch { /* ignore */ }
  return sheet;
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheets.length) sheets[sheets.length - 1].close();
});

/** iOS-style action sheet. Every action sheet also gets a Cancel button. */
export function actionSheet({ title, message, actions }) {
  const sheet = openSheet((panel) => {
    panel.append(
      h('div', { class: 'action-group' },
        (title || message) && h('div', { class: 'action-head' },
          title && h('div', { class: 'action-title' }, title),
          message && h('div', { class: 'action-message' }, message)),
        actions.map((a) => h('button', {
          type: 'button', class: 'action-btn' + (a.destructive ? ' destructive' : ''),
          onclick: () => { sheet.close(); a.onSelect(); },
        }, a.label))),
      h('div', { class: 'action-group' },
        h('button', { type: 'button', class: 'action-btn cancel', onclick: () => sheet.close() }, actions.length ? 'Cancel' : 'OK')));
  }, { action: true, label: title || 'Options' });
  return sheet;
}

export function sheetHeader(title, left, right) {
  return h('div', { class: 'sheet-head' },
    h('div', { class: 'nav-side left' }, left),
    h('div', { class: 'nav-title' }, title),
    h('div', { class: 'nav-side right' }, right));
}

/* ---------- toast ---------- */
let toastTimer = null;
export function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ---------- theme ---------- */
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
  try { localStorage.setItem('logbook-theme', theme); } catch { /* preference only */ }
  const light = document.querySelector('meta[name="theme-color"][data-scheme="light"]');
  const dark = document.querySelector('meta[name="theme-color"][data-scheme="dark"]');
  if (light && dark) {
    light.content = theme === 'dark' ? '#000000' : '#ffffff';
    dark.content = theme === 'light' ? '#ffffff' : '#000000';
  }
}
