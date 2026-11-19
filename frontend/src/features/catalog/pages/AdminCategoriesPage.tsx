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
                  aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${item.name}`}
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
        setNotice('Category created. The form has been cleared.');
        form.reset(blankForm);
        return;
      }

      setSelectedId(saved.id);
      setCreating(false);
      setSlugEdited(true);
      setNotice('Category saved.');
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
      !window.confirm('You have unsaved changes. Discard them?')
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
          <h1>Categories</h1>
          <p>
            Organize the category tree; SKU options are configured per product.
          </p>
        </div>
        <button
          className="admin-button-primary"
          type="button"
          onClick={() => changeSelection(null, true)}
        >
          <Plus size={16} /> Add category
        </button>
      </header>

      <div className="category-management-layout">
        <section
          className="admin-panel category-tree-panel"
          aria-label="Category tree"
        >
          <div className="category-panel-heading">
            <div>
              <h2>Category tree</h2>
            </div>
            <button
              className="category-icon-button"
              type="button"
              aria-label="Reload categories"
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
              placeholder="Search categories..."
            />
          </label>
          {categoriesQuery.isPending ? (
            <div className="category-state">
              <LoaderCircle className="animate-spin" /> Loading categories...
            </div>
          ) : categoriesQuery.isError ? (
            <div className="category-state category-state-error">
              <AlertCircle />
              <span>{categoryErrorMessage(categoriesQuery.error)}</span>
              <button
                type="button"
                onClick={() => void categoriesQuery.refetch()}
              >
                Try again
              </button>
            </div>
          ) : visibleCategories.length === 0 ? (
            <div className="category-state">
              <Tag />
              <span>
                {categories.length
                  ? 'No matching categories.'
                  : 'No categories yet. Create the first category.'}
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
            {visibleCategories.length} categories shown · {categories.length}{' '}
            total
          </div>
        </section>

        <section
          className="admin-panel category-editor-panel"
          aria-label="Category details"
        >
          <div className="category-panel-heading">
            <div>
              <h2>
                {creating
                  ? 'Create category'
                  : (selected?.name ?? 'Select a category')}
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
              <h3>No category selected</h3>
              <p>
                Select a category in the tree to view and edit it, or create a new one.
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
                    Category name <i>*</i>
                  </span>
                  <input
                    autoComplete="off"
                    placeholder="For example: Phones"
                    {...form.register('name', {
                      required: 'Enter a category name.',
                      maxLength: {
                        value: 100,
                        message: 'Name must not exceed 100 characters.',
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
                      required: 'Enter a slug.',
                      maxLength: {
                        value: 150,
                        message: 'Slug must not exceed 150 characters.',
                      },
                      pattern: {
                        value: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
                        message:
                          'Use lowercase unaccented letters, numbers, and hyphens only.',
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
                      Path: /categories/{slugValue || 'category-slug'}
                    </small>
                  )}
                </label>
              </div>

              <label className="category-field">
                <span>Parent category</span>
                <select
                  value={parentId}
                  onChange={(event) =>
                    form.setValue('parentId', event.target.value, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                >
                  <option value="">Root category</option>
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
                <small>Child categories do not automatically inherit configuration from their parent.</small>
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
                  Saving category…
                </div>
              ) : null}
              <div className="category-form-actions">
                <button
                  type="button"
                  className="admin-button-secondary"
                  onClick={() => changeSelection(selectedId, false)}
                  disabled={mutation.isPending}
                >
                  Discard changes
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
                  {creating ? 'Create category' : 'Save changes'}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
