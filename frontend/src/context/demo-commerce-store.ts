import { create } from 'zustand';

type DemoCartLine = { productId: string; quantity: number };
type DemoCommerceState = {
  cart: DemoCartLine[];
  wishlist: string[];
  addToCart: (productId: string, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  toggleWishlist: (productId: string) => void;
  clearCart: () => void;
};

export const useDemoCommerceStore = create<DemoCommerceState>((set) => ({
  cart: [
    { productId: '101', quantity: 1 },
    { productId: '105', quantity: 2 },
  ],
  wishlist: ['104', '106'],
  addToCart: (productId, quantity = 1) =>
    set((state) => {
      const existing = state.cart.find((item) => item.productId === productId);
      return {
        cart: existing
          ? state.cart.map((item) =>
              item.productId === productId
                ? { ...item, quantity: item.quantity + quantity }
                : item,
            )
          : [...state.cart, { productId, quantity }],
      };
    }),
  setQuantity: (productId, quantity) =>
    set((state) => ({
      cart:
        quantity <= 0
          ? state.cart.filter((item) => item.productId !== productId)
          : state.cart.map((item) =>
              item.productId === productId ? { ...item, quantity } : item,
            ),
    })),
  removeFromCart: (productId) =>
    set((state) => ({
      cart: state.cart.filter((item) => item.productId !== productId),
    })),
  toggleWishlist: (productId) =>
    set((state) => ({
      wishlist: state.wishlist.includes(productId)
        ? state.wishlist.filter((id) => id !== productId)
        : [...state.wishlist, productId],
    })),
  clearCart: () => set({ cart: [] }),
}));
