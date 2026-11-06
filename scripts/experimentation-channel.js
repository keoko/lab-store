export const BRIDGE_MESSAGE = 'da:contextual-experimentation';

export default function createPreviewChannel(pageUrl) {
  const url = new URL(pageUrl);
  if (url.origin !== window.location.origin) {
    throw new Error('Open the deployed DA plugin on the same code branch as the canvas preview.');
  }
  // Same-origin frames share sessionStorage within a tab, including inside Shadow DOM.
  let session;
  try {
    session = window.sessionStorage.getItem(BRIDGE_MESSAGE);
    if (!session) {
      session = crypto.randomUUID();
      window.sessionStorage.setItem(BRIDGE_MESSAGE, session);
    }
  } catch {
    throw new Error('Allow browser storage for this DA preview to connect the experimentation panel.');
  }
  const path = url.pathname.replace(/\.html$/, '').replace(/\/index$/, '/')
    .replace(/\/+$/, '') || '/';
  return new BroadcastChannel(`${BRIDGE_MESSAGE}:${session}:${path}`);
}
