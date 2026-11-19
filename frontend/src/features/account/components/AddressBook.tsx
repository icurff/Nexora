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
  if (!response.ok) throw new Error('Unable to load locations.');
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
    throw new Error('Location data is in an invalid format.');
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
        placeholder={disabled ? 'Select a province or city first' : placeholder}
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
            <li className="location-empty">No results found</li>
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
      setFormError('Wait for provinces and wards to load before saving.');
      return;
    }
    if (!provinceCode || !wardCode) {
      setFormError('Select a province or city and a ward from the lists.');
      return;
    }
    try {
      await onSave(form);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'Unable to save the address. Please try again.',
      );
    }
  }

  return (
    <form className="address-add-form" onSubmit={(event) => void submit(event)}>
      <h3>{address ? 'Edit address' : 'Add a new address'}</h3>
      {locationError ? (
        <Notice>
          {locationError}{' '}
          <button type="button" onClick={retryLocations}>
            Try again
          </button>
        </Notice>
      ) : null}
      {loadingLocations ? (
        <p role="status" className="address-loading">
          Loading provinces and wards…
        </p>
      ) : null}
      {locationMismatch ? (
        <Notice>
          The saved location is no longer available. Please select it again.
        </Notice>
      ) : null}
      <label>
        Recipient
        <input
          required
          maxLength={100}
          autoComplete="name"
          value={form.recipientName}
          onChange={(event) => set('recipientName', event.target.value)}
        />
      </label>
      <label>
        Phone number
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
        Province or city
        <LocationSelect
          value={provinceCode}
          options={provinceOptions}
          placeholder="Search provinces or cities"
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
        Ward or commune
        <LocationSelect
          value={wardCode}
          options={wardOptions}
          placeholder="Search wards or communes"
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
        Street address
        <input
          required
          maxLength={300}
          autoComplete="street-address"
          placeholder="House number, street, apartment…"
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
        Set as default address
      </label>
      {formError ? (
        <p role="alert" className="address-form-error">
          {formError}
        </p>
      ) : null}
      <div>
        <button type="button" className="button-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="button-primary"
          disabled={saving || loadingLocations || Boolean(locationError)}
        >
          {saving ? 'Saving…' : 'Save address'}
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
    if (!window.confirm(`Delete address for ${address.recipientName}?`)) return;
    setPageError('');
    try {
      await mutations.remove.mutateAsync(address.id);
    } catch {
      setPageError('Unable to delete the address. Please try again.');
    }
  }

  async function setDefault(address: UserAddress) {
    setPageError('');
    try {
      await mutations.setDefault.mutateAsync(address.id);
    } catch {
      setPageError('Unable to change the default address. Please try again.');
    }
  }

  return (
    <div className="account-panel">
      <div className="account-panel-title">
        <div>
          <span className="section-eyebrow">FASTER CHECKOUT</span>
          <h2>Address book</h2>
          <p>Manage your delivery addresses.</p>
        </div>
        {editing === undefined ? (
          <button className="button-primary" onClick={() => setEditing(null)}>
            <Plus size={15} /> Add address
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
              ? 'Unable to load locations from GitHub.'
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
          Loading address book…
        </p>
      ) : null}
      {addressesQuery.isError ? (
        <Notice>
          Unable to load the address book.{' '}
          <button onClick={() => void addressesQuery.refetch()}>Try again</button>
        </Notice>
      ) : null}
      {!addressesQuery.isLoading &&
      addressesQuery.isSuccess &&
      addresses.length === 0 &&
      editing === undefined ? (
        <div className="address-empty">
          <MapPin />
          <p>You have no saved delivery addresses.</p>
          <button className="button-primary" onClick={() => setEditing(null)}>
            <Plus size={15} /> Add address
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
                  {address.isDefault ? 'Delivery address' : 'Other address'}
                </span>
                {address.isDefault ? <em>DEFAULT</em> : null}
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
                  <Pencil size={13} /> Edit
                </button>
                <button
                  disabled={mutations.remove.isPending}
                  onClick={() => void remove(address)}
                >
                  <Trash2 size={13} /> Delete
                </button>
                {!address.isDefault ? (
                  <button
                    disabled={mutations.setDefault.isPending}
                    onClick={() => void setDefault(address)}
                  >
                    Set as default
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

export function CheckoutAddressPicker({
  value,
  onChange,
}: { value?: string; onChange?: (id: string) => void } = {}) {
  const query = useAddresses();
  const addresses = query.data ?? [];
  const [selected, setSelected] = useState('');
  const selectedId =
    value ??
    (selected && addresses.some(({ id }) => id === selected)
      ? selected
      : (addresses.find(({ isDefault }) => isDefault)?.id ??
        addresses[0]?.id ??
        ''));

  return (
    <section className="checkout-panel">
      <div className="panel-heading">
        <span className="checkout-number">1</span>
        <div>
          <h2>Delivery address</h2>
          <p>Choose the address for your order.</p>
        </div>
        <Link className="text-link" to="/account?section=addresses">
          Manage
        </Link>
      </div>
      {query.isLoading ? <p role="status">Loading addresses…</p> : null}
      {query.isError ? (
        <p role="alert">
          Unable to load addresses.{' '}
          <button onClick={() => void query.refetch()}>Try again</button>
        </p>
      ) : null}
      {query.isSuccess && addresses.length === 0 ? (
        <div className="checkout-no-address">
          <p>You have no saved delivery addresses.</p>
          <Link className="button-secondary" to="/account?section=addresses">
            Add address
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
            onChange={() => {
              setSelected(address.id);
              onChange?.(address.id);
            }}
          />
          <span className="address-radio" />
          <span className="address-copy">
            <strong>
              {address.recipientName} · {address.recipientPhone}
              {address.isDefault ? <em>Default</em> : null}
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
