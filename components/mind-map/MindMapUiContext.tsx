"use client";

import { createContext, useContext } from "react";

export type MindMapUiHandlers = {
  openLinkPreview: (url: string) => void;
};

const MindMapUiContext = createContext<MindMapUiHandlers | null>(null);

export function MindMapUiProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: MindMapUiHandlers;
}) {
  return <MindMapUiContext.Provider value={value}>{children}</MindMapUiContext.Provider>;
}

export function useMindMapUi(): MindMapUiHandlers | null {
  return useContext(MindMapUiContext);
}
