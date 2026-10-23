/**
 * Styles - Experience Workspace panel extension.
 *
 * Lists the styles defined in the site's design-tokens sheet (the one
 * scripts/design-tokens.js loads) and applies the chosen style to whatever is
 * selected on the canvas:
 *  - a block: as a block variant,
 *  - a metadata / section-metadata table: in its `Theme` / `Style` row.
 *
 * Runs in an iframe inside the EW canvas and talks to it through the DA App
 * SDK: live document + selection subscription in, `sendHTML(..., { replace })`
 * out. Register it as a row of the `library` sheet in the site config.
 *
 * Optional query parameter: `?sheet=/path/to/sheet` overrides the sheet taken
 * from the page's `design-tokens` metadata.
 */

// eslint-disable-next-line import/no-unresolved -- hosted by Experience Workspace
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import {
  toClassName,
  getBlock,
  applyBlockStyle,
  getStyleTable,
  applyTableStyle,
  getDesignTokensPath,
} from './styles-dom.js';

const HOST_TIMEOUT_MS = 3000;
const SELECTION_POLL_MS = 600;
const DEFAULT_STYLE = { label: 'Site default', className: '', colors: {} };

/** Sheet columns shown in the card preview, by slugified header. */
const COLOR_COLUMNS = ['background-color', 'text-color', 'color-primary', 'border-color'];

const state = {
  actions: null,
  html: '',
  blockIndex: null,
  editable: true,
  sheetPath: undefined,
  styles: [],
  target: null,
  busy: false,
  message: '',
  error: false,
};

const root = document.createElement('div');
root.className = 'style-picker';
document.body.append(root);

/**
 * @param {unknown} payload EDS sheet JSON
 * @returns {Array<{ label: string, className: string, colors: Record<string, string> }>}
 */
function parseSheet(payload) {
  const rows = Array.isArray(payload) ? payload : payload?.data;
  if (!Array.isArray(rows) || !rows.length) return [];
  const [nameColumn] = Object.keys(rows[0]).filter((key) => !key.startsWith(':'));
  return rows.map((row) => {
    const className = toClassName(row[nameColumn]);
    if (!className) return null;
    const colors = {};
    Object.entries(row).forEach(([column, value]) => {
      const slug = toClassName(column);
      if (COLOR_COLUMNS.includes(slug) && value && value.trim()) colors[slug] = value.trim();
    });
    return { label: row[nameColumn].trim(), className, colors };
  }).filter(Boolean);
}

async function loadStyles(sheetPath) {
  state.sheetPath = sheetPath;
  state.styles = [];
  if (!sheetPath) return;
  const url = new URL(sheetPath.endsWith('.json') ? sheetPath : `${sheetPath}.json`, window.location.origin);
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`${resp.status}`);
    state.styles = parseSheet(await resp.json());
  } catch (e) {
    console.warn('[styles] could not load', url.href, e);
    state.message = `Could not load the styles sheet (${sheetPath}).`;
    state.error = true;
  }
}

function currentStyles() {
  return state.target ? state.target.current : [];
}

function statusText() {
  if (state.message) return state.message;
  if (!state.editable) return 'This document is read-only.';
  if (!state.target) return 'Select a block, metadata or section metadata to apply a style.';
  const current = state.target.current.length ? ` (${state.target.current.join(', ')})` : '';
  return `Applying to ${state.target.label}${current}`;
}

function buildCard(style) {
  const known = currentStyles();
  const active = style.className
    ? known.includes(style.className)
    : !state.styles.some((s) => known.includes(s.className));

  const item = document.createElement('li');
  const name = document.createElement('span');
  name.className = 'style-name';
  name.textContent = style.label;

  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'style-card';
  card.setAttribute('aria-pressed', String(active && !!state.target));
  card.setAttribute('aria-label', `Apply style ${style.label}`);
  card.disabled = !state.target || !state.editable || state.busy;
  card.addEventListener('click', () => apply(style));

  const { colors } = style;
  const preview = document.createElement('span');
  preview.className = 'style-preview';
  if (colors['background-color']) preview.style.setProperty('--sp-bg', colors['background-color']);
  if (colors['text-color']) preview.style.setProperty('--sp-text', colors['text-color']);
  if (colors['color-primary']) preview.style.setProperty('--sp-primary', colors['color-primary']);
  if (colors['border-color']) preview.style.setProperty('--sp-border', colors['border-color']);

  const copy = document.createElement('span');
  copy.className = 'style-copy';
  const text = document.createElement('span');
  text.className = 'style-text';
  text.textContent = 'This week’s deals:';
  const heading = document.createElement('span');
  heading.className = 'style-heading';
  heading.textContent = 'Sample heading';
  const button = document.createElement('span');
  button.className = 'style-button';
  button.textContent = 'Shop the sale';
  copy.append(text, heading, button);

  const art = document.createElement('span');
  art.className = 'style-art';
  preview.append(copy, art);

  card.append(preview);
  item.append(name, card);
  return item;
}

