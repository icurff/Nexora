import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  AlertCircle,
  Check,
  ChevronRight,
  Folder,
  FolderOpen,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Tag,
} from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  categoryErrorMessage,
  createAdminCategory,
  getAdminCategories,
  type Category,
  type CategoryInput,
  updateAdminCategory,
} from '../services/admin-categories-api.js';
import './AdminCategoriesPage.css';

type CategoryForm = {
  name: string;
  slug: string;
  parentId: string;
};

const blankForm: CategoryForm = {
  name: '',
  slug: '',
  parentId: '',
};

function toSlug(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (letter) => (letter === 'Đ' ? 'D' : 'd'))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 150)
    .replace(/-+$/g, '');
}

function flatten(
  items: Category[],
  parentId: string | null = null,
  depth = 0,
): Array<{ category: Category; depth: number }> {
  return items
    .filter((item) => item.parentId === parentId)
    .flatMap((category) => [
      { category, depth },
      ...flatten(items, category.id, depth + 1),
    ]);
}

function CategoryTree({
  items,
  selectedId,
  expanded,
  onSelect,
  onToggle,
}: {
  items: Category[];
  selectedId: string | null;
  expanded: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const renderBranch = (parentId: string | null, depth: number): ReactNode =>
    items
      .filter((item) => item.parentId === parentId)
      .map((item) => {
        const children = items.some((child) => child.parentId === item.id);
        const isOpen = expanded.has(item.id);
        return (
          <li className="category-tree-node" key={item.id}>
            <div
              className={`category-tree-row${selectedId === item.id ? ' selected' : ''}`}
              style={{ '--category-depth': depth } as CSSProperties}
            >
              {children ? (
                <button
                  className="category-tree-toggle"
                  type="button"
                  aria-label={`${isOpen ? 'Thu gọn' : 'Mở rộng'} ${item.name}`}
                  aria-expanded={isOpen}
                  onClick={() => onToggle(item.id)}
                >
                  <ChevronRight size={15} />
                </button>
              ) : (
                <span className="category-tree-spacer" />
              )}
              <button
                className="category-tree-select"
                type="button"
                onClick={() => onSelect(item.id)}
              >
                {children && isOpen ? (
                  <FolderOpen size={16} />
                ) : (
                  <Folder size={16} />
                )}
                <span className="category-tree-name">{item.name}</span>
              </button>
            </div>
            {children && isOpen ? (
              <ul>{renderBranch(item.id, depth + 1)}</ul>
            ) : null}
          </li>
        );
      });
  return <ul className="category-tree">{renderBranch(null, 0)}</ul>;
}

export function AdminCategoriesPage() {
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: getAdminCategories,
    retry: false,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [submitError, setSubmitError] = useState('');
  const [notice, setNotice] = useState('');
  const categories = useMemo(
    () => categoriesQuery.data ?? [],
    [categoriesQuery.data],
  );
  const selected = categories.find((item) => item.id === selectedId) ?? null;
  const form = useForm<CategoryForm>({
    defaultValues: blankForm,
    mode: 'onBlur',
  });
  const parentId = useWatch({ control: form.control, name: 'parentId' });
  const slugValue = useWatch({ control: form.control, name: 'slug' });
  const dirty = form.formState.isDirty;

  const visibleCategories = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('vi');
    const matches = categories.filter(
      (item) =>
        !query ||
        `${item.name} ${item.slug}`.toLocaleLowerCase('vi').includes(query),
    );
    const visible = new Set(matches.map((item) => item.id));
    const byId = new Map(categories.map((item) => [item.id, item]));
    for (const item of matches) {
      let cursor = item.parentId ? byId.get(item.parentId) : undefined;
      while (cursor) {
        visible.add(cursor.id);
        cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
      }
    }
    return categories.filter((item) => visible.has(item.id));
  }, [categories, search]);

  const expanded = useMemo(() => {
    const ids = new Set<string>();
    for (const item of visibleCategories) {
      if (
        visibleCategories.some((row) => row.parentId === item.id) &&
        !collapsedIds.has(item.id)
      )
        ids.add(item.id);
      if (search && item.parentId) ids.add(item.parentId);
    }
    return ids;
  }, [visibleCategories, search, collapsedIds]);

  const parentOptions = useMemo(() => {
    const children = new Map<string | null, Category[]>();
    for (const category of categories) {
      const group = children.get(category.parentId) ?? [];
      group.push(category);
      children.set(category.parentId, group);
    }
    const descendants = new Set<string>();
    const addChildren = (id: string) => {
      for (const child of children.get(id) ?? []) {
        if (descendants.has(child.id)) continue;
        descendants.add(child.id);
        addChildren(child.id);
      }
    };
    if (selectedId) addChildren(selectedId);
    return flatten(categories)
      .filter(
        ({ category }) =>
          category.id !== selectedId && !descendants.has(category.id),
      )
      .map(({ category, depth }) => ({ ...category, depth }));
  }, [categories, selectedId]);

  const mutation = useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: CategoryInput }) =>
      id ? updateAdminCategory(id, input) : createAdminCategory(input),
    onSuccess: async (saved, variables) => {
      await queryClient.invalidateQueries({
        queryKey: ['admin', 'categories'],
      });
      setSubmitError('');
      if (variables.id === null) {
        setSelectedId(null);
        setCreating(false);
        setSlugEdited(false);
        setNotice('Đã tạo danh mục. Biểu mẫu đã được làm trống.');
        form.reset(blankForm);
        return;
      }

      setSelectedId(saved.id);
      setCreating(false);
      setSlugEdited(true);
      setNotice('Danh mục đã được lưu.');
      form.reset({
        name: saved.name,
        slug: saved.slug,
        parentId: saved.parentId ?? '',
      });
    },
    onError: (error) => {
      setSubmitError(categoryErrorMessage(error));
      setNotice('');
    },
  });

  function changeSelection(nextId: string | null, nextCreating: boolean) {
    if (
      dirty &&
      !window.confirm('Bạn có thay đổi chưa lưu. Bỏ các thay đổi này?')
    )
      return;
    setNotice('');
    setSubmitError('');
    setSlugEdited(false);
    setSelectedId(nextId);
    setCreating(nextCreating);
    const next = nextId ? categories.find((item) => item.id === nextId) : null;
    form.reset(
      next
        ? {
            name: next.name,
            slug: next.slug,
            parentId: next.parentId ?? '',
          }
        : blankForm,
    );
  }

  function handleNameChange(value: string) {
    form.setValue('name', value, { shouldDirty: true, shouldValidate: true });
    if (creating && !slugEdited)
      form.setValue('slug', toSlug(value), {
        shouldDirty: true,
        shouldValidate: true,
      });
  }

  function submit(values: CategoryForm) {
    setSubmitError('');
    setNotice('');
    const input: CategoryInput = {
      name: values.name,
      slug: values.slug || undefined,
      parentId: values.parentId || null,
    };
    mutation.mutate({ id: creating ? null : selectedId, input });
  }

  return (
    <div className="admin-categories-page">
      <header className="admin-page-heading category-page-heading">
        <div>
          <span>TỔ CHỨC CỬA HÀNG</span>
          <h1>Danh mục</h1>
          <p>
            Tổ chức cây danh mục; lựa chọn SKU được cấu hình riêng cho từng sản phẩm.
          </p>
        </div>
        <button
          className="admin-button-primary"
          type="button"
          onClick={() => changeSelection(null, true)}
        >
          <Plus size={16} /> Thêm danh mục
        </button>
      </header>

      <div className="category-management-layout">
        <section
          className="admin-panel category-tree-panel"
          aria-label="Cây danh mục"
        >
          <div className="category-panel-heading">
            <div>
              <span>CATALOG</span>
              <h2>Cây danh mục</h2>
            </div>
            <button
              className="category-icon-button"
              type="button"
              aria-label="Tải lại danh mục"
              onClick={() => void categoriesQuery.refetch()}
            >
              <RefreshCw size={16} />
            </button>
          </div>
          <label className="category-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm danh mục..."
            />
          </label>
          {categoriesQuery.isPending ? (
            <div className="category-state">
              <LoaderCircle className="animate-spin" /> Đang tải danh mục...
            </div>
          ) : categoriesQuery.isError ? (
            <div className="category-state category-state-error">
              <AlertCircle />
              <span>{categoryErrorMessage(categoriesQuery.error)}</span>
              <button
                type="button"
                onClick={() => void categoriesQuery.refetch()}
              >
                Thử lại
              </button>
            </div>
          ) : visibleCategories.length === 0 ? (
            <div className="category-state">
              <Tag />
              <span>
                {categories.length
                  ? 'Không có danh mục phù hợp.'
                  : 'Chưa có danh mục. Hãy tạo danh mục đầu tiên.'}
              </span>
            </div>
          ) : (
            <CategoryTree
              items={visibleCategories}
              selectedId={selectedId}
              expanded={expanded}
              onSelect={(id) => changeSelection(id, false)}
              onToggle={(id) => {
                setCollapsedIds((current) => {
                  const next = new Set(current);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                });
              }}
            />
          )}
          <div className="category-tree-count">
            {visibleCategories.length} danh mục hiển thị · {categories.length}{' '}
            tổng cộng
          </div>
        </section>

        <section
          className="admin-panel category-editor-panel"
          aria-label="Thông tin danh mục"
        >
          <div className="category-panel-heading">
            <div>
              <span>
                {creating
                  ? 'DANH MỤC MỚI'
                  : selected
                    ? 'CHỈNH SỬA DANH MỤC'
                    : 'QUẢN LÝ DANH MỤC'}
              </span>
              <h2>
                {creating
                  ? 'Tạo danh mục'
                  : (selected?.name ?? 'Chọn một danh mục')}
              </h2>
            </div>
          </div>

          {!creating && !selected ? (
            <div className="category-editor-empty">
              {notice ? (
                <div className="category-form-success" role="status">
                  <Check size={16} />
                  {notice}
                </div>
              ) : null}
              <FolderOpen />
              <h3>Chưa chọn danh mục</h3>
              <p>
                Chọn một mục trong cây để xem và chỉnh sửa, hoặc tạo danh mục
                mới.
              </p>
            </div>
          ) : (
            <form
              className="category-form"
              onSubmit={form.handleSubmit(submit)}
            >
              <div className="category-form-grid">
                <label className="category-field">
                  <span>
                    Tên danh mục <i>*</i>
                  </span>
                  <input
                    autoComplete="off"
                    placeholder="Ví dụ: Điện thoại"
                    {...form.register('name', {
                      required: 'Vui lòng nhập tên danh mục.',
                      maxLength: {
                        value: 100,
                        message: 'Tên tối đa 100 ký tự.',
                      },
                      onChange: (event) => handleNameChange(event.target.value),
                    })}
                  />
                  {form.formState.errors.name ? (
                    <small className="category-field-error">
                      {form.formState.errors.name.message}
                    </small>
                  ) : null}
                </label>
                <label className="category-field">
                  <span>
                    Slug <i>*</i>
                  </span>
                  <input
                    autoComplete="off"
                    placeholder="dien-thoai"
                    {...form.register('slug', {
                      required: 'Vui lòng nhập slug.',
                      maxLength: {
                        value: 150,
                        message: 'Slug tối đa 150 ký tự.',
                      },
                      pattern: {
                        value: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
                        message:
                          'Chỉ dùng chữ thường không dấu, số và dấu gạch ngang.',
                      },
                      onChange: () => setSlugEdited(true),
                    })}
                  />
                  {form.formState.errors.slug ? (
                    <small className="category-field-error">
                      {form.formState.errors.slug.message}
                    </small>
                  ) : (
                    <small>
                      Đường dẫn: /categories/{slugValue || 'slug-danh-muc'}
                    </small>
                  )}
                </label>
              </div>

              <label className="category-field">
                <span>Danh mục cha</span>
                <select
                  value={parentId}
                  onChange={(event) =>
                    form.setValue('parentId', event.target.value, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                >
                  <option value="">Danh mục gốc</option>
                  {parentOptions.map((option) => (
                    <option
                      key={option.id}
                      value={option.id}
                    >
                      {'— '.repeat(option.depth)}
                      {option.name}
                    </option>
                  ))}
                </select>
                <small>Danh mục con không tự kế thừa cấu hình của cha.</small>
              </label>

              {submitError ? (
                <div className="category-form-error" role="alert">
                  <AlertCircle size={16} />
                  {submitError}
                </div>
              ) : null}
              {notice ? (
                <div className="category-form-success" role="status">
                  <Check size={16} />
                  {notice}
                </div>
              ) : null}
              {mutation.isPending ? (
                <div className="category-saving">
                  <LoaderCircle className="animate-spin" />
                  Đang lưu danh mục…
                </div>
              ) : null}
              <div className="category-form-actions">
                <button
                  type="button"
                  className="admin-button-secondary"
                  onClick={() => changeSelection(selectedId, false)}
                  disabled={mutation.isPending}
                >
                  Hủy thay đổi
                </button>
                <button
                  type="submit"
                  className="admin-button-primary"
                  disabled={mutation.isPending || !dirty}
                >
                  {mutation.isPending ? (
                    <LoaderCircle className="animate-spin" size={15} />
                  ) : (
                    <Check size={15} />
                  )}
                  {creating ? 'Tạo danh mục' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
