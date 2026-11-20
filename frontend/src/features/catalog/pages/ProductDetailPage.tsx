import { Recommendations } from '../components/Recommendations';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Check,
  ChevronRight,
  Minus,
  PackageCheck,
  Plus,
  ShieldCheck,
  ShoppingCart,
  Truck,
} from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth.js';
import { useAddCartItem } from '../../cart/hooks/useCart.js';
import { formatVnd, getPublicProduct } from '../services/public-catalog-api.js';
import { trackEvent } from '../../../services/tracking-api';
import { ApiError } from '../../../services/api-client.js';
import { ProductReviews } from '../components/ProductReviews.js';

type PendingAdd = { variantId?: string; productId?: string; quantity: number };

export function ProductDetailPage() {
  const { id = '' } = useParams();
  return <ProductDetail key={id} id={id} />;
}

function ProductDetail({ id }: { id: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const addMutation = useAddCartItem();
  const pendingAdd = (location.state as { pendingAdd?: PendingAdd } | null)
    ?.pendingAdd;
  const [quantity, setQuantity] = useState(() =>
    Math.max(1, pendingAdd?.quantity ?? 1),
  );
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [preferredVariantId, setPreferredVariantId] = useState<string | null>(
    () => pendingAdd?.variantId ?? null,
  );
  const [notice, setNotice] = useState(() =>
    pendingAdd
      ? 'You are signed in. Check your selection and confirm to add it to your cart.'
      : '',
  );
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['public-product', id],
    queryFn: () => getPublicProduct(id),
    enabled: Boolean(id),
    retry: false,
  });
  const product = query.data;
  const options = useMemo(() => product?.optionConfig.options ?? [], [product]);
  const matchingVariants = useMemo(
    () =>
      product?.variants.filter((variant) =>
        options.every(
          ({ code }) =>
            !selection[code] || selection[code] === variant.options[code],
        ),
      ) ?? [],
    [options, product, selection],
  );
  const selectedVariant = useMemo(() => {
    if (!product) return undefined;
    if (preferredVariantId) {
      const preferred = product.variants.find(
        (variant) => variant.id === preferredVariantId,
      );
      if (preferred) return preferred;
    }
    if (product.variants.length === 1) return product.variants[0];
    if (options.some(({ code }) => !selection[code])) return undefined;
    return product.variants.find((variant) =>
      options.every(({ code }) => selection[code] === variant.options[code]),
    );
  }, [options, preferredVariantId, product, selection]);
  // Log VIEW when show product successful
  const [trackingReady, setTrackingReady] = useState(false);
  const trackedProductIds = useRef(new Set<string>());

  useEffect(() => {
    if (!product?.id || trackedProductIds.current.has(product.id)) {
      return;
    }

    trackedProductIds.current.add(product.id);

    void trackEvent({
      eventType: 'view',
      productId: product.id,
    }).finally(() => setTrackingReady(true));
  }, [product?.id]);

  const gallery = selectedVariant?.images.length
    ? selectedVariant.images
    : (product?.images ?? []);
  const heroImage =
    gallery.find((image) => image.id === selectedImageId) ??
    gallery.find((image) => image.isPrimary) ??
    gallery[0];
  const addErrorCode = (addMutation.error as { code?: string } | null)?.code;
  const addErrorStatus = (addMutation.error as { status?: number } | null)
    ?.status;

  function chooseOption(code: string, value: string) {
    const preferred = product?.variants.find(
      (variant) => variant.id === preferredVariantId,
    );
    const next = { ...preferred?.options, ...selection, [code]: value };
    for (const option of options) {
      if (option.code === code || !next[option.code]) continue;
      const compatible = product?.variants.some((variant) =>
        options.every(
          ({ code: optionCode }) =>
            !next[optionCode] ||
            next[optionCode] === variant.options[optionCode],
        ),
      );
      if (!compatible) delete next[option.code];
    }
    setPreferredVariantId(null);
    setSelection(next);
    setNotice('');
    if (pendingAdd) navigate(location.pathname, { replace: true, state: null });
  }

  async function addToCart() {
    if (!product) return;
    if (product.variants.length ? !selectedVariant : product.priceVnd === null)
      return;
    const target = selectedVariant
      ? { variantId: selectedVariant.id }
      : { productId: product.id };
    setNotice('');
    if (!user) {
      navigate('/login', {
        state: {
          from: { pathname: `/products/${id}` },
          pendingAdd: { ...target, quantity },
        },
      });
      return;
    }
    try {
      await addMutation.mutateAsync({ ...target, quantity });
      setNotice('Added to your cart.');
      setPreferredVariantId(null);
      if (pendingAdd)
        navigate(location.pathname, { replace: true, state: null });
    } catch {
      // The API error is displayed below; the selection stays available to edit.
    }
  }

  if (query.isPending)
    return (
      <div className="page-container page-section empty-state" role="status">
        Loading product...
      </div>
    );
  if (query.isError || !product)
    return (
      <div className="page-container page-section empty-state" role="alert">
        <h1>
          {query.error instanceof ApiError && query.error.status === 404
            ? 'Product not found'
            : 'Unable to load product'}
        </h1>
        <p>
          {query.error instanceof ApiError && query.error.status === 404
            ? 'This product does not exist or is no longer available.'
            : 'Check your connection and try again.'}
        </p>
        {!(query.error instanceof ApiError && query.error.status === 404) ? (
          <button
            className="button-secondary"
            onClick={() => void query.refetch()}
          >
            Try again
          </button>
        ) : null}
        <Link className="button-primary" to="/products">
          Back to products
        </Link>
      </div>
    );

  return (
    <div className="page-container page-section">
      <div className="breadcrumbs">
        <Link to="/">Home</Link>
        <ChevronRight />
        <Link to="/products">Products</Link>
        <ChevronRight />
        <span>{product.name}</span>
      </div>
      <div className="product-detail-grid">
        <div className="detail-image">
          {heroImage &&
          failedImageUrl !== heroImage.url &&
          heroImage.contentType.startsWith('video/') ? (
            <video
              src={heroImage.url}
              controls
              preload="metadata"
              onError={() => setFailedImageUrl(heroImage.url)}
            />
          ) : heroImage && failedImageUrl !== heroImage.url ? (
            <img
              src={heroImage.url}
              alt={heroImage.altText || product.name}
              onError={() => setFailedImageUrl(heroImage.url)}
            />
          ) : (
            <span className="detail-image-label">No image available</span>
          )}
          {gallery.length > 1 ? (
            <div className="detail-thumbnails">
              {gallery.map((image) => (
                <button
                  type="button"
                  key={image.id}
                  aria-label={`View image of ${image.altText || product.name}`}
                  onClick={() => {
                    setSelectedImageId(image.id);
                    setFailedImageUrl(null);
                  }}
                >
                  {image.contentType.startsWith('video/') ? (
                    <video src={image.url} muted preload="metadata" />
                  ) : (
                    <img src={image.url} alt="" />
                  )}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="detail-copy">
          <span className="product-category">{product.category.name}</span>
          <h1>{product.name}</h1>
          <div className="detail-rating">
            <span>
              {(selectedVariant?.available ??
                (!product.variants.length ? product.available : 0)) > 0
                ? 'In stock'
                : product.variants.length && !selectedVariant
                  ? 'Choose an option'
                  : 'Out of stock'}
            </span>
          </div>
          <div className="detail-price">
            <strong>
              {selectedVariant
                ? formatVnd(selectedVariant.priceVnd)
                : product.variants.length
                  ? (() => {
                      const relevantVariants = Object.keys(selection).length
                        ? matchingVariants
                        : product.variants;
                      const prices = relevantVariants.map((variant) =>
                        BigInt(variant.priceVnd),
                      );
                      const min = prices.reduce(
                        (current, price) => (price < current ? price : current),
                        prices[0] ?? BigInt(product.variants[0].priceVnd),
                      );
                      const max = prices.reduce(
                        (current, price) => (price > current ? price : current),
                        prices[0] ?? min,
                      );
                      if (min === max) return formatVnd(min);
                      return Object.keys(selection).length
                        ? `${formatVnd(min)} – ${formatVnd(max)}`
                        : `From ${formatVnd(min)}`;
                    })()
                  : product.priceVnd === null
                    ? 'Price unavailable'
                    : formatVnd(product.priceVnd)}
            </strong>
          </div>
          <p className="detail-description">{product.description}</p>
          <div className="detail-divider" />
          {pendingAdd &&
          ((pendingAdd.productId &&
            (pendingAdd.productId !== product.id ||
              product.variants.length > 0)) ||
            (pendingAdd.variantId &&
              product.variants.every(
                (variant) => variant.id !== pendingAdd.variantId,
              ))) ? (
            <div className="inline-error" role="alert">
              The selected variant is no longer available. Please choose
              another.
            </div>
          ) : null}
          {product.variants.length
            ? options.map((option) => {
                const values = [
                  ...new Set(
                    product.variants
                      .map((variant) => variant.options[option.code])
                      .filter(Boolean),
                  ),
                ];
                return (
                  <fieldset className="detail-option" key={option.code}>
                    <legend>{option.label}</legend>
                    <div className="option-chip-row">
                      {values.map((value) => {
                        const enabled = product.variants.some(
                          (variant) => variant.options[option.code] === value,
                        );
                        return (
                          <button
                            type="button"
                            key={value}
                            disabled={!enabled}
                            className={`option-chip${selection[option.code] === value ? ' selected' : ''}`}
                            onClick={() => chooseOption(option.code, value)}
                          >
                            {value}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                );
              })
            : null}
          <div className="detail-buy-row">
            <div className="quantity-control">
              <button
                type="button"
                onClick={() =>
                  setQuantity((current) => Math.max(1, current - 1))
                }
                aria-label="Decrease quantity"
              >
                <Minus size={15} />
              </button>
              <span>{quantity}</span>
              <button
                type="button"
                onClick={() =>
                  setQuantity((current) =>
                    Math.min(
                      current + 1,
                      (selectedVariant?.available ?? product.available) ||
                        current + 1,
                    ),
                  )
                }
                aria-label="Increase quantity"
              >
                <Plus size={15} />
              </button>
            </div>
            <button
              className="button-primary add-cart-button"
              disabled={
                (product.variants.length
                  ? !selectedVariant || selectedVariant.available < 1
                  : product.available < 1 || product.priceVnd === null) ||
                addMutation.isPending
              }
              onClick={() => void addToCart()}
            >
              <ShoppingCart size={17} />
              {addMutation.isPending ? 'Adding...' : 'Add to cart'}
            </button>
          </div>
          {addMutation.isError ? (
            <div className="inline-error" role="alert">
              {addErrorCode === 'INSUFFICIENT_STOCK'
                ? 'There is not enough stock. Please reload the product.'
                : addErrorStatus === 0
                  ? 'The result is unknown. Your cart has been refreshed; check it before trying again.'
                  : 'Unable to add to cart. Please try again.'}
            </div>
          ) : null}
          {notice ? (
            <div className="inline-success">
              <Check size={15} />
              {notice} <Link to="/cart">View cart</Link>
            </div>
          ) : null}
          <div className="detail-perks">
            <span>
              <Truck /> Delivery details at checkout
            </span>
            <span>
              <ShieldCheck /> Product options available
            </span>
            <span>
              <PackageCheck /> Items are not reserved in your cart
            </span>
          </div>
        </div>
      </div>
      {trackingReady ? (
        <Recommendations surface="detail" productId={product.id} />
      ) : null}
      <ProductReviews productId={product.id} />
    </div>
  );
}
