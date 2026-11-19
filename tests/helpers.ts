/**
 * Test helpers: an in-memory PluginContext stand-in.
 *
 * Implements the SettingsAccess / KVAccess / HttpAccess / LogAccess /
 * CronAccess slices the refresh engine uses, backed by Maps, plus a
 * controllable fetch implementation and call recording.
 */

import type { RefreshContext } from "../src/refresh.js";
import type { FetchImpl } from "../src/bluesky.js";

export interface FakeCtx extends RefreshContext {
  settingsStore: Map<string, unknown>;
  kvStore: Map<string, unknown>;
  fetchCalls: string[];
  cronCalls: Array<{ name: string; schedule: string }>;
  cancelled: string[];
  logLines: Array<{ level: string; message: string }>;
}

export function makeCtx(options: {
  settings?: Record<string, unknown>;
  kv?: Record<string, unknown>;
  fetchImpl?: FetchImpl;
  withCron?: boolean;
} = {}): FakeCtx {
  const settingsStore = new Map<string, unknown>(Object.entries(options.settings ?? {}));
  const kvStore = new Map<string, unknown>(Object.entries(options.kv ?? {}));
  const fetchCalls: string[] = [];
  const cronCalls: Array<{ name: string; schedule: string }> = [];
  const cancelled: string[] = [];
  const logLines: Array<{ level: string; message: string }> = [];

  const fetchImpl: FetchImpl =
    options.fetchImpl ??
    (async () => new Response("{}", { status: 404, headers: { "content-type": "application/json" } }));

  const log = {
    debug: (message: string) => logLines.push({ level: "debug", message }),
    info: (message: string) => logLines.push({ level: "info", message }),
    warn: (message: string) => logLines.push({ level: "warn", message }),
    error: (message: string) => logLines.push({ level: "error", message }),
  };

  const storeAccess = (store: Map<string, unknown>) => ({
    get: async <T,>(key: string): Promise<T | null> =>
      (store.has(key) ? (store.get(key) as T) : null),
    getVersioned: async <T,>(key: string) =>
      store.has(key)
        ? { value: store.get(key) as T, revision: "r1", updatedAt: new Date().toISOString() }
        : null,
    compareAndSet: async () => ({ applied: true, revision: "r2" }),
    compareAndDelete: async () => ({ applied: true }),
    set: async (key: string, value: unknown) => {
      store.set(key, value);
    },
    delete: async (key: string) => store.delete(key),
    list: async (prefix = "") =>
      [...store.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ key, value })),
  });

  return {
    settingsStore,
    kvStore,
    fetchCalls,
    cronCalls,
    cancelled,
    logLines,
    settings: storeAccess(settingsStore),
    kv: storeAccess(kvStore),
    http: {
      fetch: async (url: string, init?: RequestInit) => {
        fetchCalls.push(url);
        return fetchImpl(url, init);
      },
    },
    log,
    cron: options.withCron
      ? {
          schedule: async (name: string, opts: { schedule: string }) => {
            cronCalls.push({ name, schedule: opts.schedule });
          },
          cancel: async (name: string) => {
            cancelled.push(name);
          },
          list: async () => cronCalls.map((c) => ({ name: c.name, schedule: c.schedule, nextRunAt: null as string | null })),
        }
      : undefined,
  };
}

/** JSON Response helper for mock fetches. */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
