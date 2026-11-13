export type Category = {
  id: string;
  name: string;
  imageUrl?: string;
  active?: boolean;
};

export type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  categoryId: string;
  imageUrl?: string;
  active: boolean;
  popular?: boolean;
  createdAt?: { seconds: number };
};

export type ShopSettings = {
  isOpen: boolean;
  notice?: string;
};

export type ShopBanner = {
  id: string;
  title: string;
  description: string;
  discount?: string;
  imageUrl?: string;
  active: boolean;
  startsAt?: string;
  endsAt?: string;
};

export type CustomerProfile = {
  fullName: string;
  mobile: string;
  email: string;
  hostelName: string;
  roomNumber: string;
  deliveryAddress: string;
};

export type Order = {
  id: string;
  customerId: string;
  customer: CustomerProfile;
  items: Array<{ productId: string; name: string; imageUrl: string; unitPrice: number; quantity: number }>;
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentStatus: "pending_verification" | "confirmed";
  paymentReference: string;
  status: string;
  estimatedDeliveryMinutes: number | null;
  rejectReason?: string;
  createdAt?: { seconds: number };
};
