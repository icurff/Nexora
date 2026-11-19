export type DemoProduct = {
  id: string;
  name: string;
  category: string;
  categoryId: string;
  price: number;
  compareAt?: number;
  image: string;
  color: string;
  description: string;
  rating: number;
  sold: number;
  stock: number;
};

export const demoCategories = [
  {
    id: 'fashion',
    name: 'Fashion',
    description: 'Everyday style',
    icon: '✦',
    color: 'mint',
  },
  {
    id: 'home',
    name: 'Home & living',
    description: 'Inspiration for your space',
    icon: '⌂',
    color: 'sand',
  },
  {
    id: 'tech',
    name: 'Electronics',
    description: 'Technology within reach',
    icon: '◉',
    color: 'blue',
  },
  {
    id: 'accessories',
    name: 'Accessories',
    description: 'Small, useful essentials',
    icon: '◇',
    color: 'rose',
  },
];

export const demoProducts: DemoProduct[] = [
  {
    id: '101',
    name: 'Everyday Canvas Tote',
    category: 'Accessories',
    categoryId: 'accessories',
    price: 189000,
    compareAt: 249000,
    image: '/demo-products/tote.svg',
    color: 'bg-[#e6ede8]',
    description:
      'A durable canvas tote for busy days, with a spacious, minimalist design.',
    rating: 4.9,
    sold: 248,
    stock: 32,
  },
  {
    id: '102',
    name: 'Essential Cotton T-shirt',
    category: 'Fashion',
    categoryId: 'fashion',
    price: 329000,
    image: '/demo-products/shirt.svg',
    color: 'bg-[#e9edf7]',
    description:
      'A soft, breathable cotton T-shirt with a comfortable everyday fit.',
    rating: 4.8,
    sold: 186,
    stock: 24,
  },
  {
    id: '103',
    name: 'Aurora Table Lamp',
    category: 'Home & living',
    categoryId: 'home',
    price: 649000,
    compareAt: 790000,
    image: '/demo-products/lamp.svg',
    color: 'bg-[#f1e9df]',
    description:
      'Warm light and a compact design for a desk or bedside table.',
    rating: 4.7,
    sold: 93,
    stock: 15,
  },
  {
    id: '104',
    name: 'Studio Wireless Headphones',
    category: 'Electronics',
    categoryId: 'tech',
    price: 1290000,
    image: '/demo-products/headphones.svg',
    color: 'bg-[#e4e9f5]',
    description:
      'Balanced sound, comfortable ear cushions, and long battery life.',
    rating: 4.9,
    sold: 121,
    stock: 18,
  },
  {
    id: '105',
    name: 'Morning Ritual Ceramic Mug',
    category: 'Home & living',
    categoryId: 'home',
    price: 259000,
    image: '/demo-products/mug.svg',
    color: 'bg-[#f2e8dc]',
    description:
      'A handcrafted ceramic mug with a smooth glaze for your morning coffee.',
    rating: 4.6,
    sold: 77,
    stock: 41,
  },
  {
    id: '106',
    name: 'Go Green Insulated Bottle',
    category: 'Accessories',
    categoryId: 'accessories',
    price: 379000,
    compareAt: 429000,
    image: '/demo-products/bottle.svg',
    color: 'bg-[#e2eee8]',
    description:
      'A compact double-walled insulated bottle for work and outdoor activities.',
    rating: 4.8,
    sold: 159,
    stock: 29,
  },
  {
    id: '107',
    name: 'Relaxed Fit T-shirt',
    category: 'Fashion',
    categoryId: 'fashion',
    price: 359000,
    image: '/demo-products/shirt.svg',
    color: 'bg-[#f0e7e3]',
    description:
      'Soft cotton, neutral colors, and a relaxed silhouette.',
    rating: 4.7,
    sold: 64,
    stock: 17,
  },
  {
    id: '108',
    name: 'Soft Glow Reading Lamp',
    category: 'Home & living',
    categoryId: 'home',
    price: 519000,
    image: '/demo-products/lamp.svg',
    color: 'bg-[#e5e9e5]',
    description:
      'A warm light to help you relax and focus in the evening.',
    rating: 4.8,
    sold: 58,
    stock: 12,
  },
];

export const demoOrders = [
  {
    id: 'NX-2026-1048',
    date: '28/10/2026',
    status: 'Đang giao',
    total: 837000,
    items: ['Túi tote Canvas Everyday', 'Ly gốm Morning Ritual'],
  },
  {
    id: 'NX-2026-1031',
    date: '19/10/2026',
    status: 'Đã giao',
    total: 1290000,
    items: ['Tai nghe Studio Wireless'],
  },
  {
    id: 'NX-2026-0984',
    date: '04/10/2026',
    status: 'Đã giao',
    total: 329000,
    items: ['Áo thun Essential Cotton'],
  },
];

export function formatVnd(value: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value);
}
