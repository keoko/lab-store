/**
 * Design Tokens
 *
 * Lets authors supply custom design tokens (colors + simple layout hints) for a
 * page from a spreadsheet-backed JSON file, without touching code. Intended for
 * /drafts pages where per-page theming is needed.
 *
 * Usage (author): add a page metadata property `design-tokens` pointing at the
 * sheet, e.g.
 *   design-tokens: /nl-nl/drafts/cabre/wine/colors.json
 *
 * Expected payload (EDS sheet):
 *   { "data": [
 *       { "Style Name": "flair-rose", "Background": "#f4e6ee",
 *         "Foreground": "#5a1f3d", "Accent Color": "#e92f66",
 *         "Layout Split": "60-40" }
 *   ] }
 *
 * The first column becomes a CSS class name; every other column maps to a CSS
 * custom property derived from its header (`Background`/`Foreground` →
 * `--background-color`/`--foreground-color`, others → `--<slug>`). A
 * `<style id="design-tokens">` element is injected with one rule per style, and
 * non-color values are also stamped onto matching sections/blocks as
 * `data-*` attributes for CSS layout selectors.
 */

import { getMetadata, toClassName } from './aem.js';

const DESIGN_TOKENS_STYLE_ID = 'design-tokens';

/**
 * Map of design-token style class → CSS custom properties used by that style.
 * Populated by {@link loadDesignTokens}; consumed by
 * {@link applyDesignTokenDataAttributes}.
 * @type {Map<string, Array<{ cssVar: string, value: string }>>}
 */
const designTokenStyles = new Map();

/**
 * @param {string} value
 * @returns {string | null}
 */
function sanitizeCssColor(value) {
  if (typeof value !== 'string') return null;
  const color = value.trim();
  if (!color) return null;
  if (/^#[0-9a-f]{3,8}$/i.test(color)) return color;
  if (/^rgba?\([\d\s%,.]+\)$/i.test(color)) return color;
  if (/^var\(--[a-z0-9-]+\)$/i.test(color)) return color;
  return null;
}

/**
 * Allows colors and simple CSS keywords/identifiers (e.g. center, 60-40).
 * @param {string} value
 * @returns {string | null}
 */
function sanitizeCssTokenValue(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const color = sanitizeCssColor(trimmed);
  if (color) return color;
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(trimmed)) return trimmed.toLowerCase();
  return null;
}

/**
 * @param {unknown} payload
 * @returns {Array<Record<string, string>>}
 */
function normalizeDesignTokens(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (typeof payload === 'object' && Array.isArray(payload.data)) return payload.data;
  return [];
}

/**
 * @param {Array<Record<string, string>>} rows
 * @returns {string[]}
 */
function extractDesignTokenColumns(rows) {
  if (!rows.length) return [];

  const seen = new Set();
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (!key.startsWith(':')) seen.add(key);
    });
  });

  const ordered = Object.keys(rows[0]).filter((key) => seen.has(key));
  const remainder = [...seen].filter((key) => !ordered.includes(key));
  return [...ordered, ...remainder];
}

/**
 * Maps a sheet column header to a CSS custom property. The column name is
 * slugified verbatim into the variable name, so authors can override any
 * existing token directly from the sheet (e.g. a "Color Primary" column sets
 * `--color-primary`, a "Background Color" column sets `--background-color`)
 * without writing CSS.
 * @param {string} columnName
 * @returns {string | null}
 */
function columnToCssVar(columnName) {
  const slug = toClassName(columnName);
  if (!slug) return null;
  return `--${slug}`;
}

/**
 * @param {Record<string, string>} token
 * @param {string[]} columns
 * @returns {{ className: string, rule: string,
 *   vars: Array<{ cssVar: string, value: string }> } | null}
 */
