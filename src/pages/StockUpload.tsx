import { useState, useRef, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, X, Download, PackagePlus } from "lucide-react";
import { useProducts, useWarehouses, useAddStockMovement, useAddProducts, useStockLevels } from "@/hooks/useStockData";
import { toast } from "sonner";

interface ParsedRow {
  rowNum: number;
  item_code: string;
  warehouse_name: string;
  quantity: number;
  current_stock: number;
  product_id?: string;
  warehouse_id?: string;
  error?: string;
}

type UploadState = "idle" | "parsed" | "uploading" | "done";

export default function StockUpload() {
  const { data: products } = useProducts();
  const { data: warehouses } = useWarehouses();
  const { data: stockLevels } = useStockLevels();
  const addMovement = useAddStockMovement();
  const addProducts = useAddProducts();

  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState("");
  const [missingDrafts, setMissingDrafts] = useState<Record<string, { description: string; category: string }>>({});

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
      m.set(`${s.product_id}_${s.warehouse_id}`, s.current_stock ?? 0);
    });
    return m;
  }, [stockLevels]);

  const reValidate = useCallback((parsed: ParsedRow[]) => {
    return parsed.map((r) => {
      const entry: ParsedRow = {
        rowNum: r.rowNum,
        item_code: r.item_code,
        warehouse_name: r.warehouse_name,
        quantity: r.quantity,
        current_stock: 0,
      };
      const pid = productMap.get(r.item_code.toLowerCase());
      const wid = warehouseMap.get(r.warehouse_name.toLowerCase());
      if (!pid) entry.error = "Product not found";
      else if (!wid) entry.error = "Warehouse not found";
      else if (r.quantity == null || isNaN(r.quantity) || r.quantity < 0) entry.error = "Invalid quantity";
      else {
        entry.product_id = pid;
        entry.warehouse_id = wid;
        entry.current_stock = stockMap.get(`${pid}_${wid}`) ?? 0;
      }
      return entry;
    });
  }, [productMap, warehouseMap, stockMap]);

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
      json.forEach((row, idx) => {
        const itemCode = String(row["Item Code"] ?? row["item_code"] ?? row["ItemCode"] ?? row["ITEM CODE"] ?? "").trim();
        const whName = String(row["Warehouse"] ?? row["warehouse"] ?? row["Warehouse Name"] ?? row["WAREHOUSE"] ?? "").trim();
        const qtyRaw = row["Quantity"] ?? row["quantity"] ?? row["QTY"] ?? row["Qty"] ?? row["qty"] ?? "";
        const qty = parseInt(String(qtyRaw));

        if (!itemCode) return;

        const entry: ParsedRow = {
          rowNum: idx + 2,
          item_code: itemCode,
          warehouse_name: whName,
          quantity: qty,
          current_stock: 0,
        };
        const pid = productMap.get(itemCode.toLowerCase());
        const wid = warehouseMap.get(whName.toLowerCase());

        if (!pid) entry.error = "Product not found";
        else if (!wid) entry.error = "Warehouse not found";
        else if (isNaN(qty) || qty < 0) entry.error = "Invalid quantity";
        else {
          entry.product_id = pid;
          entry.warehouse_id = wid;
          entry.current_stock = stockMap.get(`${pid}_${wid}`) ?? 0;
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

  // Unique missing item codes (case-insensitive), preserving first-seen casing
  const missingCodes = useMemo(() => {
    const seen = new Map<string, string>();
    rows.forEach((r) => {
      if (r.error === "Product not found") {
        const key = r.item_code.toLowerCase();
        if (!seen.has(key)) seen.set(key, r.item_code);
      }
    });
    return Array.from(seen.values());
  }, [rows]);

  const otherErrorRows = errorRows.filter((r) => r.error !== "Product not found");

  const updateDraft = (code: string, field: "description" | "category", value: string) => {
    setMissingDrafts((prev) => ({
      ...prev,
      [code]: { description: prev[code]?.description ?? "", category: prev[code]?.category ?? "", [field]: value },
    }));
  };

  const handleCreateMissing = async () => {
    const payload = missingCodes.map((code) => ({
      item_code: code,
      item_description: missingDrafts[code]?.description?.trim() || null,
      category: missingDrafts[code]?.category?.trim() || null,
    }));
    try {
      await addProducts.mutateAsync(payload);
      toast.success(`Added ${payload.length} new product${payload.length === 1 ? "" : "s"}`);
      setMissingDrafts({});
      // Re-validate after a tick — productMap will refresh via query invalidation
      setTimeout(() => {
        setRows((curr) => reValidate(curr));
      }, 300);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to add products");
    }
  };

  const handleUpload = async () => {
    if (validRows.length === 0) return;
    setState("uploading");
    setProgress(0);

    const batchId = crypto.randomUUID();
    let done = 0;

    for (const row of validRows) {
      // 1. Clear out the existing stock first (if any) so the new value REPLACES it.
      if (row.current_stock > 0) {
        try {
          await addMovement.mutateAsync({
            product_id: row.product_id!,
            warehouse_id: row.warehouse_id!,
            movement_type: "OUT",
            quantity: row.current_stock,
            reference_note: `Stock upload reset from ${fileName} (cleared ${row.current_stock})`,
            batch_id: batchId,
          });
        } catch (err: any) {
          toast.error(`Row ${row.rowNum} reset: ${err.message}`);
          done++;
          setProgress(Math.round((done / validRows.length) * 100));
          continue;
        }
      }

      // 2. Add the new uploaded quantity (skip if 0 — the row simply zeros stock).
      if (row.quantity > 0) {
        try {
          await addMovement.mutateAsync({
            product_id: row.product_id!,
            warehouse_id: row.warehouse_id!,
            movement_type: "IN",
            quantity: row.quantity,
            reference_note: `Stock upload from ${fileName} (set to ${row.quantity})`,
            batch_id: batchId,
          });
        } catch (err: any) {
          toast.error(`Row ${row.rowNum}: ${err.message}`);
        }
      }

      done++;
      setProgress(Math.round((done / validRows.length) * 100));
    }

    setState("done");
    toast.success(`Replaced stock for ${done} item${done === 1 ? "" : "s"}`);
  };

  const reset = () => {
    setRows([]);
    setState("idle");
    setProgress(0);
    setFileName("");
    setMissingDrafts({});
    if (fileRef.current) fileRef.current.value = "";
  };

  const downloadTemplate = useCallback(() => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Item Code", "Warehouse", "Quantity"],
      ["ITEM-001", "Main Warehouse", 100],
      ["ITEM-002", "Main Warehouse", 50],
    ]);
    ws["!cols"] = [{ wch: 20 }, { wch: 25 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, "Stock Upload");
    XLSX.writeFile(wb, "stock_upload_template.xlsx");
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground/70 font-mono mb-1">Import</p>
          <h1 className="text-2xl font-semibold tracking-tight">Stock Upload</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload an Excel file to <span className="font-semibold text-foreground">replace</span> current stock with the values in the file. Columns:{" "}
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
        <label className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border/70 bg-muted/20 p-12 cursor-pointer hover:border-primary/50 hover:bg-muted/40 transition-all">
          <Upload className="h-10 w-10 text-muted-foreground/60" />
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
          <div className="flex items-center gap-3 px-4 py-3 bg-muted/30 rounded-xl border border-border/60">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            <span className="text-sm font-mono flex-1">{fileName}</span>
            {state === "parsed" && (
              <Button variant="ghost" size="sm" onClick={reset} className="h-7 w-7 p-0">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Summary */}
          <div className="flex gap-4 flex-wrap">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-stock-in" />
              <span className="font-mono">{validRows.length}</span> valid
            </div>
            {missingCodes.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <PackagePlus className="h-4 w-4 text-primary" />
                <span className="font-mono">{missingCodes.length}</span> missing product{missingCodes.length === 1 ? "" : "s"}
              </div>
            )}
            {otherErrorRows.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-stock-transfer" />
                <span className="font-mono">{otherErrorRows.length}</span> other error{otherErrorRows.length === 1 ? "" : "s"}
              </div>
            )}
          </div>

          {/* Missing products: inline create */}
          {state === "parsed" && missingCodes.length > 0 && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <PackagePlus className="h-4 w-4" />
                    Add missing products
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    These item codes don't exist yet. Add a description and category (optional), then create them so the upload can continue.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={handleCreateMissing}
                  disabled={addProducts.isPending}
                  className="gap-2"
                >
                  <PackagePlus className="h-4 w-4" />
                  {addProducts.isPending ? "Adding…" : `Add ${missingCodes.length} product${missingCodes.length === 1 ? "" : "s"}`}
                </Button>
              </div>

              <div className="rounded-lg border border-border/60 overflow-hidden bg-background">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 sticky top-0">
                      <tr className="border-b border-border/60">
                        <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wider font-mono">Item Code</th>
                        <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wider">Description</th>
                        <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wider">Category</th>
                      </tr>
                    </thead>
                    <tbody>
                      {missingCodes.map((code) => (
                        <tr key={code} className="border-b border-border/60 last:border-b-0">
                          <td className="px-3 py-1.5 font-mono text-sm">{code}</td>
                          <td className="px-3 py-1.5">
                            <Input
                              value={missingDrafts[code]?.description ?? ""}
                              onChange={(e) => updateDraft(code, "description", e.target.value)}
                              placeholder="Optional description"
                              className="h-8 text-sm"
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <Input
                              value={missingDrafts[code]?.category ?? ""}
                              onChange={(e) => updateDraft(code, "category", e.target.value)}
                              placeholder="Optional category"
                              className="h-8 text-sm"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Other error rows */}
          {otherErrorRows.length > 0 && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-destructive">Rows with errors (will be skipped)</p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {otherErrorRows.map((r) => (
                  <p key={r.rowNum} className="text-xs font-mono">
                    Row {r.rowNum}: <span className="text-muted-foreground">{r.item_code}</span> — {r.error}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Preview table */}
          {validRows.length > 0 && (
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 sticky top-0">
                    <tr className="border-b border-border/60">
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider font-mono">Row</th>
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider font-mono">Item Code</th>
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider">Warehouse</th>
                      <th className="px-4 py-2 text-right text-[11px] uppercase tracking-wider font-mono">Current</th>
                      <th className="px-4 py-2 text-right text-[11px] uppercase tracking-wider font-mono">→ New</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validRows.slice(0, 50).map((r) => {
                      const changed = r.current_stock !== r.quantity;
                      return (
                        <tr key={r.rowNum} className="border-b border-border/60 last:border-b-0">
                          <td className="px-4 py-1.5 text-xs text-muted-foreground font-mono">{r.rowNum}</td>
                          <td className="px-4 py-1.5 font-mono text-sm">{r.item_code}</td>
                          <td className="px-4 py-1.5 text-sm">{r.warehouse_name}</td>
                          <td className="px-4 py-1.5 text-sm font-mono text-right text-muted-foreground">{r.current_stock}</td>
                          <td className={`px-4 py-1.5 text-sm font-mono text-right font-semibold ${changed ? "text-stock-in" : ""}`}>
                            {r.quantity}
                          </td>
                        </tr>
                      );
                    })}
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

          {/* Upload progress */}
          {state === "uploading" && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground font-mono text-center">{progress}%</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            {state === "parsed" && validRows.length > 0 && (
              <Button onClick={handleUpload} className="gap-2">
                <Upload className="h-4 w-4" />
                Upload {validRows.length} entries
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
