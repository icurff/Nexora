import { useMemo, useState } from 'react';
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

type PendingAdd = { variantId?: string; productId?: string; quantity: number };

export function ProductDetailPage() {
  const { id = '' } = useParams();
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
      ? 'Đã đăng nhập. Kiểm tra lựa chọn rồi xác nhận thêm vào giỏ.'
      : '',
  );
  const [imageFailed, setImageFailed] = useState(false);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['public-product', id],
    queryFn: () => getPublicProduct(id),
    enabled: Boolean(id),
    retry: false,
  });
  const product = query.data;
  const options = useMemo(() => product?.optionConfig.options ?? [], [product]);
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
    if (product.variants.length ? !selectedVariant : product.priceVnd === null) return;
    const target = selectedVariant
      ? { variantId: selectedVariant.id }
      : { productId: product.id };
    setNotice('');
    if (user?.role === 'ADMIN') {
      setNotice('Tài khoản quản trị không thể thêm sản phẩm vào giỏ hàng.');
      return;
    }
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
      setNotice('Đã thêm vào giỏ hàng.');
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
        Đang tải sản phẩm...
      </div>
    );
  if (query.isError || !product)
    return (
      <div className="page-container page-section empty-state" role="alert">
        <h1>Không tìm thấy sản phẩm</h1>
        <p>Sản phẩm này không tồn tại hoặc đã ngừng bán.</p>
        <Link className="button-primary" to="/products">
          Quay lại danh sách
        </Link>
      </div>
    );

  return (
    <div className="page-container page-section">
      <div className="breadcrumbs">
        <Link to="/">Trang chủ</Link>
        <ChevronRight />
        <Link to="/products">Sản phẩm</Link>
        <ChevronRight />
        <span>{product.name}</span>
      </div>
      <div className="product-detail-grid">
        <div className="detail-image">
          {heroImage && !imageFailed ? (
            <img
              src={heroImage.url}
              alt={heroImage.altText || product.name}
              onError={() => setImageFailed(true)}
            />
          ) : (
            <span className="detail-image-label">NEXORA</span>
          )}
          {gallery.length > 1 ? (
            <div className="detail-thumbnails">
              {gallery.map((image) => (
                <button
                  type="button"
                  key={image.id}
                  aria-label={`Xem ảnh ${image.altText || product.name}`}
                  onClick={() => {
                    setSelectedImageId(image.id);
                    setImageFailed(false);
                  }}
                >
                  <img src={image.url} alt="" />
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
              {(selectedVariant?.available ?? (!product.variants.length ? product.available : 0)) > 0
                ? 'Còn hàng'
                : product.variants.length && !selectedVariant
                  ? 'Chọn phiên bản'
                  : 'Tạm hết hàng'}
            </span>
          </div>
          <div className="detail-price">
            <strong>
              {selectedVariant
                ? formatVnd(selectedVariant.priceVnd)
                : product.variants.length
                  ? `Từ ${formatVnd(product.variants.reduce((min, v) => (BigInt(v.priceVnd) < min ? BigInt(v.priceVnd) : min), BigInt(product.variants[0].priceVnd)))}`
                  : product.priceVnd === null ? 'Chưa có giá' : formatVnd(product.priceVnd)}
            </strong>
          </div>
          <p className="detail-description">{product.description}</p>
          <div className="detail-divider" />
          {pendingAdd && ((pendingAdd.productId && (pendingAdd.productId !== product.id || product.variants.length > 0)) || (pendingAdd.variantId && product.variants.every((variant) => variant.id !== pendingAdd.variantId)) ) ? (
            <div className="inline-error" role="alert">
              Phiên bản đã chọn không còn bán. Vui lòng chọn lại.
            </div>
          ) : null}
          {product.variants.length ? options.map((option) => {
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
                        className={`option-chip${selectedVariant?.options[option.code] === value ? ' selected' : ''}`}
                        onClick={() => chooseOption(option.code, value)}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            );
          }) : null}
          <div className="detail-buy-row">
            <div className="quantity-control">
              <button
                type="button"
                onClick={() =>
                  setQuantity((current) => Math.max(1, current - 1))
                }
                aria-label="Giảm số lượng"
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
                      (selectedVariant?.available ?? product.available) || current + 1,
                    ),
                  )
                }
                aria-label="Tăng số lượng"
              >
                <Plus size={15} />
              </button>
            </div>
            <button
              className="button-primary add-cart-button"
              disabled={
                (product.variants.length ? !selectedVariant || selectedVariant.available < 1 : product.available < 1 || product.priceVnd === null) ||
                addMutation.isPending
              }
              onClick={() => void addToCart()}
            >
              <ShoppingCart size={17} />
              {addMutation.isPending ? 'Đang thêm...' : 'Thêm vào giỏ'}
            </button>
          </div>
          {addMutation.isError ? (
            <div className="inline-error" role="alert">
              {addErrorCode === 'INSUFFICIENT_STOCK'
                ? 'Số lượng hiện có không đủ. Vui lòng tải lại sản phẩm.'
                : addErrorStatus === 0
                  ? 'Chưa xác định thao tác đã được lưu hay chưa. Giỏ hàng đã được tải lại; hãy kiểm tra giỏ trước khi thử lại.'
                  : 'Không thể thêm vào giỏ. Vui lòng thử lại.'}
            </div>
          ) : null}
          {notice ? (
            <div className="inline-success">
              <Check size={15} />
              {notice} <Link to="/cart">Xem giỏ hàng</Link>
            </div>
          ) : null}
          <div className="detail-perks">
            <span>
              <Truck /> Thông tin giao hàng ở bước sau
            </span>
            <span>
              <ShieldCheck /> Sản phẩm được quản lý theo phiên bản
            </span>
            <span>
              <PackageCheck /> Không giữ hàng khi thêm giỏ
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