function tokenToCssRule(token, columns) {
  if (!columns.length) return null;

  const [nameColumn, ...valueColumns] = columns;
  const className = toClassName(token[nameColumn]);
  if (!className) return null;

  const vars = valueColumns
    .map((column) => {
      const cssVar = columnToCssVar(column);
      const value = token[column];
      if (!cssVar || !value) return null;
      const sanitized = sanitizeCssTokenValue(value);
      if (!sanitized) {
        console.warn(`[design-tokens] ${className}: invalid ${cssVar}:`, value);
        return null;
      }
      return { cssVar, value: sanitized };
    })
    .filter(Boolean);

  if (!vars.length) return null;

  const rule = `.${className} { ${vars.map(({ cssVar, value }) => `${cssVar}: ${value}`).join('; ')}; }`;
  return { className, rule, vars };
}

/**
 * `data-color`/`data-text-color` already mean something else on a Columns block:
 * blocks/columns/columns.js reads them (normally set from a dedicated UE field) to
 * auto-promote the block into its unrelated `custom-columns` layout. A design-tokens
 * column named "Color"/"Text Color" would otherwise silently flip any token-styled
 * Columns block into that variant. Sections have no such conflict, so this only
 * guards blocks.
 * @type {Set<string>}
 */
const COLUMNS_RESERVED_DATA_ATTRS = new Set(['color', 'text-color']);

/**
 * Apply design-token values as data attributes on an element.
 * e.g. `--layout-split: 60-40` → `data-layout-split="60-40"`
 * @param {Element} el
 * @param {Array<{ cssVar: string, value: string }>} vars
 */
function applyTokenDataAttributes(el, vars) {
  const isColumnsBlock = el.classList.contains('columns');
  vars.forEach(({ cssVar, value }) => {
    const name = cssVar.replace(/^--/, '');
    if (!name || value == null || value === '') return;
    if (isColumnsBlock && COLUMNS_RESERVED_DATA_ATTRS.has(name)) return;
    el.setAttribute(`data-${name}`, value);
  });
}

/**
 * Resolve the design-tokens sheet URL from the `design-tokens` page metadata.
 * @returns {string} Absolute URL, or '' when the metadata is absent.
 */
function getDesignTokensUrl() {
  const meta = getMetadata('design-tokens');
  if (!meta) return '';
  try {
    return new URL(meta, window.location.href).href;
  } catch (e) {
    console.warn('[design-tokens] invalid design-tokens metadata:', meta);
    return '';
  }
}

/**
 * Fetches the author-provided design tokens and injects utility style classes.
 * No-op when the page has no `design-tokens` metadata.
 * @returns {Promise<void>}
 */
export async function loadDesignTokens() {
  designTokenStyles.clear();

  const url = getDesignTokensUrl();
  if (!url) return;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn('[design-tokens] fetch failed:', url, response.status);
      return;
    }

    const payload = await response.json();
    const tokens = normalizeDesignTokens(payload);
    const columns = extractDesignTokenColumns(tokens);

    const parsed = tokens.map((token) => tokenToCssRule(token, columns)).filter(Boolean);
    if (!parsed.length) return;

    parsed.forEach(({ className, vars }) => {
      designTokenStyles.set(className, vars);
    });

    const css = parsed.map(({ rule }) => rule).join('\n');
    let styleEl = document.getElementById(DESIGN_TOKENS_STYLE_ID);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = DESIGN_TOKENS_STYLE_ID;
      document.head.append(styleEl);
    }
    styleEl.textContent = css;
  } catch (error) {
    console.error('[design-tokens] failed to load design tokens', error);
  }
}

/**
 * After blocks are decorated, stamp non-color layout values (e.g. layout-split)
 * as `data-*` attributes onto sections/blocks that use a design-token style
 * class, so CSS can target them.
 * @param {Element} root
 */
export function applyDesignTokenDataAttributes(root) {
  if (!designTokenStyles.size) return;

  designTokenStyles.forEach((vars, styleClass) => {
    const selector = `.block.${CSS.escape(styleClass)}, .section.${CSS.escape(styleClass)}`;
    root.querySelectorAll(selector).forEach((el) => {
      applyTokenDataAttributes(el, vars);
    });
  });
}