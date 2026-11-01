import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CircleAlert, LoaderCircle, Plus, Save, Trash2 } from 'lucide-react';
import { getAdminCategories, type Category } from '../services/admin-categories-api.js';
import { addAdminImages, addAdminVariant, createAdminProduct, deleteAdminImage, deleteAdminVariant, getAdminProduct, getAdminProducts, productErrorMessage, updateAdminImage, updateAdminProduct, updateAdminVariant, uploadAdminImage, type AdminProduct, type ProductOptionConfig, type VariantInput } from '../services/admin-products-api.js';
import './AdminProductsPage.css';

type VariantDraft = { id?: string; options: Record<string, string>; priceVnd: string; deleted?: boolean };
type ImageDraft = { id?: string; imageAssetId: string; variantId: string; altText: string; sortOrder: string; isPrimary: boolean; contentType: string; url?: string; deleted?: boolean };
const EMPTY_CATEGORIES: Category[] = [];
function tree(items: Category[], parentId: string | null = null, depth = 0): Array<{ item: Category; depth: number }> { return items.filter(item => item.parentId === parentId).flatMap(item => [{ item, depth }, ...tree(items, item.id, depth + 1)]); }
function toDraft(product: AdminProduct): { name: string; description: string; categoryId: string; status: 'ACTIVE' | 'INACTIVE'; optionConfig: ProductOptionConfig; variants: VariantDraft[]; images: ImageDraft[] } {
  return { name: product.name, description: product.description, categoryId: product.categoryId, status: product.status, optionConfig: product.optionConfig, variants: product.variants.map(v => ({ id: v.id, options: v.options, priceVnd: v.priceVnd })), images: product.images.map(i => ({ id: i.id, imageAssetId: i.imageAssetId, variantId: i.variantId ?? '', altText: i.altText, sortOrder: String(i.sortOrder), isPrimary: i.isPrimary, contentType: i.contentType, url: i.url })) };
}

