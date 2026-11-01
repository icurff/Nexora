import {
  useId,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { House, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAddresses } from '../hooks/useAddresses';
import { useAddressMutations } from '../hooks/useAddresses';
import type { UserAddress } from '../services/address-api';
import { Notice } from '../../auth/components/Notice';

const LOCATION_URL =
  'https://raw.githubusercontent.com/thanglequoc/vietnamese-provinces-database/master/json/vn_only_simplified_json_generated_data_vn_units.json';
type Ward = { Code: string; FullName: string; ProvinceCode: string };
type Province = { Code: string; FullName: string; Wards: Ward[] };
type LocationOption = { code: string; label: string };
type AddressForm = {
  recipientName: string;
  recipientPhone: string;
  provinceName: string;
  wardName: string;
  addressLine: string;
  isDefault: boolean;
};

const emptyForm: AddressForm = {
  recipientName: '',
  recipientPhone: '',
  provinceName: '',
  wardName: '',
  addressLine: '',
  isDefault: false,
};

function normalize(value: string) {
  return value
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

async function getProvinces(signal: AbortSignal): Promise<Province[]> {
  const response = await fetch(LOCATION_URL, { signal, credentials: 'omit' });
  if (!response.ok) throw new Error('Chưa tải được danh sách địa giới.');
  const value: unknown = await response.json();
  const isProvince = (item: unknown): item is Province => {
    if (!item || typeof item !== 'object') return false;
    const province = item as Partial<Province>;
    return (
      typeof province.Code === 'string' &&
      typeof province.FullName === 'string' &&
      Array.isArray(province.Wards) &&
      province.Wards.every((value: unknown) => {
        if (!value || typeof value !== 'object') return false;
        const ward = value as Partial<Ward>;
        return (
          typeof ward.Code === 'string' &&
          typeof ward.FullName === 'string' &&
          ward.ProvinceCode === province.Code
        );
      })
    );
  };
  if (!Array.isArray(value) || !value.every(isProvince))
    throw new Error('Dữ liệu địa giới từ nguồn không đúng định dạng.');
  return value as Province[];
}

function LocationSelect({
  value,
  options,
  placeholder,
  disabled = false,
  onChange,
}: {
  value: string;
  options: LocationOption[];
  placeholder: string;
  disabled?: boolean;
  onChange: (code: string) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(0);
  const selected = options.find((option) => option.code === value);
  const matches = useMemo(() => {
    const query = normalize(search.trim());
    return query
      ? options.filter((option) => normalize(option.label).includes(query))
      : options;
  }, [options, search]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(index + 1, matches.length - 1));
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    }
    if (event.key === 'Enter' && open && matches[active]) {
      event.preventDefault();
      onChange(matches[active].code);
      setSearch('');
      setOpen(false);
    }
    if (event.key === 'Escape') {
      setSearch('');
      setOpen(false);
    }
  }

  return (
    <div className="location-select">
      <input
        role="combobox"
        aria-label={placeholder}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={
          open && matches[active]
            ? `${listId}-${matches[active].code}`
            : undefined
        }
        disabled={disabled}
        placeholder={disabled ? 'Chọn tỉnh/thành trước' : placeholder}
        value={open ? search : (selected?.label ?? '')}
        onFocus={() => {
          setSearch('');
          setOpen(true);
        }}
        onChange={(event) => {
          setSearch(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {open && !disabled ? (
        <ul id={listId} role="listbox" className="location-options">
          {matches.length ? (
            matches.map((option, index) => (
              <li
                id={`${listId}-${option.code}`}
                role="option"
                aria-selected={option.code === value}
                key={option.code}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => {
                  onChange(option.code);
                  setSearch('');
                  setOpen(false);
                }}
                className={active === index ? 'active' : ''}
              >
                {option.label}
              </li>
            ))
          ) : (
            <li className="location-empty">Không tìm thấy kết quả</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}

function AddressEditor({
  address,
  provinces,
  loadingLocations,
  locationError,
  retryLocations,
  onCancel,
  onSave,
  saving,
}: {
  address: UserAddress | null;
  provinces: Province[];
  loadingLocations: boolean;
  locationError: string;
  retryLocations: () => void;
  onCancel: () => void;
  onSave: (form: AddressForm) => Promise<void>;
  saving: boolean;
}) {
  const [form, setForm] = useState<AddressForm>(() =>
    address
      ? {
          recipientName: address.recipientName,
          recipientPhone: address.recipientPhone,
          provinceName: address.provinceName,
          wardName: address.wardName,
          addressLine: address.addressLine,
          isDefault: address.isDefault,
        }
      : emptyForm,
  );
  const [formError, setFormError] = useState('');
  const [provinceCode, setProvinceCode] = useState(
    () =>
      provinces.find((item) => item.FullName === address?.provinceName)?.Code ??
      '',
  );
  const provinceOptions = useMemo(
    () =>
      provinces.map(({ Code, FullName }) => ({ code: Code, label: FullName })),
    [provinces],
  );
  const wardOptions = useMemo(
    () =>
      (provinces.find(({ Code }) => Code === provinceCode)?.Wards ?? []).map(
        ({ Code, FullName }) => ({ code: Code, label: FullName }),
      ),
    [provinces, provinceCode],
  );
  const wardCode =
    wardOptions.find(({ label }) => label === form.wardName)?.code ?? '';
  const locationMismatch = Boolean(
    address &&
    !loadingLocations &&
    !locationError &&
    (!provinceCode || !wardCode),
  );

  function set<K extends keyof AddressForm>(key: K, value: AddressForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    if (locationError || loadingLocations) {
      setFormError('Tải xong danh sách tỉnh và xã trước khi lưu.');
      return;
    }
    if (!provinceCode || !wardCode) {
      setFormError('Hãy chọn tỉnh/thành và xã/phường/đặc khu từ danh sách.');
      return;
    }
    try {
      await onSave(form);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'Chưa lưu được địa chỉ. Vui lòng thử lại.',
      );
    }
  }

  return (
    <form className="address-add-form" onSubmit={(event) => void submit(event)}>
      <h3>{address ? 'Sửa địa chỉ' : 'Thêm địa chỉ mới'}</h3>
      {locationError ? (
        <Notice>
          {locationError}{' '}
          <button type="button" onClick={retryLocations}>
            Thử lại
          </button>
        </Notice>
      ) : null}
      {loadingLocations ? (
        <p role="status" className="address-loading">
          Đang tải danh sách tỉnh và xã…
        </p>
      ) : null}
      {locationMismatch ? (
        <Notice>
          Địa giới đã lưu không còn trong danh sách. Hãy chọn lại tỉnh và xã.
        </Notice>
      ) : null}
      <label>
        Người nhận
        <input
          required
          maxLength={100}
          autoComplete="name"
          value={form.recipientName}
          onChange={(event) => set('recipientName', event.target.value)}
        />
      </label>
      <label>
        Số điện thoại
        <input
          required
          maxLength={16}
          type="tel"
          autoComplete="tel"
          value={form.recipientPhone}
          onChange={(event) => set('recipientPhone', event.target.value)}
        />
      </label>
      <label>
        Tỉnh/thành phố
        <LocationSelect
          value={provinceCode}
          options={provinceOptions}
          placeholder="Tìm tỉnh/thành phố"
          disabled={loadingLocations || Boolean(locationError)}
          onChange={(code) => {
            setProvinceCode(code);
            set(
              'provinceName',
              provinces.find(({ Code }) => Code === code)?.FullName ?? '',
            );
            set('wardName', '');
          }}
        />
      </label>
      <label>
        Xã/phường/đặc khu
        <LocationSelect
          value={wardCode}
          options={wardOptions}
          placeholder="Tìm xã/phường/đặc khu"
          disabled={!provinceCode || loadingLocations || Boolean(locationError)}
          onChange={(code) =>
            set(
              'wardName',
              wardOptions.find((ward) => ward.code === code)?.label ?? '',
            )
          }
        />
      </label>
      <label>
        Địa chỉ chi tiết
        <input
          required
          maxLength={300}
          autoComplete="street-address"
          placeholder="Số nhà, tên đường, thôn, căn hộ…"
          value={form.addressLine}
          onChange={(event) => set('addressLine', event.target.value)}
        />
      </label>
      <label className="address-default-check">
        <input
          type="checkbox"
          checked={form.isDefault}
          onChange={(event) => set('isDefault', event.target.checked)}
        />{' '}
        Đặt làm địa chỉ mặc định
      </label>
      {formError ? (
        <p role="alert" className="address-form-error">
          {formError}
        </p>
      ) : null}
      <div>
        <button type="button" className="button-secondary" onClick={onCancel}>
          Hủy
        </button>
        <button
          className="button-primary"
          disabled={saving || loadingLocations || Boolean(locationError)}
        >
          {saving ? 'Đang lưu…' : 'Lưu địa chỉ'}
        </button>
      </div>
    </form>
  );
}

export function AddressBook() {
  const addressesQuery = useAddresses();
  const mutations = useAddressMutations();
  const [editing, setEditing] = useState<UserAddress | null | undefined>(
    undefined,
  );
  const locations = useQuery({
    queryKey: ['locations', 'vn-only-units'],
    queryFn: ({ signal }) => getProvinces(signal),
    enabled: editing !== undefined,
    staleTime: Infinity,
  });
  const [pageError, setPageError] = useState('');
  const addresses = addressesQuery.data ?? [];

  async function save(form: AddressForm) {
    const input = { ...form };
    if (editing) await mutations.update.mutateAsync({ id: editing.id, input });
    else await mutations.create.mutateAsync(input);
    setEditing(undefined);
    setPageError('');
  }

  async function remove(address: UserAddress) {
    if (!window.confirm(`Xóa địa chỉ của ${address.recipientName}?`)) return;
    setPageError('');
    try {
      await mutations.remove.mutateAsync(address.id);
    } catch {
      setPageError('Chưa xóa được địa chỉ. Vui lòng thử lại.');
    }
  }

  async function setDefault(address: UserAddress) {
    setPageError('');
    try {
      await mutations.setDefault.mutateAsync(address.id);
    } catch {
      setPageError('Chưa đổi được địa chỉ mặc định. Vui lòng thử lại.');
    }
  }

  return (
    <div className="account-panel">
      <div className="account-panel-title">
        <div>
          <span className="section-eyebrow">GIAO HÀNG NHANH HƠN</span>
          <h2>Sổ địa chỉ</h2>
          <p>Quản lý địa chỉ nhận hàng của bạn.</p>
        </div>
        {editing === undefined ? (
          <button className="button-primary" onClick={() => setEditing(null)}>
            <Plus size={15} /> Thêm địa chỉ
          </button>
        ) : null}
      </div>
      {pageError ? <Notice>{pageError}</Notice> : null}
      {editing !== undefined ? (
        <AddressEditor
          key={`${editing?.id ?? 'new'}-${locations.data ? 'ready' : 'loading'}`}
          address={editing}
          provinces={locations.data ?? []}
          loadingLocations={locations.isFetching}
          locationError={
            locations.isError
              ? 'Chưa tải được danh sách địa giới từ GitHub.'
              : ''
          }
          retryLocations={() => void locations.refetch()}
          onCancel={() => setEditing(undefined)}
          onSave={save}
          saving={mutations.create.isPending || mutations.update.isPending}
        />
      ) : null}
      {addressesQuery.isLoading ? (
        <p role="status" className="address-loading">
          Đang tải sổ địa chỉ…
        </p>
      ) : null}
      {addressesQuery.isError ? (
        <Notice>
          Chưa tải được sổ địa chỉ.{' '}
          <button onClick={() => void addressesQuery.refetch()}>Thử lại</button>
        </Notice>
      ) : null}
      {!addressesQuery.isLoading &&
      addressesQuery.isSuccess &&
      addresses.length === 0 &&
      editing === undefined ? (
        <div className="address-empty">
          <MapPin />
          <p>Bạn chưa lưu địa chỉ nhận hàng.</p>
          <button className="button-primary" onClick={() => setEditing(null)}>
            <Plus size={15} /> Thêm địa chỉ
          </button>
        </div>
      ) : null}
      {addresses.length ? (
        <div className="saved-address-grid">
          {addresses.map((address) => (
            <article
              className={`saved-address-card${address.isDefault ? ' primary' : ''}`}
              key={address.id}
            >
              <div className="saved-address-top">
                <span>
                  {address.isDefault ? (
                    <House size={16} />
                  ) : (
                    <MapPin size={16} />
                  )}{' '}
                  {address.isDefault ? 'Địa chỉ nhận hàng' : 'Địa chỉ khác'}
                </span>
                {address.isDefault ? <em>MẶC ĐỊNH</em> : null}
              </div>
              <strong>{address.recipientName}</strong>
              <p>
                {address.recipientPhone}
                <br />
                {address.addressLine}
                <br />
                {address.wardName}, {address.provinceName}
              </p>
              <div>
                <button
                  onClick={() => {
                    setPageError('');
                    setEditing(address);
                  }}
                >
                  <Pencil size={13} /> Sửa
                </button>
                <button
                  disabled={mutations.remove.isPending}
                  onClick={() => void remove(address)}
                >
                  <Trash2 size={13} /> Xóa
                </button>
                {!address.isDefault ? (
                  <button
                    disabled={mutations.setDefault.isPending}
                    onClick={() => void setDefault(address)}
                  >
                    Đặt mặc định
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CheckoutAddressPicker() {
  const query = useAddresses();
  const addresses = query.data ?? [];
  const [selected, setSelected] = useState('');
  const selectedId =
    selected && addresses.some(({ id }) => id === selected)
      ? selected
      : (addresses.find(({ isDefault }) => isDefault)?.id ??
        addresses[0]?.id ??
        '');

  return (
    <section className="checkout-panel">
      <div className="panel-heading">
        <span className="checkout-number">1</span>
        <div>
          <h2>Địa chỉ nhận hàng</h2>
          <p>Chọn địa chỉ bạn muốn dùng cho đơn hàng.</p>
        </div>
        <Link className="text-link" to="/account?section=addresses">
          Quản lý
        </Link>
      </div>
      {query.isLoading ? <p role="status">Đang tải địa chỉ…</p> : null}
      {query.isError ? (
        <p role="alert">
          Chưa tải được địa chỉ.{' '}
          <button onClick={() => void query.refetch()}>Thử lại</button>
        </p>
      ) : null}
      {query.isSuccess && addresses.length === 0 ? (
        <div className="checkout-no-address">
          <p>Bạn chưa lưu địa chỉ nhận hàng.</p>
          <Link className="button-secondary" to="/account?section=addresses">
            Thêm địa chỉ
          </Link>
        </div>
      ) : null}
      {addresses.map((address) => (
        <label
          className={`address-option${selectedId === address.id ? ' selected' : ''}`}
          key={address.id}
        >
          <input
            type="radio"
            name="checkout-address"
            value={address.id}
            checked={selectedId === address.id}
            onChange={() => setSelected(address.id)}
          />
          <span className="address-radio" />
          <span className="address-copy">
            <strong>
              {address.recipientName} · {address.recipientPhone}
              {address.isDefault ? <em>Mặc định</em> : null}
            </strong>
            <small>
              {address.addressLine}, {address.wardName}, {address.provinceName}
            </small>
          </span>
        </label>
      ))}
    </section>
  );
}
