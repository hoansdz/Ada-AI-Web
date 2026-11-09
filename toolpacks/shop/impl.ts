import fs from "node:fs";
import path from "node:path";

export interface ProductData {
  id: string;
  name: string;
  price: number;
  stock: number;
}

export interface OrderItemData {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
}

export interface OrderData {
  id: string;
  customerId: string;
  status: string;
  totalAmount: number;
  items: OrderItemData[];
}

export interface ShipmentData {
  code: string;
  orderId: string;
  carrier: string;
  status: string;
  delayed: boolean;
}

export interface CustomerData {
  id: string;
  name: string;
  phone: string;
}

export interface ShopDatabase {
  products: ProductData[];
  customers: CustomerData[];
  orders: OrderData[];
  shipments: ShipmentData[];
}

let cachedData: ShopDatabase | null = null;

function loadData(): ShopDatabase {
  if (cachedData !== null) {
    return cachedData;
  }
  const filePath = path.join(process.cwd(), "toolpacks", "shop", "data.json");
  let raw = "";
  if (fs.existsSync(filePath)) {
    raw = fs.readFileSync(filePath, "utf-8");
  } else {
    raw = JSON.stringify({ products: [], customers: [], orders: [], shipments: [] });
  }
  const parsed = JSON.parse(raw) as ShopDatabase;
  cachedData = parsed;
  return parsed;
}

let taskCounter = 100;

export const shopNatives = {
  shop_search_products: (query: unknown, limit: unknown = 10): ProductData[] => {
    const data = loadData();
    const q = String(query ?? "").toLowerCase();
    const maxCount = typeof limit === "number" ? limit : 10;
    const filtered = data.products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
    );
    return filtered.slice(0, maxCount);
  },

  shop_get_product: (id: unknown): ProductData | null => {
    const data = loadData();
    const targetId = String(id ?? "");
    const found = data.products.find((p) => p.id === targetId);
    return found ?? null;
  },

  shop_list_orders: (status: unknown): OrderData[] => {
    const data = loadData();
    let st = String(status ?? "").trim().toLowerCase();
    if (st === "shipped") {
      st = "shipping";
    }
    if (!st || st === "all") {
      return data.orders;
    }
    return data.orders.filter((o) => o.status.toLowerCase() === st);
  },

  shop_get_order: (id: unknown): OrderData | null => {
    const data = loadData();
    const targetId = String(id ?? "");
    const found = data.orders.find((o) => o.id === targetId);
    return found ?? null;
  },

  shipping_track: (code: unknown): ShipmentData | null => {
    const data = loadData();
    const targetCode = String(code ?? "");
    const found = data.shipments.find((s) => s.code === targetCode || s.orderId === targetCode);
    return found ?? null;
  },

  zalo_send_message: (_customerId: unknown, _text: unknown): boolean => {
    // Tác dụng phụ giả lập: ghi nhận và trả về thành công
    return true;
  },

  tasks_create: (_title: unknown, _assignee: unknown): string => {
    // Tác dụng phụ giả lập: trả mã task mới
    taskCounter += 1;
    return `TASK-${taskCounter}`;
  },
};
