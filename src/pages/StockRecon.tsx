import { useState, useRef, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, X, Download, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useProducts, useWarehouses, useStockLevels, useAddStockMovement } from "@/hooks/useStockData";
import { toast } from "sonner";

interface ReconRow {
  rowNum: number;
  item_code: string;
  item_description?: string;
  uploaded: number;
  system: number;
  diff: number;
  product_id?: string;
  error?: string;
}

type State = "idle" | "parsed" | "uploading" | "done";

const MAIN_WAREHOUSE_NAME = "Main Warehouse";

export default function StockRecon() {
  const { data: products } = useProducts();
  const { data: warehouses } = useWarehouses();
  const { data: stockLevels } = useStockLevels();
  const addMovement = useAddStockMovement();

  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ReconRow[]>([]);
  const [state, setState] = useState<State>("idle");
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState(0);

  const mainWarehouse = useMemo(
    () =>
      warehouses?.find(
        (w: any) => (w.warehouse_name || "").trim().toLowerCase() === MAIN_WAREHOUSE_NAME.toLowerCase()
      ),
    [warehouses]
  );

  const productMap = useMemo(() => {
    const m = new Map<string, { id: string; description: string | null }>();
    products?.forEach((p: any) =>
      m.set(p.item_code?.trim().toLowerCase(), { id: p.id, description: p.item_description })
    );
    return m;
  }, [products]);

  const totalSystemStock = useMemo(() => {
    const m = new Map<string, number>();
    stockLevels?.forEach((s: any) => {
      m.set(s.product_id, (m.get(s.product_id) ?? 0) + (s.current_stock ?? 0));
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

      const seen = new Map<string, ReconRow>();
      json.forEach((row, idx) => {
        const itemCode = String(row["Item Code"] ?? row["item_code"] ?? row["ItemCode"] ?? row["ITEM CODE"] ?? "").trim();
        const qtyRaw = row["Quantity"] ?? row["quantity"] ?? row["QTY"] ?? row["Qty"] ?? "";
        const qty = parseInt(String(qtyRaw).replace(/,/g, ""));
        if (!itemCode) return;

        const prod = productMap.get(itemCode.toLowerCase());
        const entry: ReconRow = {
          rowNum: idx + 2,
          item_code: itemCode,
          item_description: prod?.description ?? undefined,
          uploaded: isNaN(qty) ? 0 : qty,
          system: 0,
          diff: 0,
        };

        if (!prod) {
          entry.error = "Product not found";
        } else if (isNaN(qty) || qty < 0) {
          entry.error = "Invalid quantity";
        } else {
          entry.product_id = prod.id;
          entry.system = totalSystemStock.get(prod.id) ?? 0;
          entry.diff = entry.uploaded - entry.system;
        }

        const key = itemCode.toLowerCase();
        const prev = seen.get(key);
        if (prev) {
          entry.uploaded = prev.uploaded + entry.uploaded;
          entry.diff = entry.uploaded - entry.system;
        }
        seen.set(key, entry);
      });

      setRows(Array.from(seen.values()));
      setState("parsed");
    };
    reader.readAsArrayBuffer(file);
  };

  const validRows = rows.filter((r) => !r.error);
  const errorRows = rows.filter((r) => !!r.error);
  const changes = validRows.filter((r) => r.diff !== 0);
  const totalIn = changes.filter((r) => r.diff > 0).reduce((s, r) => s + r.diff, 0);
  const totalOut = changes.filter((r) => r.diff < 0).reduce((s, r) => s + Math.abs(r.diff), 0);

  const handleApply = async () => {
    if (!mainWarehouse) {
      toast.error(`"${MAIN_WAREHOUSE_NAME}" warehouse not found. Create it under Master Data before applying adjustments.`);
      return;
    }
    if (changes.length === 0) {
      toast.info("No differences to apply");
      return;
    }
    setState("uploading");
    setProgress(0);
    const batchId = crypto.randomUUID();
    let done = 0;
    let failed = 0;

    for (const r of changes) {
      try {
        await addMovement.mutateAsync({
          product_id: r.product_id!,
          warehouse_id: mainWarehouse.id,
          movement_type: r.diff > 0 ? "IN" : "OUT",
          quantity: Math.abs(r.diff),
          reference_note: `Total stock reconciliation from ${fileName}`,
          batch_id: batchId,
        });
      } catch (err: any) {
        failed++;
        toast.error(`${r.item_code}: ${err.message}`);
      }
      done++;
      setProgress(Math.round((done / changes.length) * 100));
    }

    setState("done");
    const ok = changes.length - failed;
    if (ok > 0) toast.success(`Reconciled ${ok} item${ok === 1 ? "" : "s"}`);
    if (failed > 0) toast.error(`${failed} adjustment${failed === 1 ? "" : "s"} failed`);
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
      ["Item Code", "Quantity"],
      ["ITEM-001", 100],
      ["ITEM-002", 50],
    ]);
    ws["!cols"] = [{ wch: 20 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, "Stock Recon");
    XLSX.writeFile(wb, "stock_recon_template.xlsx");
  }, []);

  const downloadDiffReport = useCallback(() => {
    const wb = XLSX.utils.book_new();
    const data = [
      ["Item Code", "Description", "Our System Total", "Invoicing System", "Difference", "Action"],
      ...rows.map((r) => [
        r.item_code,
        r.item_description ?? "",
        r.error ? "" : r.system,
        r.uploaded,
        r.error ? r.error : r.diff,
        r.error ? "" : r.diff > 0 ? "IN" : r.diff < 0 ? "OUT" : "—",
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = [{ wch: 20 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, "Reconciliation");
    XLSX.writeFile(wb, `recon_total_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }, [rows]);

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between flex-wrap gap-3">
        <div>
          <p className="text-[10px] sm:text-xs uppercase tracking-[0.22em] text-muted-foreground/70 font-mono mb-1">Reconcile</p>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Stock Reconciliation</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Upload stock totals from your invoicing system and compare them against{" "}
            <span className="font-semibold text-foreground">total stock across all warehouses</span> in SpareLube.
            Review differences, then apply adjustments as IN/OUT movements to{" "}
            <span className="font-semibold text-foreground">{MAIN_WAREHOUSE_NAME}</span>.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2 w-full sm:w-auto" onClick={downloadTemplate}>
          <Download className="h-4 w-4" />
          Download Template
        </Button>
      </div>

      {!mainWarehouse && warehouses && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <p className="font-semibold text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Missing warehouse for adjustments
          </p>
          <p className="text-muted-foreground mt-1">
            No warehouse named "{MAIN_WAREHOUSE_NAME}" exists. You can still compare totals, but applying adjustments
            requires this warehouse under Master Data.
          </p>
        </div>
      )}

      {state === "idle" && (
        <label className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border/70 bg-muted/20 p-12 cursor-pointer hover:border-primary/50 hover:bg-muted/40 transition-all">
          <Upload className="h-10 w-10 text-muted-foreground/60" />
          <span className="text-sm text-muted-foreground">Click to select an Excel file (.xlsx, .xls, .csv)</span>
          <span className="text-xs text-muted-foreground/70 font-mono text-center px-4">
            Columns: Item Code, Quantity — invoicing system totals per item
          </span>
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
          <div className="flex items-center gap-3 px-4 py-3 bg-muted/30 rounded-xl border border-border/60">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            <span className="text-sm font-mono flex-1 truncate">{fileName}</span>
            {state === "parsed" && (
              <Button variant="ghost" size="sm" onClick={reset} className="h-7 w-7 p-0">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border/60 bg-card p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">Items</p>
              <p className="text-xl font-semibold font-mono mt-1">{validRows.length}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">Changes</p>
              <p className="text-xl font-semibold font-mono mt-1">{changes.length}</p>
            </div>
            <div className="rounded-xl border border-stock-in/30 bg-stock-in/5 p-3">
              <p className="text-[10px] uppercase tracking-wider text-stock-in font-mono flex items-center gap-1">
                <ArrowDownToLine className="h-3 w-3" /> Total IN
              </p>
              <p className="text-xl font-semibold font-mono mt-1 text-stock-in">+{totalIn}</p>
            </div>
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-[10px] uppercase tracking-wider text-destructive font-mono flex items-center gap-1">
                <ArrowUpFromLine className="h-3 w-3" /> Total OUT
              </p>
              <p className="text-xl font-semibold font-mono mt-1 text-destructive">-{totalOut}</p>
            </div>
          </div>

          {errorRows.length > 0 && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {errorRows.length} row{errorRows.length === 1 ? "" : "s"} skipped
              </p>
              <div className="max-h-32 overflow-y-auto space-y-1">
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
              <div className="overflow-x-auto max-h-[480px]">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 sticky top-0">
                    <tr className="border-b border-border/60">
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider font-mono">Item Code</th>
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider">Description</th>
                      <th className="px-4 py-2 text-right text-[11px] uppercase tracking-wider font-mono">Our System</th>
                      <th className="px-4 py-2 text-right text-[11px] uppercase tracking-wider font-mono">Invoicing</th>
                      <th className="px-4 py-2 text-right text-[11px] uppercase tracking-wider font-mono">Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validRows.map((r) => (
                      <tr
                        key={r.item_code}
                        className={`border-b border-border/60 last:border-b-0 ${
                          r.diff !== 0 ? "" : "opacity-60"
                        }`}
                      >
                        <td className="px-4 py-1.5 font-mono text-sm">{r.item_code}</td>
                        <td className="px-4 py-1.5 text-sm text-muted-foreground truncate max-w-[260px]">
                          {r.item_description ?? "—"}
                        </td>
                        <td className="px-4 py-1.5 text-sm font-mono text-right text-muted-foreground">
                          {r.system}
                        </td>
                        <td className="px-4 py-1.5 text-sm font-mono text-right">{r.uploaded}</td>
                        <td
                          className={`px-4 py-1.5 text-sm font-mono text-right font-semibold ${
                            r.diff > 0
                              ? "text-stock-in"
                              : r.diff < 0
                              ? "text-destructive"
                              : "text-muted-foreground"
                          }`}
                        >
                          {r.diff > 0 ? `+${r.diff}` : r.diff}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {state === "uploading" && (
            <div className="space-y-2">
              <Progress value={progress} />
              <p className="text-xs text-muted-foreground font-mono text-center">Applying adjustments… {progress}%</p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
            <Button variant="outline" onClick={downloadDiffReport} className="gap-2">
              <Download className="h-4 w-4" />
              Export Diff Report
            </Button>
            {state === "parsed" && (
              <Button
                onClick={handleApply}
                disabled={changes.length === 0 || addMovement.isPending || !mainWarehouse}
                className="gap-2"
              >
                <CheckCircle2 className="h-4 w-4" />
                Apply {changes.length} Adjustment{changes.length === 1 ? "" : "s"}
              </Button>
            )}
            {state === "done" && (
              <Button onClick={reset} variant="outline">
                Start Over
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
