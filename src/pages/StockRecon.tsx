import { useState, useRef, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, X, Download, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

export default function StockRecon() {
  const { data: products } = useProducts();
  const { data: warehouses } = useWarehouses();
  const { data: stockLevels } = useStockLevels();
  const addMovement = useAddStockMovement();

  const fileRef = useRef<HTMLInputElement>(null);
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [rows, setRows] = useState<ReconRow[]>([]);
  const [state, setState] = useState<State>("idle");
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState(0);

  // Default to "Main" warehouse if available
  const defaultWarehouseId = useMemo(() => {
    if (!warehouses?.length) return "";
    const main = warehouses.find((w: any) => /main/i.test(w.warehouse_name));
    return (main ?? warehouses[0]).id;
  }, [warehouses]);

  const effectiveWarehouseId = warehouseId || defaultWarehouseId;

  const productMap = useMemo(() => {
    const m = new Map<string, { id: string; description: string | null }>();
    products?.forEach((p: any) =>
      m.set(p.item_code?.trim().toLowerCase(), { id: p.id, description: p.item_description })
    );
    return m;
  }, [products]);

  const stockForWarehouse = useMemo(() => {
    const m = new Map<string, number>();
    stockLevels?.forEach((s: any) => {
      if (s.warehouse_id === effectiveWarehouseId) m.set(s.product_id, s.current_stock ?? 0);
    });
    return m;
  }, [stockLevels, effectiveWarehouseId]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!effectiveWarehouseId) {
      toast.error("Please select a warehouse first");
      return;
    }
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
        const qty = parseInt(String(qtyRaw));
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
          entry.system = stockForWarehouse.get(prod.id) ?? 0;
          entry.diff = entry.uploaded - entry.system;
        }

        // Dedupe by item code — keep last
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
    if (changes.length === 0) {
      toast.info("No differences to apply");
      return;
    }
    setState("uploading");
    setProgress(0);
    const batchId = crypto.randomUUID();
    let done = 0;

    for (const r of changes) {
      try {
        await addMovement.mutateAsync({
          product_id: r.product_id!,
          warehouse_id: effectiveWarehouseId,
          movement_type: r.diff > 0 ? "IN" : "OUT",
          quantity: Math.abs(r.diff),
          reference_note: `Reconciliation from ${fileName}`,
          batch_id: batchId,
        });
      } catch (err: any) {
        toast.error(`${r.item_code}: ${err.message}`);
      }
      done++;
      setProgress(Math.round((done / changes.length) * 100));
    }

    setState("done");
    toast.success(`Reconciled ${done} item${done === 1 ? "" : "s"}`);
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
    const wh = warehouses?.find((w: any) => w.id === effectiveWarehouseId);
    const wb = XLSX.utils.book_new();
    const data = [
      ["Item Code", "Description", "System Qty", "Uploaded Qty", "Difference", "Action"],
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
    ws["!cols"] = [{ wch: 20 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, "Reconciliation");
    const safe = (wh?.warehouse_name ?? "warehouse").replace(/[^a-z0-9]+/gi, "_");
    XLSX.writeFile(wb, `recon_${safe}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }, [rows, warehouses, effectiveWarehouseId]);

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between flex-wrap gap-3">
        <div>
          <p className="text-[10px] sm:text-xs uppercase tracking-[0.22em] text-muted-foreground/70 font-mono mb-1">Reconcile</p>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Stock Reconciliation</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Upload a count for a warehouse to see the difference vs. system stock. Review, then apply adjustments as IN/OUT movements.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2 w-full sm:w-auto" onClick={downloadTemplate}>
          <Download className="h-4 w-4" />
          Download Template
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <label className="text-xs uppercase tracking-wider font-mono text-muted-foreground">Warehouse</label>
        <Select
          value={effectiveWarehouseId}
          onValueChange={(v) => {
            setWarehouseId(v);
            if (state !== "idle") reset();
          }}
          disabled={state === "uploading"}
        >
          <SelectTrigger className="w-full sm:w-64 h-11">
            <SelectValue placeholder="Select warehouse" />
          </SelectTrigger>
          <SelectContent>
            {warehouses?.map((w: any) => (
              <SelectItem key={w.id} value={w.id}>
                {w.warehouse_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {state === "idle" && (
        <label className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border/70 bg-muted/20 p-12 cursor-pointer hover:border-primary/50 hover:bg-muted/40 transition-all">
          <Upload className="h-10 w-10 text-muted-foreground/60" />
          <span className="text-sm text-muted-foreground">Click to select an Excel file (.xlsx, .xls)</span>
          <span className="text-xs text-muted-foreground/70 font-mono">Columns: Item Code, Quantity</span>
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
                      <th className="px-4 py-2 text-right text-[11px] uppercase tracking-wider font-mono">System</th>
                      <th className="px-4 py-2 text-right text-[11px] uppercase tracking-wider font-mono">Uploaded</th>
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
                disabled={changes.length === 0 || addMovement.isPending}
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
