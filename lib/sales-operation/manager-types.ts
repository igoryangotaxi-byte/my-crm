export type ManagerAssignment = {
  userId: string | null;
  name: string | null;
};

export type B2BClientRegistryEntry = {
  corpClientId: string;
  clientName: string;
  accountManager: ManagerAssignment;
  salesManager: ManagerAssignment;
};

export type UpdateB2BClientManagersInput = {
  accountManagerUserId?: string | null;
  accountManagerName?: string | null;
  salesManagerUserId?: string | null;
  salesManagerName?: string | null;
};

export type UpdateSalesClientInput = {
  corpClientId?: string | null;
  accountManagerUserId?: string | null;
  accountManagerName?: string | null;
  salesManagerUserId?: string | null;
  salesManagerName?: string | null;
};

export type ManagerPortfolioClientRow = {
  corpClientId: string;
  clientName: string;
  requests: number;
  trips: number;
  gmv: number;
  decoupling: number;
  decouplingRate: number;
};

export type ManagerPortfolioSummary = {
  role: "account" | "sales";
  managerUserId: string;
  managerName: string;
  from: string;
  to: string;
  clientCount: number;
  requests: number;
  trips: number;
  gmv: number;
  decoupling: number;
  decouplingRate: number;
  clients: ManagerPortfolioClientRow[];
};
