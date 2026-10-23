/**
 * Document manipulation for the Styles extension. Pure functions over HTML
 * strings, no host or SDK access, so they can be exercised on their own.
 *
 * Two kinds of targets are supported:
 *  - blocks: the style is a block variant (`<div class="banner flair-rose">`,
 *    authored as `banner (flair-rose)`). Matches `.block.<style>` in
 *    scripts/design-tokens.js.
 *  - metadata tables: `section-metadata` gets a `Style` row and `metadata` a
 *    `Theme` row (comma separated list). Matches `.section.<style>` and the
 *    `theme` body class respectively.
 */

/** Tables that Experience Workspace does not count as blocks (blockIndex). */
const NON_BLOCK_CLASSES = new Set(['metadata', 'section-metadata']);

/** Table header (normalized) -> row key carrying the style names. */
const TABLE_STYLE_KEYS = {
  'section metadata': 'Style',
  metadata: 'Theme',
};

const INSTRUMENTATION_ATTR = /^data-(prose-index|block-index|image-index|image-version|cursor-remote.*)$/;

/**
 * Same slug rules as `toClassName` in scripts/aem.js.
 * @param {string} name
 * @returns {string}
 */
export function toClassName(name) {
  return typeof name === 'string'
    ? name.toLowerCase().replace(/[^0-9a-z]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    : '';
}

/**
 * @param {string} html
 * @returns {Document}
 */
export function parseHtml(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

/**
 * @param {string} value comma separated style list, e.g. `highlight, cerise`
 * @returns {string[]}
 */
export function splitStyles(value) {
  return (value || '').split(',').map((s) => toClassName(s)).filter(Boolean);
}

/**
 * Remove the editor's position markers so a node can be sent back unchanged.
 * @param {Element} el
 * @returns {string} outerHTML
 */
function serialize(el) {
  [el, ...el.querySelectorAll('*')].forEach((node) => {
    [...node.attributes].forEach(({ name }) => {
      if (INSTRUMENTATION_ATTR.test(name)) node.removeAttribute(name);
    });
  });
  return el.outerHTML;
}

/**
 * Blocks in document order, using the same ordinal as the host's
 * `selection.blockIndex` (metadata and section-metadata are not blocks).
 * @param {Document} doc
 * @returns {Element[]}
 */
export function listBlocks(doc) {
  const root = doc.querySelector('main') || doc.body;
  return [...root.querySelectorAll(':scope > div > div[class]')]
    .filter((el) => !NON_BLOCK_CLASSES.has(el.classList[0]));
}

/**
 * @param {string} html live document html
 * @param {number} blockIndex
 * @returns {{ name: string, current: string[], element: Element } | null}
 */
export function getBlock(html, blockIndex) {
  const element = listBlocks(parseHtml(html))[blockIndex];
  if (!element) return null;
  const [name, ...variants] = element.classList;
  return { name, current: variants, element };
}

/**
 * Replace the style variants of a block. Variants that are not styles from
 * the sheet (e.g. `dark`) are kept.
 * @param {Element} block
 * @param {string} styleClass empty for "Site default"
 * @param {Set<string>} known every style class defined by the sheet
 * @returns {string} replacement html for the block
 */
export function applyBlockStyle(block, styleClass, known) {
  const clone = block.cloneNode(true);
  const [name, ...variants] = clone.classList;
  const kept = variants.filter((v) => !known.has(v));
  clone.className = [name, ...kept, ...(styleClass ? [styleClass] : [])].join(' ');
  return serialize(clone);
}

/**
 * @param {string} text
 * @returns {string} e.g. `section metadata`
 */
function normalizeHeader(text) {
  return (text || '').toLowerCase().replace(/[-_\s]+/g, ' ').trim();
}

/**
 * @param {HTMLTableRowElement[]} rows table rows, header first
 * @param {string} key row key, matched case-insensitively
 * @returns {HTMLTableRowElement | undefined}
 */
function findRow(rows, key) {
  return rows.slice(1)
    .find((r) => r.cells[0]?.textContent.trim().toLowerCase() === key.toLowerCase());
}

/**
 * @param {string} html selected html, as returned by `actions.getSelection()`
 * @returns {{ type: string, label: string, current: string[] } | null} null
 *   unless the selection is a metadata or section-metadata table
 */
export function getStyleTable(html) {
  const table = parseHtml(html).querySelector('table');
  if (!table) return null;
  const rows = [...table.querySelectorAll('tr')];
  const type = normalizeHeader(rows[0]?.textContent);
  const key = TABLE_STYLE_KEYS[type];
  if (!key) return null;
  const row = findRow(rows, key);
  return {
    type,
    label: type === 'metadata' ? 'Metadata' : 'Section metadata',
    current: splitStyles(row?.cells[1]?.textContent),
  };
}

/**
 * Update the style row of a metadata/section-metadata table. Styles from the
 * sheet are replaced, any other value in the cell is kept. The row is
 * removed when it ends up empty.
 * @param {string} html selected table html
 * @param {string} styleClass empty for "Site default"
 * @param {Set<string>} known every style class defined by the sheet
 * @returns {string | null} replacement table html, null if not a style table
 */
export function applyTableStyle(html, styleClass, known) {
  const table = parseHtml(html).querySelector('table');
  if (!table) return null;
  const rows = [...table.querySelectorAll('tr')];
  const key = TABLE_STYLE_KEYS[normalizeHeader(rows[0]?.textContent)];
  if (!key) return null;

  let row = findRow(rows, key);
  const kept = splitStyles(row?.cells[1]?.textContent).filter((s) => !known.has(s));
  const value = [...kept, ...(styleClass ? [styleClass] : [])].join(', ');

  if (!value) {
    row?.remove();
    return serialize(table);
  }
  if (!row) {
    row = table.ownerDocument.createElement('tr');
    row.append(
      Object.assign(table.ownerDocument.createElement('td'), { textContent: key }),
      table.ownerDocument.createElement('td'),
    );
    (rows[0].parentElement).append(row);
  }
  const cell = row.cells[1];
  const paragraph = cell.querySelector('p');
  (paragraph || cell).textContent = value;
  return serialize(table);
}
