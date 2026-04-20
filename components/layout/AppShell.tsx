"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [isSidebarHidden, setIsSidebarHidden] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      {isSidebarHidden ? null : <Sidebar />}

      <div className="flex min-h-screen flex-1 flex-col">
        <Header onToggleSidebar={() => setIsSidebarHidden((prev) => !prev)} />
        <main className="flex-1 p-5 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
