import { describe, expect, it, vi } from 'vitest';
import { ProductService } from './product.service.js';

function inventoryTransaction(
  variant: { onHand: number; reserved: number } | null,
  product: { onHand: number; reserved: number } | null,
) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    inventory: {
      findUnique: vi.fn().mockImplementation(() => Promise.resolve(variant)),
      update: vi.fn().mockResolvedValue(undefined),
    },
    productInventory: {
      findUnique: vi.fn().mockImplementation(() => Promise.resolve(product)),
      update: vi.fn().mockResolvedValue(undefined),
    },
  };
  return tx;
}

const service = new ProductService({} as never, {} as never);

describe('ProductService order inventory lifecycle', () => {
  it('dispatches SKU and Product stock while consuming reservation once', async () => {
    const tx = inventoryTransaction(
      { onHand: 6, reserved: 2 },
      { onHand: 4, reserved: 1 },
    );
    await service.dispatchOrder(tx as never, [
      { productId: 3n, variantId: 4n, quantity: 2 },
      { productId: 8n, variantId: null, quantity: 1 },
    ]);

    expect(tx.inventory.update).toHaveBeenCalledWith({
      where: { variantId: 4n },
      data: {
        onHand: { decrement: 2 },
        reserved: { decrement: 2 },
        version: { increment: 1n },
      },
    });
    expect(tx.productInventory.update).toHaveBeenCalledWith({
      where: { productId: 8n },
      data: {
        onHand: { decrement: 1 },
        reserved: { decrement: 1 },
        version: { increment: 1n },
      },
    });
  });

  it('rejects dispatch when the order reservation is missing', async () => {
    const tx = inventoryTransaction({ onHand: 6, reserved: 1 }, null);
    await expect(
      service.dispatchOrder(tx as never, [
        { productId: 3n, variantId: 4n, quantity: 2 },
      ]),
    ).rejects.toMatchObject({
      response: { code: 'ORDER_RESERVATION_MISMATCH' },
    });
    expect(tx.inventory.update).not.toHaveBeenCalled();
  });

  it('restocks returned SKU and Product quantities once and rejects overflow', async () => {
    const tx = inventoryTransaction(
      { onHand: 6, reserved: 0 },
      { onHand: 4, reserved: 0 },
    );
    await service.receiveReturnedOrder(tx as never, [
      { productId: 3n, variantId: 4n, quantity: 2 },
      { productId: 8n, variantId: null, quantity: 1 },
    ]);
    expect(tx.inventory.update).toHaveBeenCalledWith({
      where: { variantId: 4n },
      data: { onHand: { increment: 2 }, version: { increment: 1n } },
    });
    expect(tx.productInventory.update).toHaveBeenCalledWith({
      where: { productId: 8n },
      data: { onHand: { increment: 1 }, version: { increment: 1n } },
    });

    const overflow = inventoryTransaction(
      { onHand: 2_147_483_647, reserved: 0 },
      null,
    );
    await expect(
      service.receiveReturnedOrder(overflow as never, [
        { productId: 3n, variantId: 4n, quantity: 1 },
      ]),
    ).rejects.toMatchObject({ response: { code: 'RETURN_STOCK_INVALID' } });
    expect(overflow.inventory.update).not.toHaveBeenCalled();
  });
});
