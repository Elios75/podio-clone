import { parseCsv } from "@/lib/csv";

export function isExcelFile(name: string) {
  return /\.(xlsx|xls)$/i.test(name);
}

/** Read a CSV or Excel file into a uniform string[][] (first row = headers). */
export async function readTabular(file: File): Promise<string[][]> {
  if (isExcelFile(file.name)) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json<any[]>(sheet, {
      header: 1,
      raw: false, // formatted strings (dates come out as displayed)
      defval: "",
    });
    return aoa.map((row) => row.map((c) => (c == null ? "" : String(c))));
  }
  const text = await file.text();
  return parseCsv(text);
}

/** Build an .xlsx workbook from rows and trigger a download. */
export async function downloadXlsx(filename: string, rows: string[][], sheetName = "Export") {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}
