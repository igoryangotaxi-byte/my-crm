export type AppRole = "Admin" | "User" | "Team Lead";
export type UserStatus = "pending" | "approved" | "rejected";
export type BusinessArea = "b2b" | "b2c";

export type AppPageKey =
  | "dashboard"
  | "clients"
  | "orders"
  | "preOrders"
  | "priceCalculator"
  | "accesses"
  | "notes";

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
export type RoleAreaAccess = Record<AppRole, Record<BusinessArea, boolean>>;
export type AuthStoreData = {
  users: AuthUser[];
  rolePermissions: RolePermissions;
  roleAreaAccess: RoleAreaAccess;
};

export const defaultRolePermissions: RolePermissions = {
  Admin: {
    dashboard: true,
    clients: true,
    orders: true,
    preOrders: true,
    priceCalculator: true,
    accesses: true,
    notes: true,
  },
  User: {
    dashboard: true,
    clients: true,
    orders: false,
    preOrders: false,
    priceCalculator: true,
    accesses: false,
    notes: false,
  },
  "Team Lead": {
    dashboard: true,
    clients: true,
    orders: true,
    preOrders: true,
    priceCalculator: true,
    accesses: false,
    notes: true,
  },
};

export const defaultRoleAreaAccess: RoleAreaAccess = {
  Admin: {
    b2b: true,
    b2c: true,
  },
  User: {
    b2b: true,
    b2c: false,
  },
  "Team Lead": {
    b2b: true,
    b2c: false,
  },
};

export type AuthApiStateResponse = AuthStoreData;

export type AuthApiActionRequest =
  | {
      action: "register";
      name: string;
      email: string;
      password: string;
    }
  | {
      action: "login";
      email: string;
      password: string;
    }
  | {
      action: "updateUserStatus";
      userId: string;
      status: UserStatus;
    }
  | {
      action: "updateUserRole";
      userId: string;
      role: AppRole;
    }
  | {
      action: "toggleRolePageAccess";
      role: AppRole;
      page: AppPageKey;
    }
  | {
      action: "toggleRoleAreaAccess";
      role: AppRole;
      area: BusinessArea;
    }
  | {
      action: "setAllRoleAccess";
      role: AppRole;
      value: boolean;
    };
