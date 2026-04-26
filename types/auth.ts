export type AppRole = "Admin" | "User" | "Team Lead";
export type UserStatus = "pending" | "approved" | "rejected";
export type BusinessArea = "b2b" | "b2c";
export type DashboardBlockKey = "apiData" | "yangoData" | "tariffHealthCheck";

export type AppPageKey =
  | "dashboard"
  | "clients"
  | "orders"
  | "preOrders"
  | "requestRides"
  | "driversMap"
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
export type RoleDashboardBlockAccess = Record<AppRole, Record<DashboardBlockKey, boolean>>;
export type AuthStoreData = {
  users: AuthUser[];
  rolePermissions: RolePermissions;
  roleAreaAccess: RoleAreaAccess;
  roleDashboardBlockAccess: RoleDashboardBlockAccess;
  /** Bumped when role defaults are migrated in `normalizeStore` (e.g. KV from older builds). */
  storeMeta?: { permissionsVersion?: number };
};

export const defaultRolePermissions: RolePermissions = {
  Admin: {
    dashboard: true,
    clients: true,
    orders: true,
    preOrders: true,
    requestRides: true,
    driversMap: true,
    priceCalculator: true,
    accesses: true,
    notes: true,
  },
  User: {
    dashboard: true,
    clients: true,
    orders: true,
    preOrders: true,
    requestRides: true,
    driversMap: false,
    priceCalculator: true,
    accesses: false,
    notes: false,
  },
  "Team Lead": {
    dashboard: true,
    clients: true,
    orders: true,
    preOrders: true,
    requestRides: true,
    driversMap: false,
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

export const defaultRoleDashboardBlockAccess: RoleDashboardBlockAccess = {
  Admin: {
    apiData: true,
    yangoData: true,
    tariffHealthCheck: true,
  },
  User: {
    apiData: true,
    yangoData: true,
    tariffHealthCheck: true,
  },
  "Team Lead": {
    apiData: true,
    yangoData: true,
    tariffHealthCheck: true,
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
      action: "logout";
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
      action: "toggleRoleDashboardBlockAccess";
      role: AppRole;
      block: DashboardBlockKey;
    }
  | {
      action: "setAllRoleAccess";
      role: AppRole;
      value: boolean;
    }
  | {
      action: "deleteUser";
      userId: string;
    };
