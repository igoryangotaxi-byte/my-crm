"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

type MapRow = {
  id: string;
  title: string;
  updated_at: string;
  created_at: string;
  created_by: string;
};

export default function MindMapListPage() {
  const t = useTranslations("mindMap");
  const [maps, setMaps] = useState<MapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/mind-maps", {
        cache: "no-store",
        credentials: "include",
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        maps?: MapRow[];
        error?: string;
      };
      if (!res.ok || !json?.ok) {
        const detail = json?.error?.trim();
        setError(
          res.status === 401
            ? t("errorUnauthorized")
            : detail
              ? `${t("listLoadError")} (${detail})`
              : t("listLoadError"),
        );
        return;
      }
      setMaps(json.maps ?? []);
    } catch {
      setError(t("listLoadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const createMap = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/mind-maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: t("defaultTitle") }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        map?: { id?: string };
        error?: string;
      };
      if (!res.ok || !json?.ok || !json.map?.id) {
        const detail = json?.error?.trim();
        if (res.status === 401) {
          setError(t("errorUnauthorized"));
          return;
        }
        setError(
          detail
            ? `${t("createFailed")} (${detail})`
            : `${t("createFailed")} (HTTP ${res.status})`,
        );
        return;
      }
      const target = `/notes/mind-map/${json.map.id}`;
      window.location.assign(target);
    } catch {
      setError(t("createFailed"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="crm-page flex flex-col gap-6">
      <div className="crm-instant-visible relative z-10 flex flex-wrap items-center justify-between gap-3 pointer-events-auto">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{t("listTitle")}</h1>
          <p className="mt-1 text-sm text-muted">{t("listSubtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/notes"
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10"
          >
            {t("backToNotes")}
          </Link>
          <button
            type="button"
            disabled={creating}
            className="crm-button-primary rounded-xl px-4 py-2 text-sm font-medium disabled:pointer-events-none disabled:opacity-60"
            onClick={() => void createMap()}
          >
            {creating ? t("creating") : t("createMap")}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted">{t("loading")}</p>
      ) : maps.length === 0 ? (
        <p className="text-sm text-muted">{t("emptyList")}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {maps.map((m) => (
            <li key={m.id}>
              <Link
                href={`/notes/mind-map/${m.id}`}
                className="block rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm transition hover:border-white/20 hover:bg-white/10"
              >
                <div className="font-medium">{m.title || t("untitled")}</div>
                <div className="mt-2 text-xs text-muted">
                  {t("updated")}{" "}
                  {new Date(m.updated_at).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