export function AdminProductsPage() {
  const { id } = useParams(); const isNew = id === 'new';
  const [params, setParams] = useSearchParams(); const navigate = useNavigate(); const client = useQueryClient();
  const [name, setName] = useState(''); const [description, setDescription] = useState(''); const [categoryId, setCategoryId] = useState(''); const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE'); const [optionConfig, setOptionConfig] = useState<ProductOptionConfig>({ options: [] });
  const [variants, setVariants] = useState<VariantDraft[]>([]); const [images, setImages] = useState<ImageDraft[]>([]); const [selectedFiles, setSelectedFiles] = useState<File[]>([]); const [uploading, setUploading] = useState(false); const [assetError, setAssetError] = useState(''); const [error, setError] = useState(''); const [success, setSuccess] = useState(''); const [dirty, setDirty] = useState(false);
  const page = Math.max(1, Number(params.get('page') || 1));
  const listQuery = useQuery({ queryKey: ['admin', 'products', params.toString()], queryFn: () => getAdminProducts(new URLSearchParams(params)), enabled: !id, retry: false });
  const productQuery = useQuery({ queryKey: ['admin', 'product', id], queryFn: () => getAdminProduct(id!), enabled: Boolean(id && !isNew), retry: false });
  const categoryQuery = useQuery({ queryKey: ['admin', 'categories'], queryFn: getAdminCategories, retry: false });
  const categories = categoryQuery.data ?? EMPTY_CATEGORIES; const flatCategories = useMemo(() => tree(categories), [categories]);
  const product = productQuery.data;

  // Hydrate the editable form after the product query resolves.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (product && !dirty) { const draft = toDraft(product); setName(draft.name); setDescription(draft.description); setCategoryId(draft.categoryId); setStatus(draft.status); setOptionConfig(draft.optionConfig); setVariants(draft.variants); setImages(draft.images); } }, [product, dirty]);
  useEffect(() => { if (!dirty) return; const listener = (event: BeforeUnloadEvent) => { event.preventDefault(); }; window.addEventListener('beforeunload', listener); return () => window.removeEventListener('beforeunload', listener); }, [dirty]);
  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Nhập tên sản phẩm.');
      if (!description.trim()) throw new Error('Nhập mô tả sản phẩm.');
      if (!categoryId) throw new Error('Chọn danh mục.');
      if (optionConfig.options.length > 5 || optionConfig.options.some(option => !/^[a-z][a-z0-9_]{0,31}$/.test(option.code) || !option.label.trim()) || new Set(optionConfig.options.map(option => option.code)).size !== optionConfig.options.length) throw new Error('Kiểm tra mã và tên các lựa chọn SKU của sản phẩm.');
      const activeVariants = variants.filter(v => !v.deleted);
      if (!activeVariants.length) throw new Error('Thêm ít nhất một SKU.');
      if (activeVariants.some(v => !v.priceVnd || !Number.isSafeInteger(Number(v.priceVnd)) || Number(v.priceVnd) <= 0)) throw new Error('Kiểm tra lại giá của từng SKU.');
      if (!images.some(i => !i.deleted && i.isPrimary && i.contentType.startsWith('image/'))) throw new Error('Chọn một ảnh làm ảnh đại diện sản phẩm.');
      if (isNew) {
        const result = await createAdminProduct({ name: name.trim(), description: description.trim(), categoryId, optionConfig, variants: activeVariants.map(v => ({ options: v.options, priceVnd: Number(v.priceVnd) })), images: images.filter(i => !i.deleted).map(i => ({ imageAssetId: i.imageAssetId.trim(), ...(i.variantId ? { variantId: i.variantId } : {}), altText: i.altText, sortOrder: Number(i.sortOrder), isPrimary: i.isPrimary })) });
        return result;
      }
      await updateAdminProduct(id!, { name: name.trim(), description: description.trim(), categoryId, status });
      const saved = new Set<string>();
      for (const variant of variants) {
        if (variant.deleted && variant.id) { await deleteAdminVariant(variant.id); continue; }
        if (variant.deleted) continue;
        const payload: Partial<VariantInput> = { priceVnd: Number(variant.priceVnd) };
        const result = variant.id ? await updateAdminVariant(variant.id, payload) : await addAdminVariant(id!, { options: variant.options, priceVnd: Number(variant.priceVnd) });
        if (variant.id) saved.add(variant.id); else { const match = result.variants.at(-1); if (match) saved.add(match.id); }
      }
      const added = images.filter(i => !i.deleted && !i.id);
      if (added.length) await addAdminImages(id!, added.map(i => ({ imageAssetId: i.imageAssetId.trim(), ...(i.variantId ? { variantId: i.variantId } : {}), altText: i.altText, sortOrder: Number(i.sortOrder), isPrimary: false })));
      const currentPrimary = images.find(i => !i.deleted && i.isPrimary);
      // Switch the primary image first so an ACTIVE product never temporarily has none.
      if (currentPrimary?.id) await updateAdminImage(id!, currentPrimary.id, { altText: currentPrimary.altText, sortOrder: Number(currentPrimary.sortOrder), isPrimary: true });
      const refreshed = await getAdminProduct(id!);
      const newPrimary = currentPrimary && !currentPrimary.id ? refreshed.images.find(i => i.imageAssetId === currentPrimary.imageAssetId) : undefined;
      if (newPrimary) await updateAdminImage(id!, newPrimary.id, { isPrimary: true });
      for (const image of images) {
        if (image.deleted && image.id) { await deleteAdminImage(id!, image.id); continue; }
        if (image.deleted || !image.id || image.id === currentPrimary?.id) continue;
        await updateAdminImage(id!, image.id, { altText: image.altText, sortOrder: Number(image.sortOrder), isPrimary: false });
      }
      return getAdminProduct(id!);
    },
    onSuccess: async result => { setDirty(false); setError(''); setSuccess('Đã lưu sản phẩm.'); await Promise.all([client.invalidateQueries({ queryKey: ['admin', 'products'] }), client.invalidateQueries({ queryKey: ['admin', 'product', id] })]); if (isNew) navigate(`/admin/products/${result.id}/edit`, { replace: true }); },
    onError: e => { setError(e instanceof Error && !(e as { status?: number }).status ? e.message : productErrorMessage(e)); setSuccess(''); },
  });

  if (!id) {
    const category = params.get('categoryId') ?? ''; const filterStatus = params.get('status') ?? '';
    return <section className="admin-products-page"><div className="admin-products-heading"><div><span className="admin-products-kicker">CATALOG / PRODUCTS</span><h1>Sản phẩm</h1><p>Tìm kiếm, lọc và quản lý sản phẩm cùng các SKU.</p></div><Link className="admin-products-primary" to="/admin/products/new"><Plus size={17}/> Tạo sản phẩm</Link></div>
      <form className="admin-products-filters" onSubmit={event => { event.preventDefault(); const next = new URLSearchParams(params); const searchText = String(new FormData(event.currentTarget).get('q') ?? '').trim(); next.set('page', '1'); if (searchText) next.set('q', searchText); else next.delete('q'); setParams(next); }}>
        <label>Tìm tên sản phẩm<input defaultValue={params.get('q') ?? ''} key={params.get('q') ?? ''} name="q" placeholder="Tên sản phẩm" /></label>
        <label>Danh mục<select value={category} onChange={e => { const next = new URLSearchParams(params); if (e.target.value) next.set('categoryId', e.target.value); else next.delete('categoryId'); next.set('page', '1'); setParams(next); }}><option value="">Tất cả danh mục</option>{flatCategories.map(({ item, depth }) => <option key={item.id} value={item.id}>{'　'.repeat(depth)}{item.name}</option>)}</select></label>
        <label>Trạng thái<select value={filterStatus} onChange={e => { const next = new URLSearchParams(params); if (e.target.value) next.set('status', e.target.value); else next.delete('status'); next.set('page', '1'); setParams(next); }}><option value="">Tất cả</option><option value="ACTIVE">Đang bán</option><option value="INACTIVE">Ngừng bán</option></select></label><button className="admin-products-secondary">Tìm kiếm</button>
      </form>
      {listQuery.isLoading ? <div className="admin-products-state"><LoaderCircle className="spin"/> Đang tải sản phẩm…</div> : listQuery.isError ? <div className="admin-products-state error"><CircleAlert/> {productErrorMessage(listQuery.error)} <button onClick={() => void listQuery.refetch()}>Thử lại</button></div> : <>
        <div className="admin-products-table-wrap"><table className="admin-products-table"><thead><tr><th>Sản phẩm</th><th>Danh mục</th><th>SKU</th><th>Giá từ</th><th>Trạng thái</th><th></th></tr></thead><tbody>{listQuery.data?.items.map(item => <tr key={item.id}><td><Link to={`/admin/products/${item.id}/edit`}><strong>{item.name}</strong><small>{item.description.slice(0, 90)}</small></Link></td><td>{item.category.name}</td><td>{item.variants.length}</td><td>{new Intl.NumberFormat('vi-VN').format(Math.min(...item.variants.map(v => Number(v.priceVnd)) || [0]))} ₫</td><td><span className={`product-status ${item.status.toLowerCase()}`}>{item.status === 'ACTIVE' ? 'Đang bán' : 'Ngừng bán'}</span></td><td><Link className="admin-products-edit" to={`/admin/products/${item.id}/edit`}>Sửa</Link></td></tr>)}</tbody></table>{!listQuery.data?.items.length ? <div className="admin-products-state">Chưa có sản phẩm phù hợp.</div> : null}</div>
        <div className="admin-products-pagination"><span>{listQuery.data?.total ?? 0} sản phẩm · Trang {page} / {Math.max(1, listQuery.data?.totalPages ?? 1)}</span><div><button disabled={page <= 1} onClick={() => { const next = new URLSearchParams(params); next.set('page', String(page - 1)); setParams(next); }}>Trước</button><button disabled={page >= (listQuery.data?.totalPages ?? 1)} onClick={() => { const next = new URLSearchParams(params); next.set('page', String(page + 1)); setParams(next); }}>Sau</button></div></div>
      </>}</section>;
  }

  if (!isNew && (productQuery.isLoading || categoryQuery.isLoading)) return <div className="admin-products-state"><LoaderCircle className="spin"/> Đang tải biểu mẫu…</div>;
  if (!isNew && productQuery.isError) return <div className="admin-products-state error">{productErrorMessage(productQuery.error)} <Link to="/admin/products">Quay lại danh sách</Link></div>;
  const updateVariant = (index: number, patch: Partial<VariantDraft>) => { setVariants(current => current.map((v, i) => i === index ? { ...v, ...patch } : v)); setDirty(true); };
  const addVariantRow = () => { setVariants(current => [...current, { options: Object.fromEntries(optionConfig.options.map(o => [o.code, ''])), priceVnd: '' }]); setDirty(true); };
  const updateProductOption = (index: number, field: 'code' | 'label', value: string) => {
    const previousCode = optionConfig.options[index]?.code;
    const nextOptions = optionConfig.options.map((option, optionIndex) => optionIndex === index ? { ...option, [field]: value } : option);
    setOptionConfig({ options: nextOptions });
    if (field === 'code' && previousCode !== undefined && previousCode !== value) setVariants(current => current.map(variant => {
      const options = { ...variant.options };
      const previousValue = options[previousCode];
      delete options[previousCode];
      if (value) options[value] = previousValue ?? '';
      else options[''] = previousValue ?? '';
      return { ...variant, options };
    }));
    setDirty(true);
  };
  const addProductOption = () => { if (optionConfig.options.length >= 5) return; setOptionConfig(current => ({ options: [...current.options, { code: '', label: '' }] })); setVariants(current => current.map(variant => ({ ...variant, options: { ...variant.options, '': '' } }))); setDirty(true); };
  const removeProductOption = (index: number) => {
    const code = optionConfig.options[index]?.code;
    setOptionConfig(current => ({ options: current.options.filter((_, optionIndex) => optionIndex !== index) }));
    if (code) setVariants(current => current.map(variant => { const options = { ...variant.options }; delete options[code]; return { ...variant, options }; }));
    else setVariants(current => current.map(variant => { const options = { ...variant.options }; delete options['']; return { ...variant, options }; }));
    setDirty(true);
  };
  const uploadSelectedImages = async () => {
    if (!selectedFiles.length) { setAssetError('Chọn một hoặc nhiều ảnh/video trước khi tải lên.'); return; }
    setUploading(true); setAssetError('');
    const uploaded: ImageDraft[] = []; const failed: File[] = [];
    for (const file of selectedFiles) {
      try {
        const asset = await uploadAdminImage(file);
        uploaded.push({ imageAssetId: asset.imageAssetId, variantId: '', altText: '', sortOrder: '', isPrimary: false, contentType: asset.contentType, url: asset.url });
      } catch (uploadError) { failed.push(file); setAssetError(`${file.name}: ${productErrorMessage(uploadError)}`); }
    }
    if (uploaded.length) {
      setImages(current => {
        let needsPrimary = !current.some(image => !image.deleted && image.isPrimary);
        return [...current, ...uploaded.map((image, index) => {
          const isPrimary = needsPrimary && image.contentType.startsWith('image/');
          if (isPrimary) needsPrimary = false;
          return { ...image, sortOrder: String(current.length + index), isPrimary };
        })];
      });
      setDirty(true);
    }
    setSelectedFiles(failed);
    if (!failed.length) setAssetError('');
    setUploading(false);
  };
  return <section className="admin-products-page"><div className="admin-products-heading"><div><Link className="admin-products-back" to="/admin/products"><ArrowLeft size={15}/> Danh sách sản phẩm</Link><span className="admin-products-kicker">CATALOG / PRODUCTS</span><h1>{isNew ? 'Tạo sản phẩm' : 'Sửa sản phẩm'}</h1><p>Sản phẩm được tạo ACTIVE khi nội dung, SKU và ảnh đại diện đã đầy đủ.</p></div>{!isNew ? <span className={`product-status ${status.toLowerCase()}`}>{status === 'ACTIVE' ? 'Đang bán' : 'Ngừng bán'}</span> : null}</div>
    {(error || success) ? <div className={`admin-products-notice ${error ? 'error' : 'success'}`} role="status">{error || success}</div> : null}
    <form className="admin-product-form" onSubmit={(event: FormEvent) => { event.preventDefault(); setError(''); setSuccess(''); void save.mutateAsync(); }}>
      <section className="admin-product-panel"><h2>Nội dung sản phẩm</h2><div className="admin-product-grid"><label className="wide">Tên sản phẩm<input required maxLength={200} value={name} onChange={e => { setName(e.target.value); setDirty(true); }} /></label><label>Danh mục<select required value={categoryId} onChange={e => { setCategoryId(e.target.value); setDirty(true); }}><option value="">Chọn danh mục</option>{flatCategories.map(({ item, depth }) => <option key={item.id} value={item.id}>{'　'.repeat(depth)}{item.name}</option>)}</select></label><label>Mô tả<textarea required maxLength={10000} rows={5} value={description} onChange={e => { setDescription(e.target.value); setDirty(true); }} /></label>{!isNew ? <label>Trạng thái<select value={status} onChange={e => { setStatus(e.target.value as 'ACTIVE' | 'INACTIVE'); setDirty(true); }}><option value="ACTIVE">Đang bán</option><option value="INACTIVE">Ngừng bán</option></select></label> : null}</div></section>
      <section className="admin-product-panel"><div className="admin-product-section-heading"><div><h2>Lựa chọn SKU của sản phẩm</h2><p>Mỗi sản phẩm tự khai báo lựa chọn riêng, ví dụ quần áo có màu sắc và kích cỡ. Danh mục không áp đặt lựa chọn.</p></div>{isNew ? <button type="button" className="admin-products-secondary" disabled={optionConfig.options.length >= 5} onClick={addProductOption}><Plus size={15}/> Thêm lựa chọn</button> : null}</div>{isNew ? optionConfig.options.map((option, index) => <div className="admin-option-row" key={`product-option-${index}`}><label>Mã lựa chọn<input value={option.code} onChange={event => updateProductOption(index, 'code', event.target.value)} placeholder="color" /></label><label>Tên hiển thị<input value={option.label} onChange={event => updateProductOption(index, 'label', event.target.value)} placeholder="Màu sắc" /></label><button type="button" className="admin-image-remove" onClick={() => removeProductOption(index)} aria-label="Xóa lựa chọn"><Trash2 size={16}/></button></div>) : <div className="admin-product-option-summary">{optionConfig.options.length ? optionConfig.options.map(option => <span key={option.code}>{option.label} <code>{option.code}</code></span>) : <span>Sản phẩm không có lựa chọn biến thể.</span>}<small>Cấu hình này cố định sau khi tạo sản phẩm.</small></div>}</section>
      <section className="admin-product-panel"><div className="admin-product-section-heading"><div><h2>SKU</h2><p>Mã SKU được hệ thống sinh. Mỗi SKU quản lý lựa chọn và giá riêng.</p></div><button type="button" className="admin-products-secondary" disabled={!categoryId} onClick={addVariantRow}><Plus size={15}/> Thêm SKU</button></div>
        {variants.map((variant, index) => variant.deleted ? null : <div className="admin-variant-row" key={variant.id ?? `new-${index}`}><div className="admin-variant-head"><strong>{variant.id ? product?.variants.find(v => v.id === variant.id)?.sku : `SKU mới ${index + 1}`}</strong><span className="admin-variant-actions">{variant.id ? <Link to={`/admin/inventory?productId=${id}&skuId=${variant.id}`}>Quản lý tồn</Link> : null}<button type="button" title="Xóa SKU" onClick={() => { updateVariant(index, { deleted: true }); }}><Trash2 size={16}/><span>Xóa SKU</span></button></span></div><div className="admin-variant-fields">{optionConfig.options.map(option => <label key={option.code}>{option.label}<input value={variant.options[option.code] ?? ''} readOnly={Boolean(variant.id)} onChange={e => updateVariant(index, { options: { ...variant.options, [option.code]: e.target.value } })} placeholder={option.label} /></label>)}{variant.id ? <small className="wide">Mã lựa chọn của SKU được cố định sau khi tạo. Nếu khai báo sai, xóa SKU này và thêm SKU mới.</small> : null}<label>Giá (VND)<input type="number" min="1" step="1" value={variant.priceVnd} onChange={e => updateVariant(index, { priceVnd: e.target.value })}/></label></div></div>)}
        {!variants.some(v => !v.deleted) ? <p className="admin-products-empty">Chưa có SKU. Thêm ít nhất một SKU để tạo sản phẩm.</p> : null}
      </section>
      <section className="admin-product-panel"><div className="admin-product-section-heading"><div><h2>Ảnh và video sản phẩm</h2><p>Chọn nhiều tệp cùng lúc. Ảnh JPEG/PNG/WebP tối đa 5 MiB; video MP4/WebM/MOV tối đa 50 MB mỗi tệp. Sản phẩm cần một ảnh đại diện.</p></div></div><div className="admin-product-upload"><label>Chọn ảnh/video<input type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,.mov" onChange={event => { setSelectedFiles(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ''; setAssetError(''); }}/></label><button type="button" className="admin-products-secondary" disabled={!selectedFiles.length || uploading} onClick={() => void uploadSelectedImages()}>{uploading ? <LoaderCircle className="spin" size={15}/> : <Plus size={15}/>} {uploading ? 'Đang tải lên…' : `Tải lên ${selectedFiles.length || ''} tệp`}</button></div>{selectedFiles.length ? <small className="admin-upload-filename">{selectedFiles.map(file => `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`).join(' · ')}</small> : null}{assetError ? <small className="admin-field-error">{assetError}</small> : null}
        {images.map((image, index) => image.deleted ? null : <div className="admin-image-row" key={image.id ?? `asset-${index}`}><div className="admin-image-preview">{image.url ? image.contentType.startsWith('video/') ? <video src={image.url} controls preload="metadata"/> : <img src={image.url} alt=""/> : <span>Đang xử lý media</span>}</div><div className="admin-image-fields"><label>Loại media<input readOnly value={image.contentType.startsWith('video/') ? 'Video' : 'Ảnh'} /></label><label>Thứ tự<input type="number" min="0" value={image.sortOrder} onChange={e => { setImages(current => current.map((v, i) => i === index ? { ...v, sortOrder: e.target.value } : v)); setDirty(true); }}/></label>{image.contentType.startsWith('image/') ? <label className="admin-image-primary"><input type="radio" name="primaryImage" checked={image.isPrimary} onChange={() => { setImages(current => current.map((v, i) => ({ ...v, isPrimary: i === index }))); setDirty(true); }}/> Ảnh đại diện</label> : <small>Video</small>}</div><button type="button" className="admin-image-remove" onClick={() => { setImages(current => current.map((v, i) => i === index ? { ...v, deleted: true, isPrimary: false } : v)); if (image.isPrimary) { const remaining = images.findIndex((v, i) => i !== index && !v.deleted && v.contentType.startsWith('image/')); if (remaining >= 0) setImages(current => current.map((v, i) => i === remaining ? { ...v, isPrimary: true } : v)); } setDirty(true); }} aria-label="Gỡ media"><Trash2 size={16}/></button></div>)}
      </section>
      <div className="admin-product-actions"><Link className="admin-products-secondary" to="/admin/products">Hủy</Link><button type="submit" className="admin-products-primary" disabled={save.isPending}><Save size={16}/>{save.isPending ? 'Đang lưu…' : isNew ? 'Tạo sản phẩm' : 'Lưu thay đổi'}</button></div>
    </form>
  </section>;
}