function render() {
  const heading = document.createElement('h2');
  heading.textContent = 'Styles';

  const status = document.createElement('p');
  status.className = 'style-status';
  status.setAttribute('role', 'status');
  status.dataset.error = String(state.error);
  status.textContent = statusText();

  const list = document.createElement('ul');
  list.className = 'style-list';
  [DEFAULT_STYLE, ...state.styles].forEach((style) => list.append(buildCard(style)));

  const children = [heading, status];
  if (!state.sheetPath) {
    const hint = document.createElement('p');
    hint.className = 'style-hint';
    hint.textContent = 'This page has no design-tokens metadata, so there are no styles to pick. '
      + 'Add a design-tokens row to the page metadata, or open this panel with ?sheet=/path/to/sheet.';
    children.push(hint);
  } else {
    children.push(list);
  }
  root.replaceChildren(...children);
}

function setTarget(target) {
  const sig = (t) => JSON.stringify(t && [t.kind, t.label, t.current, t.html]);
  if (sig(target) === sig(state.target)) return false;
  state.target = target;
  return true;
}

function knownClasses() {
  return new Set(state.styles.map((s) => s.className));
}

function targetFromBlock() {
  const block = getBlock(state.html, state.blockIndex);
  if (!block) return null;
  return { kind: 'block', label: block.name, current: block.current };
}

async function targetFromSelection() {
  try {
    const html = await state.actions.getSelection();
    const info = getStyleTable(html);
    return info && {
      kind: 'table', label: info.label, current: info.current, html,
    };
  } catch {
    // no selection, or the host does not answer: nothing to apply to
    return null;
  }
}

async function onLive({ html, selection, editable }) {
  const path = new URLSearchParams(window.location.search).get('sheet') || getDesignTokensPath(html);
  state.html = html;
  state.blockIndex = selection.blockIndex;
  if (editable !== undefined) state.editable = editable;
  if (path !== state.sheetPath) {
    state.message = '';
    state.error = false;
    await loadStyles(path);
  }
  const target = state.blockIndex !== null ? targetFromBlock() : await targetFromSelection();
  setTarget(target);
  render();
}

let polling = false;
async function pollSelection() {
  if (polling || state.busy || state.blockIndex !== null || document.visibilityState !== 'visible') return;
  polling = true;
  const changed = setTarget(await targetFromSelection());
  polling = false;
  if (changed) render();
}

async function apply(style) {
  const { target } = state;
  if (!target || state.busy) return;
  state.busy = true;
  state.message = '';
  state.error = false;
  render();

  const known = knownClasses();
  let result;
  try {
    if (target.kind === 'block') {
      const { element } = getBlock(state.html, state.blockIndex);
      const html = applyBlockStyle(element, style.className, known);
      result = await state.actions.sendHTML(html, {
        replace: true,
        expected: { html: state.html, blockIndex: state.blockIndex },
      });
    } else {
      const html = applyTableStyle(target.html, style.className, known);
      result = await state.actions.sendHTML(html, { replace: true });
    }
  } catch (e) {
    result = { ok: false, error: e.message };
  }

  state.busy = false;
  if (!result.ok) {
    state.message = `Could not apply ${style.label}: ${result.message || result.error}`;
    state.error = true;
    render();
    return;
  }
  if (result.html) {
    await onLive(result);
  } else {
    // applied, but the host could not serialize the document: wait for the next snapshot
    render();
  }
}

async function init() {
  const sdk = await Promise.race([
    DA_SDK,
    new Promise((resolve) => { setTimeout(resolve, HOST_TIMEOUT_MS); }),
  ]);
  if (!sdk) {
    state.message = 'Open this panel from the Experience Workspace canvas.';
    render();
    return;
  }
  if (!sdk.capabilities?.liveDocument) {
    state.message = 'This Experience Workspace version does not support live document access.';
    state.error = true;
    render();
    return;
  }
  state.actions = sdk.actions;
  render();
  sdk.actions.subscribeLiveDocument(onLive);
  setInterval(pollSelection, SELECTION_POLL_MS);
}

init();
