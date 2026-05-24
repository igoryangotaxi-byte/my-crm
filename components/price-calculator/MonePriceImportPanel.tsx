"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MoneImportHistoryItem, MoneImportParseResponse } from "@/lib/driver-price-comparison/types";

type Step = "upload" | "mapping" | "done";

type MonePriceImportPanelProps = {
  onImportComplete?: () => void;
};

export function MonePriceImportPanel({ onImportComplete }: MonePriceImportPanelProps) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<MoneImportParseResponse | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    totalRows: number;
    importedRows: number;
    skippedRows: number;
    errorRows: number;
    matchedRows: number;
    unmatchedRows: number;
    invalidRows: number;
    duplicateRowsInFile: number;
    rematchedRows: number;
    gpOrdersInCrm: number;
    errors: Array<{ rowIndex: number; message: string }>;
  } | null>(null);
  const [history, setHistory] = useState<MoneImportHistoryItem[]>([]);
  const [coverage, setCoverage] = useState<{
    totalTaxiOrders: number;
    lastSyncAt: string | null;
  } | null>(null);

  const loadHistory = useCallback(async () => {
    const response = await fetch("/api/price-calculator/mone-prices/imports", { cache: "no-store" });
    const payload = (await response.json()) as { ok?: boolean; imports?: MoneImportHistoryItem[] };
    if (payload.ok && payload.imports) {
      setHistory(payload.imports);
    }
  }, []);

  const loadCoverage = useCallback(async () => {
    const response = await fetch("/api/price-calculator/driver-price-comparison/status", {
      cache: "no-store",
    });
    const payload = (await response.json()) as {
      ok?: boolean;
      coverage?: { totalTaxiOrders: number };
      lastSyncAt?: string | null;
    };
    if (payload.ok && payload.coverage) {
      setCoverage({
        totalTaxiOrders: payload.coverage.totalTaxiOrders,
        lastSyncAt: payload.lastSyncAt ?? null,
      });
    }
  }, []);

  useEffect(() => {
    void loadHistory();
    void loadCoverage();
  }, [loadHistory, loadCoverage]);

  const mappingFields = useMemo(
    () => ["order_id", "mone_price", "order_date", "actual_km", "actual_minutes", "driver_price_with_vat"],
    [],
  );

  async function handleParse(selected: File) {
    setLoading(true);
    setError(null);
    setFile(selected);
    const formData = new FormData();
    formData.append("file", selected);
    try {
      const response = await fetch("/api/price-calculator/mone-prices/parse", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as MoneImportParseResponse & { error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to parse file.");
      }
      setParseResult(payload);
      setColumnMapping(payload.suggestedMapping);
      setStep("mapping");
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "Failed to parse file.");
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!file) return;
    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("columnMapping", JSON.stringify(columnMapping));
    try {
      const response = await fetch("/api/price-calculator/mone-prices/import", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        totalRows?: number;
        importedRows?: number;
        skippedRows?: number;
        errorRows?: number;
        matchedRows?: number;
        unmatchedRows?: number;
        invalidRows?: number;
        duplicateRowsInFile?: number;
        rematchedRows?: number;
        gpOrdersInCrm?: number;
        errors?: Array<{ rowIndex: number; message: string }>;
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Import failed.");
      }
      setImportResult({
        totalRows: payload.totalRows ?? 0,
        importedRows: payload.importedRows ?? 0,
        skippedRows: payload.skippedRows ?? 0,
        errorRows: payload.errorRows ?? 0,
        matchedRows: payload.matchedRows ?? payload.importedRows ?? 0,
        unmatchedRows: payload.unmatchedRows ?? payload.skippedRows ?? 0,
        invalidRows: payload.invalidRows ?? payload.errorRows ?? 0,
        duplicateRowsInFile: payload.duplicateRowsInFile ?? 0,
        rematchedRows: payload.rematchedRows ?? 0,
        gpOrdersInCrm: payload.gpOrdersInCrm ?? 0,
        errors: payload.errors ?? [],
      });
      setStep("done");
      await loadHistory();
      await loadCoverage();
      onImportComplete?.();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Import failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Import taxitariff.co.il mone prices</h2>
        <p className="mt-1 text-sm text-slate-600">
          Файл с taxitariff.co.il — отдельно от GP. Все валидные строки сохраняются; в дашборде сравнения
          попадают только те, у которых order_id найден среди поездок, загруженных в CRM из Greenplum.
        </p>
      </div>

      {coverage !== null && coverage.totalTaxiOrders === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">В CRM пока нет поездок из Greenplum</p>
          <p className="mt-1">
            Mone-цены сохранятся, но сравнение появится после загрузки GP-данных в CRM (ваш обычный импорт).
          </p>
        </div>
      ) : coverage !== null ? (
        <p className="text-xs text-slate-500">
          {coverage.totalTaxiOrders.toLocaleString()} поездок из GP в CRM
          {coverage.lastSyncAt
            ? ` · last sync ${new Date(coverage.lastSyncAt).toLocaleString()}`
            : ""}
        </p>
      ) : null}

      {step === "upload" ? (
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-8 text-center">
          <span className="text-sm font-medium text-slate-800">Drop CSV / XLSX here or click to browse</span>
          <span className="mt-1 text-xs text-slate-500">Primary key: order_id. Fallback matching uses date, km, min, driver price.</span>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(event) => {
              const selected = event.target.files?.[0];
              if (selected) void handleParse(selected);
            }}
          />
        </label>
      ) : null}

      {step === "mapping" && parseResult ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            File: <span className="font-medium">{parseResult.fileName}</span> · {parseResult.totalRows} rows
          </p>
          {parseResult.validationErrors.length ? (
            <ul className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {parseResult.validationErrors.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          {parseResult.taxiOrdersCount !== undefined ? (
            <div
              className={`rounded-xl px-3 py-2 text-xs ${
                parseResult.taxiOrdersCount === 0 ||
                (parseResult.estimatedOrderIdMatches ?? 0) === 0
                  ? "bg-amber-50 text-amber-900"
                   : "bg-slate-50 text-slate-700"
              }`}
            >
              {parseResult.taxiOrdersCount === 0 ? (
                <p>В CRM нет поездок из GP — mone сохранится, сравнение появится после загрузки GP.</p>
              ) : (
                <p>
                  Ожидаемое совпадение order_id: {parseResult.estimatedOrderIdMatches ?? 0} / {parseResult.totalRows}{" "}
                  (в CRM {parseResult.taxiOrdersCount.toLocaleString()} поездок из GP)
                </p>
              )}
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {mappingFields.map((field) => (
              <label key={field} className="block text-sm">
                <span className="mb-1 block font-medium text-slate-800">{field}</span>
                <select
                  className="crm-input h-10 w-full px-2 text-sm"
                  value={columnMapping[field] ?? ""}
                  onChange={(event) =>
                    setColumnMapping((prev) => ({
                      ...prev,
                      [field]: event.target.value || null,
                    }))
                  }
                >
                  <option value="">— not mapped —</option>
                  {parseResult.headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  {parseResult.headers.map((header) => (
                    <th key={header} className="px-2 py-2 font-medium">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parseResult.previewRows.map((row, index) => (
                  <tr key={index} className="border-t border-slate-100">
                    {parseResult.headers.map((header) => (
                      <td key={header} className="px-2 py-1.5 text-slate-800">
                        {row[header] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="crm-button-primary px-4 py-2 text-sm" disabled={loading} onClick={() => void handleImport()}>
              {loading ? "Importing…" : "Import rows"}
            </button>
            <button
              type="button"
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700"
              onClick={() => {
                setStep("upload");
                setParseResult(null);
                setFile(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {step === "done" && importResult ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            importResult.importedRows > 0
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          <p className="font-semibold">
            {importResult.importedRows > 0 ? "Импорт завершён" : "Импорт завершён без совпадений с CRM"}
          </p>
          <p className="mt-1">Строк в файле: {importResult.totalRows}</p>
          <p>В дашборде сравнения: {importResult.matchedRows}</p>
          <p>Сохранено без пары в CRM: {importResult.unmatchedRows}</p>
          {importResult.duplicateRowsInFile > 0 ? (
            <p>Дубликаты order_id в файле (оставлена 1 строка): {importResult.duplicateRowsInFile}</p>
          ) : null}
          {importResult.invalidRows > 0 ? <p>Невалидная mone_price: {importResult.invalidRows}</p> : null}
          {importResult.rematchedRows > 0 ? (
            <p>Дополнительно сматчено из прошлых импортов: {importResult.rematchedRows}</p>
          ) : null}
          {importResult.unmatchedRows > 0 ? (
            <p className="mt-2 text-xs">
              {importResult.unmatchedRows} строк — order_id нет среди {importResult.gpOrdersInCrm.toLocaleString()}{" "}
              поездок в CRM. Загрузите недостающие поездки из GP и повторите импорт (или загрузите файл снова — старые
              unmatched пересматчатся автоматически).
            </p>
          ) : null}
          {importResult.errors.length ? (
            <ul className="mt-2 max-h-32 overflow-y-auto rounded-lg bg-white/60 px-2 py-1.5 text-xs">
              {importResult.errors.slice(0, 5).map((item) => (
                <li key={`${item.rowIndex}-${item.message}`}>
                  Row {item.rowIndex}: {item.message}
                </li>
              ))}
              {importResult.errors.length > 5 ? (
                <li>…and {importResult.errors.length - 5} more similar errors</li>
              ) : null}
            </ul>
          ) : null}
          <button
            type="button"
            className={`mt-3 rounded-xl border px-3 py-1.5 text-xs font-medium ${
              importResult.importedRows > 0 ? "border-emerald-300" : "border-amber-300"
            }`}
            onClick={() => {
              setStep("upload");
              setImportResult(null);
              setParseResult(null);
              setFile(null);
            }}
          >
            Upload another file
          </button>
        </div>
      ) : null}

      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {history.length ? (
        <details className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-slate-800">Import history</summary>
          <ul className="mt-2 space-y-2 text-xs text-slate-700">
            {history.map((item) => (
              <li key={item.id} className="rounded-lg bg-slate-50 px-2 py-1.5">
                {item.fileName} · {new Date(item.uploadedAt).toLocaleString()} · imported {item.importedRows}/
                {item.totalRows} · skipped {item.skippedRows}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
