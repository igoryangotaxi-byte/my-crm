import { AsyncLocalStorage } from "node:async_hooks";

type AuthKvRequestContext = {
  /** True when this request loaded the auth KV snapshot successfully (incl. fresh 30s cache hit). */
  kvReadSucceeded: boolean;
};

const storage = new AsyncLocalStorage<AuthKvRequestContext>();

export function runWithAuthKvRequestContext<T>(fn: () => T): T {
  return storage.run({ kvReadSucceeded: false }, fn);
}

export async function runWithAuthKvRequestContextAsync<T>(fn: () => Promise<T>): Promise<T> {
  return storage.run({ kvReadSucceeded: false }, fn);
}

export function markAuthKvReadSucceededInRequest(): void {
  const ctx = storage.getStore();
  if (ctx) {
    ctx.kvReadSucceeded = true;
  }
}

export function getAuthKvReadSucceededInRequest(): boolean {
  return storage.getStore()?.kvReadSucceeded ?? false;
}

export function isInAuthKvRequestContext(): boolean {
  return storage.getStore() !== undefined;
}

export function resetAuthKvRequestContextForTests(): void {
  const ctx = storage.getStore();
  if (ctx) {
    ctx.kvReadSucceeded = false;
  }
}
