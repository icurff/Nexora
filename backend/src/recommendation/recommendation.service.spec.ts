import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecommendationService } from './recommendation.service.js';
import { RecommendationRepository } from './recommendation.repository.js';

const product = (id: number, categoryId: number, createdAt = '2026-11-01') => ({
  id: BigInt(id),
  name: `Product ${id}`,
  categoryId: BigInt(categoryId),
  createdAt: new Date(createdAt),
});

describe('RecommendationService', () => {
  const repo = {
    newest: vi.fn(),
    byCategories: vi.fn(),
    product: vi.fn(),
    recentViews: vi.fn(),
    cartProducts: vi.fn(),
  };

  let service: RecommendationService;

  beforeEach(() => {
    vi.resetAllMocks();

    service = new RecommendationService(
      repo as unknown as RecommendationRepository,
    );

    repo.newest.mockResolvedValue([]);
    repo.byCategories.mockResolvedValue([]);
    repo.recentViews.mockResolvedValue([]);
    repo.cartProducts.mockResolvedValue([]);
  });

  it('Home: guest chưa có VIEW dùng fallback', async () => {
    repo.newest.mockResolvedValue([product(1, 10)]);

    const result = await service.home(5n, 10);

    expect(result.source).toBe('rule_based');
    expect(result.strategy).toBe('new_arrivals');
    expect(result.items[0].productId).toBe('1');
  });

  it('Home: ưu tiên danh mục được xem nhiều nhất', async () => {
    repo.recentViews.mockResolvedValue([
      { productId: 1n, product: { categoryId: 10n } },
      { productId: 2n, product: { categoryId: 10n } },
      { productId: 3n, product: { categoryId: 20n } },
    ]);

    repo.byCategories.mockImplementation((categories: bigint[]) =>
      Promise.resolve(
        categories[0] === 10n ? [product(4, 10)] : [product(5, 20)],
      ),
    );

    const result = await service.home(5n, 2);

    expect(repo.byCategories).toHaveBeenNthCalledWith(1, [10n], 2, [
      1n,
      2n,
      3n,
    ]);
    expect(repo.byCategories).toHaveBeenNthCalledWith(2, [20n], 1, [
      1n,
      2n,
      3n,
      4n,
    ]);

    expect(result.items.map((x) => x.productId)).toEqual(['4', '5']);
  });

  it('Detail: loại sản phẩm đang xem', async () => {
    repo.product.mockResolvedValue(product(1, 10));
    repo.byCategories.mockResolvedValue([product(2, 10)]);

    const result = await service.similar(1n, 1);

    expect(repo.byCategories).toHaveBeenCalledWith([10n], 1, [1n]);

    expect(result.items[0].reason).toBe('similar_category');
  });

  it('Cart: gợi ý theo danh mục, loại item trong giỏ', async () => {
    repo.cartProducts.mockResolvedValue([product(1, 10), product(2, 20)]);

    repo.byCategories.mockResolvedValue([product(3, 10)]);

    const result = await service.cart(7n, 1);

    expect(repo.byCategories).toHaveBeenCalledWith([10n], 1, [1n, 2n]);

    expect(result.items[0].productId).toBe('3');
    expect(result.items[0].reason).toBe('cart_category');
  });

  it('Cart: ranks categories by distinct cart products, then fills from other categories', async () => {
    repo.cartProducts.mockResolvedValue([
      product(1, 20),
      product(2, 10),
      product(3, 10),
      product(3, 10),
    ]);
    repo.byCategories.mockImplementation((categories: bigint[]) =>
      Promise.resolve(
        categories[0] === 10n ? [product(4, 10)] : [product(5, 20)],
      ),
    );
    const result = await service.cart(7n, 2, [9n]);
    expect(result.items.map((item) => item.productId)).toEqual(['4', '5']);
    expect(repo.byCategories).toHaveBeenNthCalledWith(1, [10n], 2, [
      9n,
      1n,
      2n,
      3n,
    ]);
    expect(repo.byCategories).toHaveBeenNthCalledWith(2, [20n], 1, [
      9n,
      1n,
      2n,
      3n,
      4n,
    ]);
  });

  it('Home: does not let newer products in less viewed categories crowd out the preferred category', async () => {
    repo.recentViews.mockResolvedValue([
      { productId: 1n, product: { categoryId: 10n } },
      { productId: 2n, product: { categoryId: 10n } },
      { productId: 3n, product: { categoryId: 20n } },
    ]);
    repo.byCategories.mockImplementation((categories: bigint[]) =>
      Promise.resolve(
        categories[0] === 10n
          ? [product(4, 10), product(5, 10)]
          : [product(6, 20)],
      ),
    );
    const result = await service.home(5n, 2);
    expect(result.items.map((item) => item.categoryId)).toEqual(['10', '10']);
    expect(repo.byCategories).toHaveBeenCalledTimes(1);
  });

  it('Home: current session categories take priority over older frequent views', async () => {
    repo.recentViews.mockResolvedValue([
      ...Array.from({ length: 10 }, (_, i) => ({
        productId: BigInt(i + 1),
        product: { categoryId: 10n },
      })),
      { productId: 11n, product: { categoryId: 20n } },
    ]);
    repo.byCategories.mockImplementation((categories: bigint[]) =>
      Promise.resolve(
        categories[0] === 20n ? [product(12, 20)] : [product(13, 10)],
      ),
    );
    const result = await service.home(
      5n,
      1,
      [],
      [{ productId: 11n, categoryId: 20n }],
    );
    expect(result.items.map((item) => item.productId)).toEqual(['12']);
    expect(repo.byCategories).toHaveBeenCalledWith(
      [20n],
      1,
      expect.arrayContaining([11n]),
    );
  });

  it('Detail: sản phẩm không tồn tại trả danh sách rỗng', async () => {
    repo.product.mockResolvedValue(null);

    const result = await service.similar(999n);

    expect(result.items).toEqual([]);
    expect(result.strategy).toBe('product_not_found');
  });
});

describe('Rule fallback exclusions', () => {
  it.each(['home', 'similar', 'cart'] as const)(
    '%s never refills AI products',
    async (surface) => {
      const repo = {
        recentViews: vi.fn().mockResolvedValue([]),
        product: vi.fn().mockResolvedValue({ id: 1n, categoryId: 10n }),
        cartProducts: vi.fn().mockResolvedValue([{ id: 1n, categoryId: 10n }]),
        byCategories: vi.fn().mockResolvedValue([]),
        newest: vi.fn().mockResolvedValue([]),
      };
      const service = new RecommendationService(
        repo as unknown as RecommendationRepository,
      );
      await service[surface](1n, 2, [2n, 3n]);
      expect(repo.newest).toHaveBeenCalledWith(
        2,
        expect.arrayContaining([2n, 3n]),
      );
    },
  );
});
