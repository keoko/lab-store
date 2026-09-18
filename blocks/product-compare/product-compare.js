import { search } from '@dropins/storefront-product-discovery/api.js';
import { Image, PriceRange, provider as UI } from '@dropins/tools/components.js';
import { readBlockConfig } from '../../scripts/aem.js';

// Initializers
import '../../scripts/initializers/search.js';

const MAX_COMPARE_SKUS = 3;

/**
 * Resolves the min/max amount + currency shape PriceRange expects.
 * Complex products (configurable, bundle, etc.) carry a price range across
 * variants; simple products have a single price point used for both ends.
 */
function getProductPriceRange(product) {
  const final = product.typename === 'ComplexProductView'
    ? {
      min: product.priceRange?.minimum?.final?.amount,
      max: product.priceRange?.maximum?.final?.amount,
    }
    : {
      min: product.price?.final?.amount,
      max: product.price?.final?.amount,
    };

  return {
    currency: final.min?.currency ?? final.max?.currency,
    minimumAmount: final.min?.value,
    maximumAmount: final.max?.value,
  };
}

function findAttributeValue(product, attributeName) {
  const normalized = attributeName.toLowerCase();
  const attribute = product.attributes?.find(
    (attr) => attr.label?.toLowerCase() === normalized || attr.name?.toLowerCase() === normalized,
  );
  return attribute?.value;
}

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default async function decorate(block) {
  const config = readBlockConfig(block);

  // Shopper-driven selection (from the compare bar) takes precedence over the
  // merchandiser-curated "SKUs" row when the shopper arrives with one.
  const url = new URL(window.location.href);
  const compareParam = url.searchParams.get('compare');
  const rawSkus = compareParam !== null ? compareParam : (config.skus || '');

  const skus = rawSkus
    .split(',')
    .map((sku) => sku.trim())
    .filter(Boolean);

  if (skus.length > MAX_COMPARE_SKUS) {
    console.warn(`product-compare: ${skus.length} SKUs authored, only the first ${MAX_COMPARE_SKUS} will be compared`, skus);
  }

  const comparedSkus = skus.slice(0, MAX_COMPARE_SKUS);

  const attributeNames = (config.attributes || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

  block.innerHTML = '';

  if (comparedSkus.length === 0) {
    return;
  }

  const result = await search({
    filter: [{ attribute: 'sku', in: comparedSkus }],
  }).catch((e) => {
    console.error('product-compare: error fetching products to compare', e);
    return null;
  });

  const productsBySku = new Map((result?.items || []).map((item) => [item.sku, item]));

  const rowLabels = ['Image', 'Name', 'Price', ...attributeNames];
  const renders = [];

  const table = document.createElement('table');
  table.className = 'product-compare__table';
  const tbody = document.createElement('tbody');

  rowLabels.forEach((rowLabel, rowIndex) => {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = rowLabel;
    tr.appendChild(th);

    comparedSkus.forEach((sku) => {
      const product = productsBySku.get(sku);

      // Not found: render a single cell spanning every row instead of
      // leaving the column blank or throwing.
      if (!product) {
        if (rowIndex === 0) {
          const notFoundCell = document.createElement('td');
          notFoundCell.className = 'product-compare__not-found';
          notFoundCell.rowSpan = rowLabels.length;
          notFoundCell.textContent = `${sku}: not found`;
          tr.appendChild(notFoundCell);
        }
        return;
      }

      const td = document.createElement('td');

      if (rowLabel === 'Image') {
        renders.push(UI.render(Image, {
          src: product.images?.[0]?.url,
          alt: product.name || product.sku,
          params: { width: 300 },
        })(td));
      } else if (rowLabel === 'Name') {
        td.textContent = product.name || product.sku;
      } else if (rowLabel === 'Price') {
        const { currency, minimumAmount, maximumAmount } = getProductPriceRange(product);
        renders.push(UI.render(PriceRange, {
          currency,
          minimumAmount,
          maximumAmount,
        })(td));
      } else {
        td.textContent = findAttributeValue(product, rowLabel) ?? '—';
      }

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  block.appendChild(table);

  await Promise.all(renders);
}
