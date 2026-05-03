"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  type AuthApiActionRequest,
  type AuthStoreData,
  type AppPageKey,
  type AppRole,
  type AuthUser,
  type BusinessArea,
  type DashboardBlockKey,
  defaultRoleAreaAccess,
  defaultRoleDashboardBlockAccess,
  defaultRolePermissions,
  type RoleAreaAccess,
  type RoleDashboardBlockAccess,
  type RolePermissions,
  type TenantAccount,
  type UserStatus,
} from "@/types/auth";

const SESSION_STORAGE_KEY = "appli_auth_session_v1";
const CURRENT_AREA_STORAGE_KEY = "appli_auth_current_area_v1";
const LAST_LOGIN_EMAIL_STORAGE_KEY = "appli_auth_last_email_v1";

type AuthResult = {
  ok: boolean;
  message?: string;
};

type RegisterInput = {
  name: string;
  email: string;
  password: string;
};

type AuthContextValue = {
  loading: boolean;
  users: AuthUser[];
  pendingUsers: AuthUser[];
  currentUser: AuthUser | null;
  currentArea: BusinessArea;
  setCurrentArea: (area: BusinessArea) => void;
  rolePermissions: RolePermissions;
  roleAreaAccess: RoleAreaAccess;
  roleDashboardBlockAccess: RoleDashboardBlockAccess;
  login: (email: string, password: string) => Promise<AuthResult>;
  register: (input: RegisterInput) => Promise<AuthResult>;
  logout: () => void;
  updateUserStatus: (userId: string, status: UserStatus) => Promise<void>;
  updateUserRole: (userId: string, role: AppRole) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  toggleRolePageAccess: (role: AppRole, page: AppPageKey) => Promise<void>;
  toggleRoleAreaAccess: (role: AppRole, area: BusinessArea) => Promise<void>;
  toggleRoleDashboardBlockAccess: (role: AppRole, block: DashboardBlockKey) => Promise<void>;
  setAllRoleAccess: (role: AppRole, value: boolean) => Promise<void>;
  canAccess: (page: AppPageKey) => boolean;
  canAccessArea: (area: BusinessArea) => boolean;
  canAccessDashboardBlock: (block: DashboardBlockKey) => boolean;
  tenantAccounts: TenantAccount[];
  lastLoginEmail: string;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function mergePermissions(
  input: Partial<RolePermissions> | null | undefined,
): RolePermissions {
  if (!input) {
    return defaultRolePermissions;
  }

  return {
    Admin: { ...defaultRolePermissions.Admin, ...(input.Admin ?? {}) },
    User: { ...defaultRolePermissions.User, ...(input.User ?? {}) },
    "Team Lead": {
      ...defaultRolePermissions["Team Lead"],
      ...(input["Team Lead"] ?? {}),
    },
  };
}

function mergeAreaAccess(
  input: Partial<RoleAreaAccess> | null | undefined,
): RoleAreaAccess {
  if (!input) {
    return defaultRoleAreaAccess;
  }

  return {
    Admin: { ...defaultRoleAreaAccess.Admin, ...(input.Admin ?? {}) },
    User: { ...defaultRoleAreaAccess.User, ...(input.User ?? {}) },
    "Team Lead": {
      ...defaultRoleAreaAccess["Team Lead"],
      ...(input["Team Lead"] ?? {}),
    },
  };
}

function mergeDashboardBlockAccess(
  input: Partial<RoleDashboardBlockAccess> | null | undefined,
): RoleDashboardBlockAccess {
  if (!input) {
    return defaultRoleDashboardBlockAccess;
  }

  return {
    Admin: { ...defaultRoleDashboardBlockAccess.Admin, ...(input.Admin ?? {}) },
    User: { ...defaultRoleDashboardBlockAccess.User, ...(input.User ?? {}) },
    "Team Lead": {
      ...defaultRoleDashboardBlockAccess["Team Lead"],
      ...(input["Team Lead"] ?? {}),
    },
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [sessionUserId, setSessionUserId] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    return localStorage.getItem(SESSION_STORAGE_KEY);
  });
  const [rolePermissions, setRolePermissions] =
    useState<RolePermissions>(defaultRolePermissions);
  const [roleAreaAccess, setRoleAreaAccess] =
    useState<RoleAreaAccess>(defaultRoleAreaAccess);
  const [roleDashboardBlockAccess, setRoleDashboardBlockAccess] =
    useState<RoleDashboardBlockAccess>(defaultRoleDashboardBlockAccess);
  const [currentAreaState, setCurrentAreaState] = useState<BusinessArea>(() => {
    if (typeof window === "undefined") {
      return "b2b";
    }
    const raw = localStorage.getItem(CURRENT_AREA_STORAGE_KEY);
    return raw === "b2c" ? "b2c" : "b2b";
  });
  const [lastLoginEmail, setLastLoginEmail] = useState<string>(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return localStorage.getItem(LAST_LOGIN_EMAIL_STORAGE_KEY) ?? "";
  });
  const [loading, setLoading] = useState(true);
  const [tenantAccounts, setTenantAccounts] = useState<TenantAccount[]>([]);

  useEffect(() => {
    if (sessionUserId) {
      localStorage.setItem(SESSION_STORAGE_KEY, sessionUserId);
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }, [sessionUserId]);

  const currentUser = useMemo(
    () => users.find((user) => user.id === sessionUserId) ?? null,
    [users, sessionUserId],
  );
  const currentArea = useMemo<BusinessArea>(() => {
    if (!currentUser) {
      return currentAreaState;
    }

    if (roleAreaAccess[currentUser.role][currentAreaState]) {
      return currentAreaState;
    }

    if (roleAreaAccess[currentUser.role].b2b) {
      return "b2b";
    }

    if (roleAreaAccess[currentUser.role].b2c) {
      return "b2c";
    }

    return currentAreaState;
  }, [currentAreaState, currentUser, roleAreaAccess]);

  const setCurrentArea = useCallback(
    (area: BusinessArea) => {
      if (!currentUser) {
        setCurrentAreaState(area);
        return;
      }

      if (roleAreaAccess[currentUser.role][area]) {
        setCurrentAreaState(area);
      }
    },
    [currentUser, roleAreaAccess],
  );

  const pendingUsers = useMemo(
    () => users.filter((user) => user.status === "pending"),
    [users],
  );

  useEffect(() => {
    localStorage.setItem(CURRENT_AREA_STORAGE_KEY, currentArea);
  }, [currentArea]);

  useEffect(() => {
    localStorage.setItem(LAST_LOGIN_EMAIL_STORAGE_KEY, lastLoginEmail);
  }, [lastLoginEmail]);

  const applyStoreData = useCallback((data: AuthStoreData) => {
    setUsers(data.users);
    setRolePermissions(mergePermissions(data.rolePermissions));
    setRoleAreaAccess(mergeAreaAccess(data.roleAreaAccess));
    setRoleDashboardBlockAccess(mergeDashboardBlockAccess(data.roleDashboardBlockAccess));
    setTenantAccounts(data.tenantAccounts ?? []);
  }, []);

  const fetchState = useCallback(async () => {
    const response = await fetch("/api/auth", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load auth state: HTTP ${response.status}`);
    }
    const data = (await response.json()) as AuthStoreData;
    applyStoreData(data);
    setSessionUserId((prev) =>
      prev && data.users.some((user) => user.id === prev) ? prev : null,
    );
  }, [applyStoreData]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await fetchState();
      } catch {
        // Keep defaults in case API is temporarily unavailable.
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchState]);

  useEffect(() => {
    const pollId = window.setInterval(() => {
      void fetchState();
    }, 10000);

    return () => {
      window.clearInterval(pollId);
    };
  }, [fetchState]);

  const runAction = useCallback(
    async (payload: AuthApiActionRequest) => {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            message?: string;
            userId?: string;
            data?: AuthStoreData;
          }
        | null;

      if (!response.ok || !result?.ok) {
        return {
          ok: false,
          message: result?.message ?? `HTTP ${response.status}`,
          userId: result?.userId,
          data: result?.data,
        };
      }

      if (result.data) {
        applyStoreData(result.data);
      }

      return {
        ok: true,
        message: result.message,
        userId: result.userId,
        data: result.data,
      };
    },
    [applyStoreData],
  );

  const login = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      const normalizedEmail = email.trim().toLowerCase();
      const result = await runAction({
        action: "login",
        email: normalizedEmail,
        password,
      });
      if (!result.ok) {
        return { ok: false, message: result.message };
      }

      if (!result.userId) {
        return { ok: false, message: "Login failed" };
      }

      setSessionUserId(result.userId);
      setLastLoginEmail(normalizedEmail);
      return { ok: true };
    },
    [runAction],
  );

  const register = useCallback(
    async ({ name, email, password }: RegisterInput): Promise<AuthResult> => {
      const result = await runAction({
        action: "register",
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      });
      return {
        ok: result.ok,
        message:
          result.message ?? (result.ok ? "Registration submitted" : "Registration failed"),
      };
    },
    [runAction],
  );

  const logout = useCallback(() => {
    void runAction({ action: "logout" });
    setSessionUserId(null);
  }, [runAction]);

  const updateUserStatus = useCallback(
    async (userId: string, status: UserStatus) => {
      await runAction({ action: "updateUserStatus", userId, status });
    },
    [runAction],
  );

  const updateUserRole = useCallback(
    async (userId: string, role: AppRole) => {
      await runAction({ action: "updateUserRole", userId, role });
    },
    [runAction],
  );

  const toggleRolePageAccess = useCallback(
    async (role: AppRole, page: AppPageKey) => {
      await runAction({ action: "toggleRolePageAccess", role, page });
    },
    [runAction],
  );

  const toggleRoleAreaAccess = useCallback(
    async (role: AppRole, area: BusinessArea) => {
      await runAction({ action: "toggleRoleAreaAccess", role, area });
    },
    [runAction],
  );

  const setAllRoleAccess = useCallback(
    async (role: AppRole, value: boolean) => {
      await runAction({ action: "setAllRoleAccess", role, value });
    },
    [runAction],
  );

  const toggleRoleDashboardBlockAccess = useCallback(
    async (role: AppRole, block: DashboardBlockKey) => {
      await runAction({ action: "toggleRoleDashboardBlockAccess", role, block });
    },
    [runAction],
  );

  const deleteUser = useCallback(
    async (userId: string) => {
      await runAction({ action: "deleteUser", userId });
      setSessionUserId((prev) => (prev === userId ? null : prev));
    },
    [runAction],
  );

  const canAccessArea = useCallback(
    (area: BusinessArea) => {
      if (!currentUser || currentUser.status !== "approved") {
        return false;
      }
      return roleAreaAccess[currentUser.role][area];
    },
    [currentUser, roleAreaAccess],
  );

  const canAccess = useCallback(
    (page: AppPageKey) => {
      if (!currentUser || currentUser.status !== "approved") {
        return false;
      }
      if (currentUser.accountType === "client" && currentUser.tenantId) {
        const tenant = tenantAccounts.find((item) => item.id === currentUser.tenantId);
        if (page === "communications" && tenant?.clientPortalCommunicationsEnabled === false) {
          return false;
        }
        if (page === "financialCenter" && tenant?.clientPortalFinancialCenterEnabled === false) {
          return false;
        }
      }
      return rolePermissions[currentUser.role][page];
    },
    [currentUser, rolePermissions, tenantAccounts],
  );

  const canAccessDashboardBlock = useCallback(
    (block: DashboardBlockKey) => {
      if (!currentUser || currentUser.status !== "approved") {
        return false;
      }
      return roleDashboardBlockAccess[currentUser.role][block];
    },
    [currentUser, roleDashboardBlockAccess],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      users,
      pendingUsers,
      currentUser,
      currentArea,
      setCurrentArea,
      rolePermissions,
      roleAreaAccess,
      roleDashboardBlockAccess,
      login,
      register,
      logout,
      updateUserStatus,
      updateUserRole,
      deleteUser,
      toggleRolePageAccess,
      toggleRoleAreaAccess,
      toggleRoleDashboardBlockAccess,
      setAllRoleAccess,
      canAccess,
      canAccessArea,
      canAccessDashboardBlock,
      tenantAccounts,
      lastLoginEmail,
    }),
    [
      loading,
      users,
      pendingUsers,
      currentUser,
      currentArea,
      setCurrentArea,
      rolePermissions,
      roleAreaAccess,
      roleDashboardBlockAccess,
      login,
      register,
      logout,
      updateUserStatus,
      updateUserRole,
      deleteUser,
      toggleRolePageAccess,
      toggleRoleAreaAccess,
      toggleRoleDashboardBlockAccess,
      setAllRoleAccess,
      canAccess,
      canAccessArea,
      canAccessDashboardBlock,
      tenantAccounts,
      lastLoginEmail,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
