const QUICK_EDIT_URL = 'https://da.live/nx/public/plugins/quick-edit/quick-edit.js';

const DEPENDENCIES = {
  'da-lit': 'https://da.live/deps/lit/dist/index.js',
  'da-y-wrapper': 'https://da.live/deps/da-y-wrapper/dist/index.js',
};

/**
 * Maps the bare specifiers used by the DA quick edit modules.
 * Existing mappings win, so a project can pin its own dependency URLs.
 */
export function addImportmap() {
  const mapped = new Set();
  document.querySelectorAll('script[type="importmap"]').forEach((script) => {
    try {
      Object.keys(JSON.parse(script.textContent).imports || {}).forEach((name) => mapped.add(name));
    } catch {
      // An unreadable map cannot be extended safely; map our dependencies anyway.
    }
  });
  const imports = Object.fromEntries(
    Object.entries(DEPENDENCIES).filter(([name]) => !mapped.has(name)),
  );
  if (!Object.keys(imports).length) return;
  const script = document.createElement('script');
  script.type = 'importmap';
  script.textContent = JSON.stringify({ imports });
  document.head.appendChild(script);
}

/**
 * Starts DA quick edit for this page.
 * @param {Function} reloadCallback Re-decorates the page after DA updates its content.
 */
export default async function initQuickEdit(reloadCallback) {
  addImportmap();
  const { default: loadQuickEdit } = await import(QUICK_EDIT_URL);
  await loadQuickEdit({}, reloadCallback);
}
