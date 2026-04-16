import { useState, useRef, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, X, Download } from "lucide-react";
import { useProducts, useWarehouses, useStockLevels, useAddStockMovement } from "@/hooks/useStockData";
import { toast } from "sonner";

interface ParsedRow {
  rowNum: number;
  item_code: string;
  warehouse_name: string;
  quantity: number;
  product_id?: string;
  warehouse_id?: string;
  error?: string;
}

type UploadState = "idle" | "parsed" | "uploading" | "done";

export default function SalesClearance() {
  const { data: products } = useProducts();
  const { data: warehouses } = useWarehouses();
  const { data: stockLevels } = useStockLevels();
  const addMovement = useAddStockMovement();

  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState("");

  const productMap = useMemo(() => {
    const m = new Map<string, string>();
    products?.forEach((p: any) => m.set(p.item_code?.trim().toLowerCase(), p.id));
    return m;
  }, [products]);

  const warehouseMap = useMemo(() => {
    const m = new Map<string, string>();
    warehouses?.forEach((w: any) => m.set(w.warehouse_name?.trim().toLowerCase(), w.id));
    return m;
  }, [warehouses]);

  const stockMap = useMemo(() => {
    const m = new Map<string, number>();
    stockLevels?.forEach((s: any) => {
      const key = `${s.product_id}_${s.warehouse_id}`;
      m.set(key, s.current_stock ?? 0);
    });
    return m;
  }, [stockLevels]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target?.result, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      const parsed: ParsedRow[] = [];
      // Track cumulative deductions per product+warehouse to catch duplicates in same file
      const cumulativeDeductions = new Map<string, number>();

      json.forEach((row, idx) => {
        const itemCode = String(row["Item Code"] ?? row["item_code"] ?? row["ItemCode"] ?? row["ITEM CODE"] ?? "").trim();
        const whName = String(row["Warehouse"] ?? row["warehouse"] ?? row["Warehouse Name"] ?? row["WAREHOUSE"] ?? "").trim();
        const qtyRaw = row["Quantity"] ?? row["quantity"] ?? row["QTY"] ?? row["Qty"] ?? row["qty"] ?? "";
        const qty = parseInt(String(qtyRaw));

        if (!itemCode) return;

        const entry: ParsedRow = { rowNum: idx + 2, item_code: itemCode, warehouse_name: whName, quantity: qty };

        const pid = productMap.get(itemCode.toLowerCase());
        const wid = warehouseMap.get(whName.toLowerCase());

        if (!pid) {
          entry.error = "Product not found";
        } else if (!wid) {
          entry.error = "Warehouse not found";
        } else if (!qty || qty <= 0) {
          entry.error = "Invalid quantity";
        } else {
          const key = `${pid}_${wid}`;
          const currentStock = stockMap.get(key) ?? 0;
          const alreadyDeducted = cumulativeDeductions.get(key) ?? 0;
          const available = currentStock - alreadyDeducted;

          if (qty > available) {
            entry.error = `Insufficient stock: available ${available}, requested ${qty}`;
          } else {
            entry.product_id = pid;
            entry.warehouse_id = wid;
            cumulativeDeductions.set(key, alreadyDeducted + qty);
          }
        }

        parsed.push(entry);
      });

      setRows(parsed);
      setState("parsed");
    };
    reader.readAsArrayBuffer(file);
  };

  const validRows = rows.filter((r) => !r.error);
  const errorRows = rows.filter((r) => !!r.error);

  const handleUpload = async () => {
    if (validRows.length === 0) return;
    setState("uploading");
    setProgress(0);

    const batchId = crypto.randomUUID();
    let done = 0;

    for (const row of validRows) {
      try {
        await addMovement.mutateAsync({
          product_id: row.product_id!,
          warehouse_id: row.warehouse_id!,
          movement_type: "OUT",
          quantity: row.quantity,
          reference_note: `End of day sales clearing from ${fileName}`,
          batch_id: batchId,
        });
      } catch (err: any) {
        toast.error(`Row ${row.rowNum}: ${err.message}`);
      }
      done++;
      setProgress(Math.round((done / validRows.length) * 100));
    }

    setState("done");
    toast.success(`Processed ${done} sales entries`);
  };

  const reset = () => {
    setRows([]);
    setState("idle");
    setProgress(0);
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const downloadTemplate = useCallback(() => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Item Code", "Warehouse", "Quantity"],
      ["ITEM-001", "Main Warehouse", 10],
      ["ITEM-002", "Main Warehouse", 5],
    ]);
    ws["!cols"] = [{ wch: 20 }, { wch: 25 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, "Sales Clearing");
    XLSX.writeFile(wb, "sales_clearing_template.xlsx");
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground/70 font-mono mb-1">End of Day</p>
          <h1 className="text-2xl font-semibold tracking-tight">Sales Clearing</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload an Excel file of items sold to deduct from current stock. Columns:{" "}
            <span className="font-mono text-xs">Item Code</span>,{" "}
            <span className="font-mono text-xs">Warehouse</span>,{" "}
            <span className="font-mono text-xs">Quantity</span>
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={downloadTemplate}>
          <Download className="h-4 w-4" />
          Download Template
        </Button>
      </div>

      {state === "idle" && (
        <label className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-destructive/30 bg-destructive/5 p-12 cursor-pointer hover:border-destructive/50 hover:bg-destructive/10 transition-all">
          <Upload className="h-10 w-10 text-destructive/60" />
          <span className="text-sm text-muted-foreground">Click to select an Excel file (.xlsx, .xls)</span>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFile}
          />
        </label>
      )}

      {state !== "idle" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 px-4 py-3 bg-destructive/10 rounded-xl border border-destructive/30">
            <FileSpreadsheet className="h-5 w-5 text-destructive" />
            <span className="text-sm font-mono flex-1">{fileName}</span>
            {state === "parsed" && (
              <Button variant="ghost" size="sm" onClick={reset} className="h-7 w-7 p-0">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="flex gap-4">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-stock-in" />
              <span className="font-mono">{validRows.length}</span> valid
            </div>
            {errorRows.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-stock-transfer" />
                <span className="font-mono">{errorRows.length}</span> errors
              </div>
            )}
          </div>

          {errorRows.length > 0 && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-destructive">Rows with errors (will be skipped)</p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {errorRows.map((r) => (
                  <p key={r.rowNum} className="text-xs font-mono">
                    Row {r.rowNum}: <span className="text-muted-foreground">{r.item_code}</span> — {r.error}
                  </p>
                ))}
              </div>
            </div>
          )}

          {validRows.length > 0 && (
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 sticky top-0">
                    <tr className="border-b border-border/60">
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider font-mono">Row</th>
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider font-mono">Item Code</th>
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider">Warehouse</th>
                      <th className="px-4 py-2 text-right text-[11px] uppercase tracking-wider font-mono">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validRows.slice(0, 50).map((r) => (
                      <tr key={r.rowNum} className="border-b border-border/60 last:border-b-0">
                        <td className="px-4 py-1.5 text-xs text-muted-foreground font-mono">{r.rowNum}</td>
                        <td className="px-4 py-1.5 font-mono text-sm">{r.item_code}</td>
                        <td className="px-4 py-1.5 text-sm">{r.warehouse_name}</td>
                        <td className="px-4 py-1.5 text-sm font-mono text-right font-semibold text-destructive">{r.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {validRows.length > 50 && (
                <p className="text-xs text-muted-foreground px-4 py-2 bg-muted/20">
                  Showing 50 of {validRows.length} rows
                </p>
              )}
            </div>
          )}

          {state === "uploading" && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground font-mono text-center">{progress}%</p>
            </div>
          )}

          <div className="flex gap-3">
            {state === "parsed" && validRows.length > 0 && (
              <Button onClick={handleUpload} variant="destructive" className="gap-2">
                <Upload className="h-4 w-4" />
                Process {validRows.length} sales deductions
              </Button>
            )}
            {state === "done" && (
              <Button onClick={reset} variant="outline">Upload another file</Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
