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
  type AppPageKey,
  type AppRole,
  type AuthUser,
  defaultRolePermissions,
  type RolePermissions,
  type UserStatus,
} from "@/types/auth";

const USERS_STORAGE_KEY = "appli_auth_users_v1";
const SESSION_STORAGE_KEY = "appli_auth_session_v1";
const PERMISSIONS_STORAGE_KEY = "appli_auth_permissions_v1";
const DEFAULT_ADMIN_EMAIL = "ig-kuznetsov@yandex-team.ru";
const DEFAULT_ADMIN_PASSWORD = "123";
const DEFAULT_ADMIN_NAME = "Igor Kuznetsov";

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
  rolePermissions: RolePermissions;
  login: (email: string, password: string) => AuthResult;
  register: (input: RegisterInput) => AuthResult;
  logout: () => void;
  updateUserStatus: (userId: string, status: UserStatus) => void;
  updateUserRole: (userId: string, role: AppRole) => void;
  toggleRolePageAccess: (role: AppRole, page: AppPageKey) => void;
  setAllRoleAccess: (role: AppRole, value: boolean) => void;
  canAccess: (page: AppPageKey) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function mergePermissions(
  input: Partial<RolePermissions> | null | undefined,
): RolePermissions {
  if (!input) {
    return defaultRolePermissions;
  }

  const next: RolePermissions = {
    Admin: { ...defaultRolePermissions.Admin, ...(input.Admin ?? {}) },
    User: { ...defaultRolePermissions.User, ...(input.User ?? {}) },
    "Team Lead": {
      ...defaultRolePermissions["Team Lead"],
      ...(input["Team Lead"] ?? {}),
    },
  };

  return next;
}

function seedDefaultUsers() {
  return [
    {
      id: "user-admin-1",
      name: DEFAULT_ADMIN_NAME,
      email: DEFAULT_ADMIN_EMAIL,
      password: DEFAULT_ADMIN_PASSWORD,
      role: "Admin" as const,
      status: "approved" as const,
      createdAt: new Date().toISOString(),
    },
  ];
}

function ensureDefaultAdmin(users: AuthUser[]) {
  const existingAdminIndex = users.findIndex(
    (user) => user.email.toLowerCase() === DEFAULT_ADMIN_EMAIL.toLowerCase(),
  );

  if (existingAdminIndex >= 0) {
    return users.map((user, index) =>
      index === existingAdminIndex
        ? {
            ...user,
            name: DEFAULT_ADMIN_NAME,
            password: DEFAULT_ADMIN_PASSWORD,
            role: "Admin" as const,
            status: "approved" as const,
          }
        : user,
    );
  }

  return [
    ...users,
    {
      id: "user-admin-1",
      name: DEFAULT_ADMIN_NAME,
      email: DEFAULT_ADMIN_EMAIL,
      password: DEFAULT_ADMIN_PASSWORD,
      role: "Admin" as const,
      status: "approved" as const,
      createdAt: new Date().toISOString(),
    },
  ];
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<AuthUser[]>(() => {
    if (typeof window === "undefined") {
      return seedDefaultUsers();
    }

    const usersRaw = localStorage.getItem(USERS_STORAGE_KEY);
    if (!usersRaw) {
      const seeded = seedDefaultUsers();
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }

    try {
      return ensureDefaultAdmin(JSON.parse(usersRaw) as AuthUser[]);
    } catch {
      const seeded = seedDefaultUsers();
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
  });

  const [sessionUserId, setSessionUserId] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    return localStorage.getItem(SESSION_STORAGE_KEY);
  });

  const [rolePermissions, setRolePermissions] = useState<RolePermissions>(() => {
    if (typeof window === "undefined") {
      return defaultRolePermissions;
    }

    const permissionsRaw = localStorage.getItem(PERMISSIONS_STORAGE_KEY);
    if (!permissionsRaw) {
      return defaultRolePermissions;
    }

    try {
      return mergePermissions(
        JSON.parse(permissionsRaw) as Partial<RolePermissions>,
      );
    } catch {
      return defaultRolePermissions;
    }
  });
  const loading = false;

  useEffect(() => {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    if (sessionUserId) {
      localStorage.setItem(SESSION_STORAGE_KEY, sessionUserId);
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }, [sessionUserId]);

  useEffect(() => {
    const merged = mergePermissions(rolePermissions);
    localStorage.setItem(PERMISSIONS_STORAGE_KEY, JSON.stringify(merged));
  }, [rolePermissions]);

  const currentUser = useMemo(
    () => users.find((user) => user.id === sessionUserId) ?? null,
    [users, sessionUserId],
  );

  const pendingUsers = useMemo(
    () => users.filter((user) => user.status === "pending"),
    [users],
  );

  const login = useCallback(
    (email: string, password: string): AuthResult => {
      const user = users.find(
        (item) => item.email.toLowerCase() === email.toLowerCase(),
      );

      if (!user || user.password !== password) {
        return { ok: false, message: "Invalid email or password" };
      }

      if (user.status === "pending") {
        return {
          ok: false,
          message: "Your account is pending approval by an admin",
        };
      }

      if (user.status === "rejected") {
        return {
          ok: false,
          message: "Your account access was rejected by an admin",
        };
      }

      setSessionUserId(user.id);
      return { ok: true };
    },
    [users],
  );

  const register = useCallback(
    ({ name, email, password }: RegisterInput): AuthResult => {
      const exists = users.some(
        (item) => item.email.toLowerCase() === email.toLowerCase(),
      );

      if (exists) {
        return { ok: false, message: "User with this email already exists" };
      }

      const nextUser: AuthUser = {
        id: `user-${crypto.randomUUID()}`,
        name,
        email,
        password,
        role: "User",
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      setUsers((prev) => [...prev, nextUser]);
      return { ok: true, message: "Registration sent for admin approval" };
    },
    [users],
  );

  const logout = useCallback(() => {
    setSessionUserId(null);
  }, []);

  const updateUserStatus = useCallback((userId: string, status: UserStatus) => {
    setUsers((prev) =>
      prev.map((user) => (user.id === userId ? { ...user, status } : user)),
    );
  }, []);

  const updateUserRole = useCallback((userId: string, role: AppRole) => {
    setUsers((prev) =>
      prev.map((user) => (user.id === userId ? { ...user, role } : user)),
    );
  }, []);

  const toggleRolePageAccess = useCallback((role: AppRole, page: AppPageKey) => {
    setRolePermissions((prev) => ({
      ...prev,
      [role]: {
        ...prev[role],
        [page]: !prev[role][page],
      },
    }));
  }, []);

  const setAllRoleAccess = useCallback((role: AppRole, value: boolean) => {
    setRolePermissions((prev) => ({
      ...prev,
      [role]: {
        dashboard: value,
        clients: value,
        orders: value,
        preOrders: value,
        priceCalculator: value,
        accesses: value,
      },
    }));
  }, []);

  const canAccess = useCallback(
    (page: AppPageKey) => {
      if (!currentUser || currentUser.status !== "approved") {
        return false;
      }
      return rolePermissions[currentUser.role][page];
    },
    [currentUser, rolePermissions],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      users,
      pendingUsers,
      currentUser,
      rolePermissions,
      login,
      register,
      logout,
      updateUserStatus,
      updateUserRole,
      toggleRolePageAccess,
      setAllRoleAccess,
      canAccess,
    }),
    [
      loading,
      users,
      pendingUsers,
      currentUser,
      rolePermissions,
      login,
      register,
      logout,
      updateUserStatus,
      updateUserRole,
      toggleRolePageAccess,
      setAllRoleAccess,
      canAccess,
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
