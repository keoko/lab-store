import createPreviewChannel, {
  BRIDGE_MESSAGE,
} from '../../../scripts/experimentation-channel.js';
import {
  MFE_ORIGIN,
  getPageContext,
  getEditorHash,
  getMfeUrl,
  isMfeMessage,
  rememberImsOrganization,
} from './context.js';

const form = document.querySelector('#connect');
const frame = document.querySelector('#experimentation');
const status = document.querySelector('#status');
const button = form.querySelector('button');
const pending = new Map();
rememberImsOrganization(form.querySelector('[name="imsOrg"]'));
let page;
let actions;
let latestConfig;
let channel;

function showError(error) {
  status.hidden = false;
  status.textContent = error.message || 'The experimentation connection failed.';
}

function requestPreview(action, details = {}) {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error('The canvas runtime did not respond. Open Layout or Split view and check that this code branch includes the experimentation runtime.'));
    }, 10000);
    pending.set(requestId, {
      resolve, reject, timer,
    });
    try {
      channel.postMessage({
        type: BRIDGE_MESSAGE, requestId, action, ...details,
      });
    } catch (error) {
      clearTimeout(timer);
      pending.delete(requestId);
      reject(error);
    }
  });
}

function sendConfig(config) {
  frame.contentWindow.postMessage({
    type: 'ue:experimentation-config',
    source: 'da-host',
    config,
  }, MFE_ORIGIN);
}

window.addEventListener('message', async (event) => {
  if (!page || !isMfeMessage(event, frame)) return;
  try {
    if (event.data.type === 'ue:request-fresh-config') {
      latestConfig = await requestPreview('config');
      sendConfig(latestConfig);
    } else if (event.data.type === 'ue:navigateTo') {
      const hash = getEditorHash(event.data.pageUrl, page);
      actions.setHash(hash);
    } else if (event.data.action === 'highlightElement') {
      await requestPreview('highlight', { selector: event.data.selector });
    } else if (event.data.action === 'removeHighlight') {
      await requestPreview('clear');
    }
  } catch (error) {
    showError(error);
  }
});

frame.addEventListener('load', () => {
  if (latestConfig) sendConfig(latestConfig);
});

async function init() {
  if (window.parent === window || !window.location.ancestorOrigins?.length
    || window.location.ancestorOrigins[0] !== 'https://da.live') {
    throw new Error('Open this plugin from the Experience Workspace tool panel.');
  }
  const { default: sdk } = await import('https://da.live/nx/utils/sdk.js');
  const host = await sdk;
  page = getPageContext(host.context);
  ({ actions } = host);
  if (!host.token) throw new Error('Sign in to DA, then reopen this panel.');
  channel = createPreviewChannel(page.pageUrl);
  channel.onmessage = (event) => {
    const request = pending.get(event.data?.requestId);
    if (event.data?.type !== BRIDGE_MESSAGE || !event.data.response || !request) return;
    pending.delete(event.data.requestId);
    clearTimeout(request.timer);
    if (event.data.error) request.reject(new Error(event.data.error));
    else request.resolve(event.data.result);
  };
  status.textContent = `Page: ${page.pageUrl}`;
  button.disabled = false;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    button.disabled = true;
    status.hidden = false;
    status.textContent = 'Connecting to the canvas runtime...';
    try {
      latestConfig = await requestPreview('config');
      frame.src = getMfeUrl({
        pageUrl: page.pageUrl,
        origin: window.location.origin,
        token: host.token,
        imsOrg: new FormData(form).get('imsOrg').trim(),
      });
      form.hidden = true;
      status.hidden = true;
      frame.hidden = false;
    } catch (error) {
      showError(error);
    } finally {
      button.disabled = false;
    }
  });
}

init().catch(showError);

window.addEventListener('pagehide', () => {
  if (channel) {
    channel.postMessage({
      type: BRIDGE_MESSAGE, requestId: crypto.randomUUID(), action: 'clear',
    });
    channel.close();
  }
  pending.forEach(({ timer, reject }) => {
    clearTimeout(timer);
    reject(new Error('The panel was closed.'));
  });
  pending.clear();
  frame.removeAttribute('src');
});
