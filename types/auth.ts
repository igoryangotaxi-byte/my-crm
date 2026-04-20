export type AppRole = "Admin" | "User" | "Team Lead";
export type UserStatus = "pending" | "approved" | "rejected";

export type AppPageKey =
  | "dashboard"
  | "clients"
  | "orders"
  | "preOrders"
  | "priceCalculator"
  | "accesses";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  password: string;
  role: AppRole;
  status: UserStatus;
  createdAt: string;
};

export type RolePermissions = Record<AppRole, Record<AppPageKey, boolean>>;

export const defaultRolePermissions: RolePermissions = {
  Admin: {
    dashboard: true,
    clients: true,
    orders: true,
    preOrders: true,
    priceCalculator: true,
    accesses: true,
  },
  User: {
    dashboard: true,
    clients: true,
    orders: false,
    preOrders: false,
    priceCalculator: true,
    accesses: false,
  },
  "Team Lead": {
    dashboard: true,
    clients: true,
    orders: true,
    preOrders: true,
    priceCalculator: true,
    accesses: false,
  },
};
