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
    name: 'Thời trang',
    description: 'Phong cách mỗi ngày',
    icon: '✦',
    color: 'mint',
  },
  {
    id: 'home',
    name: 'Nhà cửa & đời sống',
    description: 'Thêm cảm hứng cho không gian sống',
    icon: '⌂',
    color: 'sand',
  },
  {
    id: 'tech',
    name: 'Thiết bị số',
    description: 'Công nghệ trong tầm tay',
    icon: '◉',
    color: 'blue',
  },
  {
    id: 'accessories',
    name: 'Phụ kiện',
    description: 'Những món đồ nhỏ, hữu ích',
    icon: '◇',
    color: 'rose',
  },
];

export const demoProducts: DemoProduct[] = [
  {
    id: '101',
    name: 'Túi tote Canvas Everyday',
    category: 'Phụ kiện',
    categoryId: 'accessories',
    price: 189000,
    compareAt: 249000,
    image: '/demo-products/tote.svg',
    color: 'bg-[#e6ede8]',
    description:
      'Chiếc túi canvas dày dặn cho những ngày bận rộn. Thiết kế tối giản, rộng rãi và dễ phối đồ.',
    rating: 4.9,
    sold: 248,
    stock: 32,
  },
  {
    id: '102',
    name: 'Áo thun Essential Cotton',
    category: 'Thời trang',
    categoryId: 'fashion',
    price: 329000,
    image: '/demo-products/shirt.svg',
    color: 'bg-[#e9edf7]',
    description:
      'Áo thun cotton mềm mại, thoáng mát với phom dáng vừa vặn cho mọi hoạt động.',
    rating: 4.8,
    sold: 186,
    stock: 24,
  },
  {
    id: '103',
    name: 'Đèn bàn Aurora',
    category: 'Nhà cửa & đời sống',
    categoryId: 'home',
    price: 649000,
    compareAt: 790000,
    image: '/demo-products/lamp.svg',
    color: 'bg-[#f1e9df]',
    description:
      'Ánh sáng ấm dịu cùng kiểu dáng gọn gàng cho góc làm việc hay bàn ngủ.',
    rating: 4.7,
    sold: 93,
    stock: 15,
  },
  {
    id: '104',
    name: 'Tai nghe Studio Wireless',
    category: 'Thiết bị số',
    categoryId: 'tech',
    price: 1290000,
    image: '/demo-products/headphones.svg',
    color: 'bg-[#e4e9f5]',
    description:
      'Âm thanh cân bằng, đệm tai êm và thời lượng pin dài cho ngày di chuyển.',
    rating: 4.9,
    sold: 121,
    stock: 18,
  },
  {
    id: '105',
    name: 'Ly gốm Morning Ritual',
    category: 'Nhà cửa & đời sống',
    categoryId: 'home',
    price: 259000,
    image: '/demo-products/mug.svg',
    color: 'bg-[#f2e8dc]',
    description:
      'Ly gốm thủ công với lớp men mịn, vừa vặn cho tách cà phê buổi sáng.',
    rating: 4.6,
    sold: 77,
    stock: 41,
  },
  {
    id: '106',
    name: 'Bình giữ nhiệt Go Green',
    category: 'Phụ kiện',
    categoryId: 'accessories',
    price: 379000,
    compareAt: 429000,
    image: '/demo-products/bottle.svg',
    color: 'bg-[#e2eee8]',
    description:
      'Bình giữ nhiệt hai lớp nhỏ gọn, đồng hành cùng bạn ở văn phòng và ngoài trời.',
    rating: 4.8,
    sold: 159,
    stock: 29,
  },
  {
    id: '107',
    name: 'Áo thun Relaxed Fit',
    category: 'Thời trang',
    categoryId: 'fashion',
    price: 359000,
    image: '/demo-products/shirt.svg',
    color: 'bg-[#f0e7e3]',
    description:
      'Chất liệu cotton mềm, sắc màu trung tính và kiểu dáng phóng khoáng.',
    rating: 4.7,
    sold: 64,
    stock: 17,
  },
  {
    id: '108',
    name: 'Đèn đọc sách Soft Glow',
    category: 'Nhà cửa & đời sống',
    categoryId: 'home',
    price: 519000,
    image: '/demo-products/lamp.svg',
    color: 'bg-[#e5e9e5]',
    description:
      'Một điểm sáng ấm áp giúp bạn thư giãn và tập trung hơn mỗi tối.',
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
