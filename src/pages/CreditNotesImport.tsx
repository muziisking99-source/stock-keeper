import { useState, useRef, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  X,
  Download,
  Warehouse,
  PackagePlus,
  RotateCcw,
} from "lucide-react";
import {
  useProducts,
  useWarehouses,
  useStockLevels,
  useAddStockMovement,
  useAddProducts,
  useUndoCreditBatch,
} from "@/hooks/useStockData";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const REASONS = ["Customer Return", "Wrong Item", "Defective", "Other"] as const;
type Reason = (typeof REASONS)[number];

interface ImportRow {
  rowNum: number;
  item_code: string;
  item_description: string;
  quantity: number;
  reason: Reason;
  product_id?: string;
  current_stock: number;
  error?: string;
  willCreateProduct?: boolean;
}

type ImportState = "idle" | "parsed" | "uploading" | "done";

function normalizeReason(raw: string): Reason {
  const trimmed = raw.trim();
  if (!trimmed) return "Customer Return";
  const match = REASONS.find((r) => r.toLowerCase() === trimmed.toLowerCase());
  return match ?? "Other";
}

export default function CreditNotesImport() {
  const { data: products } = useProducts();
  const { data: warehouses } = useWarehouses();
  const { data: stockLevels } = useStockLevels();
  const addMovement = useAddStockMovement();
  const addProducts = useAddProducts();
  const undoCreditBatch = useUndoCreditBatch();

  const fileRef = useRef<HTMLInputElement>(null);
  const [importWarehouseId, setImportWarehouseId] = useState("");
  const [importNote, setImportNote] = useState("");
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importState, setImportState] = useState<ImportState>("idle");
  const [importProgress, setImportProgress] = useState(0);
  const [importFileName, setImportFileName] = useState("");
  const [postedBatchId, setPostedBatchId] = useState<string | null>(null);
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);
  const [importResults, setImportResults] = useState<
    { row: ImportRow; status: "posted" | "error"; message?: string }[]
  >([]);

  const defaultImportWarehouseId = useMemo(() => {
    if (!warehouses?.length) return "";
    const main = warehouses.find((w: any) => /main/i.test(w.warehouse_name));
    return (main ?? warehouses[0]).id;
  }, [warehouses]);

  const effectiveImportWarehouseId = importWarehouseId || defaultImportWarehouseId;

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
      if (s.warehouse_id === effectiveImportWarehouseId) {
        m.set(s.product_id, s.current_stock ?? 0);
      }
    });
    return m;
  }, [stockLevels, effectiveImportWarehouseId]);

  const importWarehouse = useMemo(
    () => warehouses?.find((w: any) => w.id === effectiveImportWarehouseId),
    [warehouses, effectiveImportWarehouseId]
  );

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!effectiveImportWarehouseId) {
      toast.error("Please select a warehouse first");
      return;
    }
    setImportFileName(file.name);
    setImportResults([]);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target?.result, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      const parsed: ImportRow[] = [];
      json.forEach((row, idx) => {
        const itemCode = String(
          row["Item Code"] ?? row["item_code"] ?? row["ItemCode"] ?? row["ITEM CODE"] ?? ""
        ).trim();
        const desc = String(
          row["Item Description"] ??
            row["item_description"] ??
            row["Description"] ??
            row["ITEM DESCRIPTION"] ??
            ""
        ).trim();
        const qtyRaw =
          row["Quantity Of Units"] ??
          row["Quantity"] ??
          row["quantity"] ??
          row["QTY"] ??
          row["Qty"] ??
          row["qty"] ??
          "";
        const qty = parseInt(String(qtyRaw).replace(/,/g, ""));
        const reasonRaw = String(
          row["Reason"] ?? row["reason"] ?? row["Credit Reason"] ?? row["CREDIT REASON"] ?? ""
        );

        if (!itemCode) return;

        const existing = productMap.get(itemCode.toLowerCase());
        const entry: ImportRow = {
          rowNum: idx + 2,
          item_code: itemCode,
          item_description: desc || existing?.description || "",
          quantity: isNaN(qty) ? 0 : qty,
          reason: normalizeReason(reasonRaw),
          current_stock: existing ? stockForWarehouse.get(existing.id) ?? 0 : 0,
        };

        if (isNaN(qty) || qty === 0) {
          entry.error = "Quantity must be a non-zero number";
        } else if (qty < 0) {
          entry.error = "Credit quantity must be positive (stock returning in)";
        } else if (!existing) {
          entry.willCreateProduct = true;
        } else {
          entry.product_id = existing.id;
        }

        parsed.push(entry);
      });

      setImportRows(parsed);
      setImportState("parsed");
    };
    reader.readAsArrayBuffer(file);
  };

  const validImportRows = importRows.filter((r) => !r.error);
  const errorImportRows = importRows.filter((r) => !!r.error);
  const newProductImportRows = validImportRows.filter((r) => r.willCreateProduct);
  const totalCreditUnits = useMemo(
    () => validImportRows.reduce((sum, row) => sum + row.quantity, 0),
    [validImportRows]
  );

  const resetImport = () => {
    setImportRows([]);
    setImportState("idle");
    setImportProgress(0);
    setImportFileName("");
    setImportResults([]);
    setPostedBatchId(null);
    setShowUndoConfirm(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const postedCount = importResults.filter((r) => r.status === "posted").length;
  const postedUnits = importResults
    .filter((r) => r.status === "posted")
    .reduce((sum, r) => sum + r.row.quantity, 0);

  const handleUndoBatch = async () => {
    if (!postedBatchId) return;
    try {
      const count = await undoCreditBatch.mutateAsync(postedBatchId);
      toast.success(`Undid entire import — removed ${count} credit${count === 1 ? "" : "s"}`);
      resetImport();
    } catch (err: any) {
      toast.error(err.message || "Failed to undo import batch");
    }
  };

  const handleImportUpload = async () => {
    if (!effectiveImportWarehouseId) {
      toast.error("Please select a warehouse first");
      return;
    }
    if (validImportRows.length === 0) return;

    setImportState("uploading");
    setImportProgress(0);

    const codeToProductId = new Map<string, string>();
    productMap.forEach((v, code) => codeToProductId.set(code, v.id));

    if (newProductImportRows.length > 0) {
      const seen = new Map<string, { item_code: string; item_description: string | null; category: null }>();
      newProductImportRows.forEach((r) => {
        const key = r.item_code.toLowerCase();
        if (!seen.has(key)) {
          seen.set(key, {
            item_code: r.item_code,
            item_description: r.item_description?.trim() || null,
            category: null,
          });
        }
      });
      try {
        const created = await addProducts.mutateAsync(Array.from(seen.values()));
        (created || []).forEach((p: any) => {
          codeToProductId.set(p.item_code.trim().toLowerCase(), p.id);
        });
        toast.success(`Auto-created ${seen.size} new product${seen.size === 1 ? "" : "s"}`);
      } catch (err: any) {
        toast.error(`Failed to create new products: ${err.message}`);
        setImportState("parsed");
        return;
      }

      const stillMissing = validImportRows.filter(
        (r) => !r.product_id && !codeToProductId.get(r.item_code.toLowerCase())
      );
      if (stillMissing.length > 0) {
        const { data: refetched } = await (await import("@/integrations/supabase/client")).supabase
          .from("products")
          .select("id, item_code")
          .in("item_code", stillMissing.map((r) => r.item_code));
        (refetched || []).forEach((p: any) => {
          codeToProductId.set(p.item_code.trim().toLowerCase(), p.id);
        });
      }
    }

    const batchId = crypto.randomUUID();
    const results: typeof importResults = [];
    let done = 0;

    for (const row of validImportRows) {
      const pid = row.product_id || codeToProductId.get(row.item_code.toLowerCase());
      if (!pid) {
        results.push({ row, status: "error", message: "Could not resolve product id" });
        done++;
        setImportProgress(Math.round((done / validImportRows.length) * 100));
        continue;
      }

      try {
        await addMovement.mutateAsync({
          product_id: pid,
          warehouse_id: effectiveImportWarehouseId,
          movement_type: "CREDIT",
          quantity: row.quantity,
          reference_note:
            importNote.trim() ||
            `Credit import ${importFileName} (row ${row.rowNum})`,
          batch_id: batchId,
          metadata: { credit_reason: row.reason },
        });
        results.push({ row, status: "posted" });
      } catch (err: any) {
        results.push({ row, status: "error", message: err.message ?? "Failed" });
      }
      done++;
      setImportProgress(Math.round((done / validImportRows.length) * 100));
    }

    setImportResults(results);
    setImportState("done");
    const okCount = results.filter((r) => r.status === "posted").length;
    const failCount = results.filter((r) => r.status === "error").length;
    if (okCount > 0) setPostedBatchId(batchId);
    toast.success(`Posted ${okCount} credit${okCount === 1 ? "" : "s"}`);
    if (failCount > 0) toast.error(`${failCount} row${failCount === 1 ? "" : "s"} failed`);
  };

  const downloadImportTemplate = useCallback(() => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Item Code", "Item Description", "Quantity", "Reason"],
      ["ITEM-001", "Example returned product", 5, "Customer Return"],
      ["ITEM-002", "Another returned item", 12, "Defective"],
    ]);
    ws["!cols"] = [{ wch: 20 }, { wch: 32 }, { wch: 12 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, "Credit Notes");
    XLSX.writeFile(wb, "credit_notes_template.xlsx");
  }, []);

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between flex-wrap gap-3">
        <div>
          <p className="text-[10px] sm:text-xs uppercase tracking-[0.22em] text-muted-foreground/70 font-mono mb-1">
            Returns
          </p>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Import Credit Notes</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Upload returned stock from Excel.{" "}
            <span className="text-blue-600 dark:text-blue-300 font-semibold">Positive quantities</span>{" "}
            add stock back into the selected warehouse as credits. Columns:{" "}
            <span className="font-mono text-xs">Item Code</span>,{" "}
            <span className="font-mono text-xs">Item Description</span>,{" "}
            <span className="font-mono text-xs">Quantity</span>, optional{" "}
            <span className="font-mono text-xs">Reason</span>. Unknown item codes are auto-created.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2 w-full sm:w-auto" onClick={downloadImportTemplate}>
          <Download className="h-4 w-4" />
          Download Template
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Warehouse className="h-3.5 w-3.5" /> Destination Warehouse
          </Label>
          <Select
            value={effectiveImportWarehouseId}
            onValueChange={(v) => {
              setImportWarehouseId(v);
              if (importState !== "idle") resetImport();
            }}
            disabled={importState === "uploading"}
          >
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="Select warehouse" />
            </SelectTrigger>
            <SelectContent>
              {warehouses?.map((w: any) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.warehouse_name}
                  {w.allow_negative_stock ? " · allows negative" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Reference Note
          </Label>
          <Input
            value={importNote}
            onChange={(e) => setImportNote(e.target.value)}
            placeholder="Customer name, invoice ref, etc."
            className="bg-background"
            disabled={importState === "uploading"}
          />
        </div>
      </div>

      {importState === "idle" && (
        <label className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/20 p-12 cursor-pointer hover:border-blue-500/40 hover:bg-muted/30 transition-all">
          <Upload className="h-10 w-10 text-muted-foreground/60" />
          <span className="text-sm text-muted-foreground text-center px-3">
            Click to select an Excel file (.xlsx, .xls, .csv)
          </span>
          {importWarehouse && (
            <span className="text-xs text-muted-foreground font-mono">
              Credits will post to {importWarehouse.warehouse_name}
            </span>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleImportFile}
          />
        </label>
      )}

      {importState !== "idle" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 px-4 py-3 bg-muted/40 rounded-xl border border-border">
            <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-mono flex-1 truncate">{importFileName}</span>
            {importState === "parsed" && (
              <Button variant="ghost" size="sm" onClick={resetImport} className="h-7 w-7 p-0">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 px-4 py-3">
              <div className="text-xs uppercase tracking-wider text-blue-600 dark:text-blue-300 font-mono">
                Credits
              </div>
              <p className="text-2xl font-semibold mt-1 text-blue-600 dark:text-blue-300">+{totalCreditUnits}</p>
              <p className="text-[11px] text-muted-foreground font-mono">
                {validImportRows.length} line{validImportRows.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary font-mono">
                <PackagePlus className="h-3.5 w-3.5" /> New Products
              </div>
              <p className="text-2xl font-semibold mt-1 text-primary">{newProductImportRows.length}</p>
              <p className="text-[11px] text-muted-foreground font-mono">will be auto-created</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-mono">
                <Warehouse className="h-3.5 w-3.5" /> Warehouse
              </div>
              <p className="text-sm font-semibold mt-2 truncate">
                {importWarehouse?.warehouse_name ?? "—"}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-mono">
                <AlertTriangle className="h-3.5 w-3.5" /> Errors
              </div>
              <p className="text-2xl font-semibold mt-1">{errorImportRows.length}</p>
              <p className="text-[11px] text-muted-foreground font-mono">will be skipped</p>
            </div>
          </div>

          {errorImportRows.length > 0 && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-destructive">
                Rows with errors (will be skipped)
              </p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {errorImportRows.map((r) => (
                  <p key={r.rowNum} className="text-xs font-mono">
                    Row {r.rowNum}:{" "}
                    <span className="text-muted-foreground">
                      {r.item_code} ({r.quantity})
                    </span>{" "}
                    — {r.error}
                  </p>
                ))}
              </div>
            </div>
          )}

          {validImportRows.length > 0 && importState !== "done" && (
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <div className="overflow-x-auto max-h-[420px]">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 sticky top-0">
                    <tr className="border-b border-border/60">
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider font-mono">Row</th>
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider font-mono">Item Code</th>
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider">Description</th>
                      <th className="px-4 py-2 text-right text-[11px] uppercase tracking-wider font-mono">Current</th>
                      <th className="px-4 py-2 text-right text-[11px] uppercase tracking-wider font-mono">Qty</th>
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validImportRows.slice(0, 200).map((r) => (
                      <tr key={r.rowNum} className="border-b border-border/60 last:border-b-0">
                        <td className="px-4 py-1.5 text-xs text-muted-foreground font-mono">{r.rowNum}</td>
                        <td className="px-4 py-1.5 font-mono text-sm">
                          {r.item_code}
                          {r.willCreateProduct && (
                            <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-mono uppercase tracking-wider">
                              <PackagePlus className="h-2.5 w-2.5" />
                              new
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-1.5 text-sm text-muted-foreground truncate max-w-[240px]">
                          {r.item_description || "—"}
                        </td>
                        <td className="px-4 py-1.5 text-sm font-mono text-right text-muted-foreground">
                          {r.willCreateProduct ? "—" : r.current_stock}
                        </td>
                        <td className="px-4 py-1.5 text-sm font-mono text-right font-semibold text-blue-600 dark:text-blue-300">
                          +{r.quantity}
                        </td>
                        <td className="px-4 py-1.5 text-xs text-muted-foreground">{r.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {validImportRows.length > 200 && (
                <p className="text-xs text-muted-foreground px-4 py-2 bg-muted/20">
                  Showing 200 of {validImportRows.length} rows
                </p>
              )}
            </div>
          )}

          {importState === "done" && importResults.length > 0 && (
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <div className="px-4 py-2 bg-muted/30 border-b border-border/60 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                Posted credits
              </div>
              <div className="overflow-x-auto max-h-[420px]">
                <table className="w-full text-sm">
                  <thead className="bg-muted/20 sticky top-0">
                    <tr className="border-b border-border/60">
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider font-mono">Row</th>
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider font-mono">Item Code</th>
                      <th className="px-4 py-2 text-right text-[11px] uppercase tracking-wider font-mono">Qty</th>
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider font-mono">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResults.slice(0, 300).map((r, i) => (
                      <tr key={i} className="border-b border-border/60 last:border-b-0">
                        <td className="px-4 py-1.5 text-xs text-muted-foreground font-mono">{r.row.rowNum}</td>
                        <td className="px-4 py-1.5 font-mono text-sm">{r.row.item_code}</td>
                        <td className="px-4 py-1.5 text-sm font-mono text-right font-semibold text-blue-600 dark:text-blue-300">
                          +{r.row.quantity}
                        </td>
                        <td className="px-4 py-1.5 text-xs">
                          {r.status === "posted" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-300 font-mono">
                              <CheckCircle2 className="h-3 w-3" /> Credit posted
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-destructive/15 text-destructive font-mono"
                              title={r.message}
                            >
                              <AlertTriangle className="h-3 w-3" /> {r.message ?? "Failed"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {importState === "uploading" && (
            <div className="space-y-2">
              <Progress value={importProgress} className="h-2" />
              <p className="text-xs text-muted-foreground font-mono text-center">{importProgress}%</p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:flex-wrap">
            {importState === "parsed" && validImportRows.length > 0 && (
              <>
                <Button
                  onClick={handleImportUpload}
                  disabled={!effectiveImportWarehouseId}
                  className="gap-2 w-full sm:w-auto h-11 sm:h-10 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Upload className="h-4 w-4" />
                  Post {validImportRows.length} credit{validImportRows.length !== 1 ? "s" : ""}
                </Button>
                <Button variant="outline" onClick={resetImport} className="gap-2 w-full sm:w-auto h-11 sm:h-10">
                  Cancel
                </Button>
              </>
            )}
            {importState === "done" && (
              <>
                {postedBatchId && postedCount > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => setShowUndoConfirm(true)}
                    disabled={undoCreditBatch.isPending}
                    className="gap-2 w-full sm:w-auto h-11 sm:h-10 text-destructive border-destructive/40 hover:bg-destructive/10"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Undo Entire Batch ({postedCount} line{postedCount !== 1 ? "s" : ""})
                  </Button>
                )}
                <Button onClick={resetImport} className="gap-2 w-full sm:w-auto h-11 sm:h-10">
                  Upload another file
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={showUndoConfirm} onOpenChange={setShowUndoConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo entire Excel import?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  This will remove all {postedCount} credited line{postedCount !== 1 ? "s" : ""} from{" "}
                  <span className="font-mono text-foreground">{importFileName}</span> and reverse{" "}
                  <span className="font-semibold text-foreground">{postedUnits}</span> units of stock.
                </p>
                <p>If stock has already been issued since this import, undo may be blocked.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleUndoBatch();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {undoCreditBatch.isPending ? "Undoing…" : "Undo Entire Batch"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
