export type AppRole = "Admin" | "User" | "Team Lead";
export type UserStatus = "pending" | "approved" | "rejected";
export type BusinessArea = "b2b" | "b2c";
export type DashboardBlockKey = "apiData" | "yangoData" | "tariffHealthCheck";
export type AccountType = "internal" | "client";

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
  phoneNumber?: string | null;
  costCenterId?: string | null;
  password: string;
  role: AppRole;
  status: UserStatus;
  createdAt: string;
  accountType?: AccountType;
  tenantId?: string | null;
  corpClientId?: string | null;
  tokenLabel?: string | null;
  apiClientId?: string | null;
  clientRoleId?: string | null;
};

export type ClientPortalPageKey = "requestRides" | "orders" | "preOrders" | "driversMap" | "employees";
export type ClientRoleDefinition = {
  id: string;
  name: string;
  permissions: Record<ClientPortalPageKey, boolean>;
  isDefault?: boolean;
};
export type TenantAccount = {
  id: string;
  name: string;
  corpClientId: string;
  tokenLabel: string;
  apiClientId: string;
  enabled: boolean;
  createdAt: string;
};
export type TenantRoleDefinitions = Record<string, ClientRoleDefinition[]>;

export type RolePermissions = Record<AppRole, Record<AppPageKey, boolean>>;
export type RoleAreaAccess = Record<AppRole, Record<BusinessArea, boolean>>;
export type RoleDashboardBlockAccess = Record<AppRole, Record<DashboardBlockKey, boolean>>;
export type AuthStoreData = {
  users: AuthUser[];
  rolePermissions: RolePermissions;
  roleAreaAccess: RoleAreaAccess;
  roleDashboardBlockAccess: RoleDashboardBlockAccess;
  tenantAccounts?: TenantAccount[];
  tenantRoles?: TenantRoleDefinitions;
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
    }
  | {
      action: "upsertTenantAccount";
      tenantId?: string;
      name: string;
      corpClientId: string;
      tokenLabel: string;
      apiClientId: string;
      primaryAdminName: string;
      primaryAdminEmail: string;
      primaryAdminPassword: string;
    }
  | {
      action: "createTenantEmployee";
      tenantId: string;
      name: string;
      email: string;
      phoneNumber?: string;
      costCenterId?: string;
      password: string;
      clientRoleId: string;
    }
  | {
      action: "updateTenantEmployee";
      userId: string;
      name?: string;
      phoneNumber?: string;
      costCenterId?: string;
      status?: UserStatus;
      clientRoleId?: string;
    }
  | {
      action: "upsertTenantRole";
      tenantId: string;
      roleId?: string;
      name: string;
      permissions: Partial<Record<ClientPortalPageKey, boolean>>;
    };

export const defaultClientPortalPermissions: Record<ClientPortalPageKey, boolean> = {
  requestRides: true,
  orders: true,
  preOrders: true,
  driversMap: true,
  employees: false,
};
