import { events } from '@dropins/tools/event-bus.js';
import { render as orderRenderer } from '@dropins/storefront-order/render.js';
import { ShippingStatus } from '@dropins/storefront-order/containers/ShippingStatus.js';
import { tryRenderAemAssetsImage } from '@dropins/tools/lib/aem/assets.js';
import {
  UPS_TRACKING_URL,
  getProductLink,
} from '../../scripts/commerce.js';

// Initialize
import '../../scripts/initializers/order.js';

export default async function decorate(block) {
  // The DeliveryTimeLine slot only renders inside the ShippingStatus container's
  // per-shipment accordion, so it never fires for orders with no shipments yet
  // (e.g. status "Pending"). trackingId is an order-level field, so render it
  // directly on the block instead, independent of shipment state.
  events.on('order/data', (orderData) => {
    const trackingId = orderData?.trackingId;
    block.querySelector('.shipping-status-tracking-id')?.remove();
    if (!trackingId) return;
    const el = document.createElement('p');
    el.className = 'shipping-status-tracking-id';
    el.textContent = `Tracking ID: ${trackingId}`;
    block.prepend(el);
  }, { eager: true });

  await orderRenderer.render(ShippingStatus, {
    slots: {
      ShippingStatusCardImage: (ctx) => {
        tryRenderAemAssetsImage(ctx, imageSlotConfig(ctx));
      },
      NotYetShippedProductImage: (ctx) => {
        tryRenderAemAssetsImage(ctx, imageSlotConfig(ctx));
      },
      ShippingStatusReturnCardImage: (ctx) => {
        tryRenderAemAssetsImage(ctx, imageSlotConfig(ctx));
      },
    },
    routeTracking: ({ carrier, number }) => {
      if (carrier?.toLowerCase() === 'ups') {
        return `${UPS_TRACKING_URL}?tracknum=${number}`;
      }
      return '';
    },
    routeProductDetails: (data) => {
      if (data?.orderItem) {
        return getProductLink(data?.orderItem?.productUrlKey, data?.orderItem?.product?.sku);
      }
      if (data?.product) {
        return getProductLink(data?.product?.urlKey, data?.product?.sku);
      }
      return '#';
    },
  })(block);
}

function imageSlotConfig(ctx) {
  const { data, defaultImageProps } = ctx;
  return {
    alias: data.product.sku,
    imageProps: defaultImageProps,

    params: {
      width: defaultImageProps.width,
      height: defaultImageProps.height,
    },
  };
}
