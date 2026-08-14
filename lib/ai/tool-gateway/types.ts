export type ToolRun = {
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
  args: Record<string, unknown>;
  confirmed?: boolean;
};
