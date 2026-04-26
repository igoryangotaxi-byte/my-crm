import * as XLSX from "xlsx";

const SAMPLE_FILE_NAME = "request-rides-bulk-upload-example.xlsx";

/** Builds a minimal .xlsx matching `parseXlsxRidesFile` column layout (A–M) and triggers a browser download. */
export function downloadBulkUploadSampleXlsx(): void {
  const rows: string[][] = [
    [
      "Date & time (A)",
      "Phone (B)",
      "Comment (C)",
      "Pickup (D)",
      "Stop / destination (E)",
      "Address (F)",
      "Address (G)",
      "Address (H)",
      "Phone for D (I)",
      "Phone for E (J)",
      "Phone for F (K)",
      "Phone for G (L)",
      "Phone for H (M)",
    ],
    [
      "27.04.2026 09:30",
      "+972501234567",
      "Big suitcase, ring the bell",
      "Tel Aviv, Rothschild 1",
      "Tel Aviv, Dizengoff Center",
      "",
      "",
      "",
      "",
      "+972501234567",
      "",
      "",
      "",
    ],
    [
      "27.04.2026 11:15",
      "+972527654321",
      "",
      "רחוב הירקון 1, תל אביב",
      "דיזנגוף סנטר, תל אביב",
      "אלנבי 50, תל אביב",
      "",
      "",
      "",
      "+972527654321",
      "+972500000001",
      "",
      "",
    ],
    [
      "28.04.2026 07:00",
      "+79123456789",
      "VIP",
      "Москва, Тверская 1",
      "Шереметьево, терминал D",
      "",
      "",
      "",
      "",
      "+79123456789",
      "",
      "",
      "",
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 20 },
    { wch: 16 },
    { wch: 26 },
    { wch: 28 },
    { wch: 28 },
    { wch: 28 },
    { wch: 28 },
    { wch: 28 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Rides");
  XLSX.writeFile(wb, SAMPLE_FILE_NAME);
}
