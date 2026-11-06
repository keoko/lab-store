const AUTHOR_PREVIEW_HOST = /(^|\.)preview\.da\.live$/;

/**
 * Checks whether the page is rendered inside the DA canvas for authors.
 * The canvas loads the page with `controller=parent&quick-edit=on` in an iframe.
 * @param {string} href The page URL.
 * @param {boolean} embedded Whether the page is inside another window.
 * @returns {boolean} True when the page is an embedded DA author preview.
 */
export function isAuthorPreview(href, embedded) {
  if (!embedded) return false;
  const { hostname, searchParams } = new URL(href);
  return (hostname === 'localhost' || AUTHOR_PREVIEW_HOST.test(hostname))
    && searchParams.get('controller') === 'parent'
    && searchParams.get('quick-edit') === 'on';
}

const inAuthorPreview = () => isAuthorPreview(
  window.location.href,
  window.parent !== window,
);

/**
 * Checks if experimentation is enabled.
 * @param {Document} document The document object.
 * @returns {boolean} True if experimentation is enabled, false otherwise.
 */
const isExperimentationEnabled = (document) => Boolean(
  document.head.querySelector('[name^="experiment"],[name^="campaign-"],[name^="audience-"],[property^="campaign:"],[property^="audience:"]')
  || [...document.querySelectorAll('.section-metadata div')].some((d) => d.textContent.match(/Experiment|Campaign|Audience/i)),
);

/**
 * Loads the experimentation module (eager).
 * Pages without experiments skip it, except in the DA author preview, where the
 * engine always runs so the authoring panel can read its configuration.
 * @param {Document} document The document object.
 * @param {Object} config The experimentation configuration.
 * @returns {Promise<boolean>} True when the experimentation engine initialized.
 */
export async function runExperimentation(document, config) {
  if (!inAuthorPreview() && !isExperimentationEnabled(document)) {
    return false;
  }

  try {
    const { loadEager } = await import(
      '../plugins/experimentation/src/index.js'
    );
    await loadEager(document, config);
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load experimentation module (eager):', error);
    return false;
  }
}

/**
 * Connects the authoring tooling (lazy).
 * In the DA author preview the page talks to the DA experimentation panel over a
 * scoped channel. Elsewhere the simulation panel is an authoring aid, so this is
 * a no-op in production — the coarse check below avoids even fetching the plugin
 * there, and the plugin re-checks authoritatively before showing anything.
 * Does nothing unless the eager phase initialized the engine.
 * @param {Document} document The document object.
 * @param {Object} config The experimentation configuration.
 * @returns {Promise<boolean>} True when the authoring tooling was set up.
 */
export async function runExperimentationLazy(document, config) {
  if (!(window.aem || window.hlx)?.experimentation) {
    return false;
  }

  if (inAuthorPreview()) {
    try {
      const { default: connectAuthorPreview } = await import('./experimentation-preview.js');
      connectAuthorPreview(config);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to connect the experimentation panel:', error);
    }
    return true;
  }

  const { host, hostname, origin } = window.location;
  const isPreview = hostname === 'localhost'
    || hostname.endsWith('.page')
    || (typeof config.isProd === 'function' && !config.isProd())
    || (config.prodHost && ![host, hostname, origin].includes(config.prodHost));
  if (!isPreview) {
    return false;
  }

  try {
    const { loadLazy } = await import(
      '../plugins/experimentation/src/index.js'
    );
    await loadLazy(document, config);
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load experimentation module (lazy):', error);
    return false;
  }
}
