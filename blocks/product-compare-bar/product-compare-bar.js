import { events } from '@dropins/tools/event-bus.js';
import { Image, provider as UI } from '@dropins/tools/components.js';
import { readBlockConfig } from '../../scripts/aem.js';

const MAX_COMPARE_SKUS = 3;

function getSkusFromUrl() {
  const url = new URL(window.location.href);
  return (url.searchParams.get('compare') || '')
    .split(',')
    .map((sku) => sku.trim())
    .filter(Boolean);
}

// Keeps the running comparison selection in the URL so it's shareable and
// survives a refresh; removing a SKU here also removes it from the param.
function setSkusInUrl(skus) {
  const url = new URL(window.location.href);
  if (skus.length) {
    url.searchParams.set('compare', skus.join(','));
  } else {
    url.searchParams.delete('compare');
  }
  window.history.replaceState({}, '', url);
}

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default async function decorate(block) {
  const config = readBlockConfig(block);
  const comparePagePath = config['compare-page']?.trim();

  // Selection state: array of { sku, name, image }. Hydrated from the URL
  // (name/image are unknown until re-added, sku is enough to compare).
  let selection = getSkusFromUrl()
    .slice(0, MAX_COMPARE_SKUS)
    .map((sku) => ({ sku, name: sku }));

  block.innerHTML = '';

  const list = document.createElement('ul');
  list.className = 'product-compare-bar__list';

  const actions = document.createElement('div');
  actions.className = 'product-compare-bar__actions';

  // Rather than link to a guessed path, skip the button entirely when the
  // authored redirect target is missing so the bar never sends shoppers
  // somewhere unintended.
  let compareLink = null;
  if (comparePagePath) {
    compareLink = document.createElement('a');
    compareLink.className = 'product-compare-bar__compare-button';
    actions.appendChild(compareLink);
  } else {
    console.warn('product-compare-bar: "Compare Page" is missing or blank; not rendering the Compare button');
  }

  block.append(list, actions);

  function removeFromSelection(sku) {
    selection = selection.filter((product) => product.sku !== sku);
    setSkusInUrl(selection.map((product) => product.sku));
    render();
  }

  function render() {
    list.innerHTML = '';

    const renders = [];

    selection.forEach((product) => {
      const item = document.createElement('li');
      item.className = 'product-compare-bar__item';

      if (product.image) {
        const imageWrapper = document.createElement('div');
        imageWrapper.className = 'product-compare-bar__item-image';
        renders.push(UI.render(Image, {
          src: product.image,
          alt: product.name || product.sku,
          params: { width: 96 },
        })(imageWrapper));
        item.appendChild(imageWrapper);
      }

      const label = document.createElement('span');
      label.className = 'product-compare-bar__item-label';
      label.textContent = product.name || product.sku;
      item.appendChild(label);

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'product-compare-bar__remove';
      removeButton.setAttribute('aria-label', `Remove ${product.name || product.sku} from compare`);
      removeButton.textContent = '×';
      removeButton.addEventListener('click', () => removeFromSelection(product.sku));
      item.appendChild(removeButton);

      list.appendChild(item);
    });

    if (compareLink) {
      const skus = selection.map((product) => product.sku);
      compareLink.href = `${comparePagePath}?compare=${skus.join(',')}`;
      compareLink.textContent = `Compare (${selection.length})`;
    }

    block.classList.toggle('product-compare-bar--empty', selection.length === 0);

    return Promise.all(renders);
  }

  await render();

  events.on('compare/products', (payload) => {
    if (!payload?.sku || selection.some((product) => product.sku === payload.sku)) {
      return;
    }

    if (selection.length >= MAX_COMPARE_SKUS) {
      console.warn(`product-compare-bar: comparison is limited to ${MAX_COMPARE_SKUS} products`, payload);
      return;
    }

    selection = [...selection, payload];
    setSkusInUrl(selection.map((product) => product.sku));
    render();
  });
}
