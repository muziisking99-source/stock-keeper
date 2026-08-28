import { useState, useRef, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import {
  useProducts,
  useWarehouses,
  useStockLevels,
  useAddStockMovement,
  useAddProducts,
  useStockMovements,
} from "@/hooks/useStockData";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Undo2,
  Warehouse,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Search,
  Check,
  Package,
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  X,
  Download,
  PackagePlus,
} from "lucide-react";
import { toast } from "sonner";
import { groupByBatch } from "@/lib/groupMovements";

const REASONS = ["Customer Return", "Wrong Item", "Defective", "Other"] as const;
type Reason = typeof REASONS[number];

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

interface CreditLine {
  id: string;
  productId: string;
  quantity: string;
  reason: Reason;
}

let counter = 0;
const newCreditLine = (): CreditLine => ({
  id: String(++counter),
  productId: "",
  quantity: "",
  reason: "Customer Return",
});

function ProductSearch({ products, value, onChange }: { products: any[] | undefined; value: string; onChange: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = products?.find((p) => p.id === value);
  const filtered = products?.filter((p) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return p.item_code.toLowerCase().includes(q) || (p.item_description?.toLowerCase().includes(q) ?? false);
  }) ?? [];
  return (
    <div className="relative flex-1">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      <input
        value={open ? query : (selected ? `${selected.item_code} — ${selected.item_description || "N/A"}` : "")}
        placeholder="Search products…"
        className="flex h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onFocus={() => { setOpen(true); setQuery(""); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
      />
      {open && (
        <div id="product-search-dropdown" className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 bg-popover border border-border rounded-lg shadow-xl max-h-48 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">No products found</div>
          ) : filtered.map((p) => (
            <button key={p.id} type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(p.id); setOpen(false); setQuery(""); }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-muted/60 flex items-start gap-2">
              {p.id === value && <Check className="h-3 w-3 shrink-0 mt-0.5 text-blue-500" />}
              <div className="flex flex-col min-w-0">
                <span className="font-mono font-medium">{p.item_code}</span>
                <span className="text-muted-foreground text-[11px] whitespace-normal break-words">{p.item_description || "N/A"}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Credits() {
  const { data: products } = useProducts();
  const { data: warehouses } = useWarehouses();
  const { data: stockLevels } = useStockLevels();
  const { data: movements, isLoading } = useStockMovements(["CREDIT"]);
  const addMovement = useAddStockMovement();
  const addProducts = useAddProducts();

  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<CreditLine[]>([newCreditLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [importWarehouseId, setImportWarehouseId] = useState("");
  const [importNote, setImportNote] = useState("");
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importState, setImportState] = useState<ImportState>("idle");
  const [importProgress, setImportProgress] = useState(0);
  const [importFileName, setImportFileName] = useState("");
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

  const resetForm = () => {
    setWarehouseId(""); setNote(""); setLines([newCreditLine()]); setOpen(false);
  };

  const updateLine = (id: string, field: keyof CreditLine, value: string) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  };
  const removeLine = (id: string) => setLines((prev) => prev.length <= 1 ? prev : prev.filter((l) => l.id !== id));
  const addLine = () => setLines((prev) => [...prev, newCreditLine()]);

  const isValid = warehouseId && lines.every((l) => l.productId && l.quantity && parseInt(l.quantity) > 0);

  const handleSubmit = async () => {
    if (!isValid) return;
    setSubmitting(true);
    try {
      const batchId = crypto.randomUUID();
      for (const line of lines) {
        await addMovement.mutateAsync({
          product_id: line.productId,
          warehouse_id: warehouseId,
          movement_type: "CREDIT",
          quantity: parseInt(line.quantity),
          reference_note: note || undefined,
          batch_id: batchId,
          metadata: { credit_reason: line.reason },
        });
      }
      toast.success(`${lines.length} credit(s) recorded`);
      resetForm();
    } catch (err: any) {
      toast.error(err.message || "Operation failed");
    } finally {
      setSubmitting(false);
    }
  };

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
    if (fileRef.current) fileRef.current.value = "";
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

  const grouped = groupByBatch(movements ?? []);
  const toggleBatch = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
        <div>
          <p className="text-[10px] sm:text-xs uppercase tracking-[0.22em] text-muted-foreground/70 font-mono mb-1">Returns</p>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Credits</h1>
          <p className="mt-1 text-xs text-muted-foreground">Record stock returned back into a warehouse.</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : resetForm())}>
          <DialogTrigger asChild>
            <Button variant="outline" className="text-blue-600 border-blue-500/40 hover:bg-blue-500/10 dark:text-blue-300">
              <Undo2 className="h-4 w-4 mr-2" /> Record Credit
            </Button>
          </DialogTrigger>
          <DialogContent
            className="max-w-lg max-h-[85vh] overflow-y-auto p-0"
            onInteractOutside={(e) => {
              const target = e.target as HTMLElement;
              if (target.closest("#product-search-dropdown")) e.preventDefault();
            }}
          >
            <div className="bg-gradient-to-r from-blue-500/15 to-blue-500/5 border-b border-blue-500/20 px-6 py-5">
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                    <Undo2 className="h-5 w-5 text-blue-600 dark:text-blue-300" />
                  </div>
                  <div>
                    <DialogTitle className="text-lg">Record Credit</DialogTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">Returns add stock back into a warehouse</p>
                  </div>
                </div>
              </DialogHeader>
            </div>

            <div className="space-y-5 px-6 py-5">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Warehouse className="h-3.5 w-3.5" /> Destination Warehouse
                </Label>
                <Select value={warehouseId} onValueChange={setWarehouseId}>
                  <SelectTrigger className="bg-background"><SelectValue placeholder="Select warehouse" /></SelectTrigger>
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

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-semibold">Line Items</span>
                    <span className="text-[10px] font-mono bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">{lines.length}</span>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addLine} className="h-7 text-xs gap-1">
                    <Plus className="h-3 w-3" /> Add
                  </Button>
                </div>
                <div className="rounded-xl border border-border/70 bg-muted/30 divide-y divide-border/50">
                  {lines.map((line, idx) => (
                    <div key={line.id} className="p-3 space-y-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono font-bold text-blue-500 bg-muted rounded-md w-5 h-5 flex items-center justify-center">{idx + 1}</span>
                        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Item</span>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <ProductSearch products={products as any} value={line.productId} onChange={(v) => updateLine(line.id, "productId", v)} />
                        <div className="flex gap-2">
                          <Input type="number" min="1" value={line.quantity} inputMode="numeric"
                            onChange={(e) => updateLine(line.id, "quantity", e.target.value)}
                            placeholder="Qty"
                            className="flex-1 sm:w-20 sm:flex-none h-10 sm:h-9 text-sm sm:text-xs font-mono bg-background text-center" />
                          <Button type="button" variant="ghost" size="sm" onClick={() => removeLine(line.id)} disabled={lines.length <= 1}
                            className="h-10 w-10 sm:h-9 sm:w-9 p-0 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg">
                            <Trash2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <Select value={line.reason} onValueChange={(v) => updateLine(line.id, "reason", v as Reason)}>
                        <SelectTrigger className="h-9 text-xs bg-background"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reference Note</Label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Customer name, invoice ref, etc." rows={2} className="bg-background" />
              </div>

              <Button
                className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                onClick={handleSubmit} disabled={!isValid || submitting}
              >
                {submitting ? "Processing…" : `Record ${lines.length} Credit(s)`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card/95 border border-border/70 rounded-2xl shadow-sm border-l-4 border-l-blue-500/70 p-5 md:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Import Credit Notes
            </h2>
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
          <label className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/20 p-10 cursor-pointer hover:border-blue-500/40 hover:bg-muted/30 transition-all">
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
                <Button onClick={resetImport} className="gap-2 w-full sm:w-auto h-11 sm:h-10">
                  Upload another file
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="bg-card/95 border border-border/70 rounded-2xl shadow-sm border-l-4 border-l-blue-500/70">
        <div className="px-5 py-4 border-b border-border/70">
          <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">Credit History</h2>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
        ) : !grouped.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm">No credits yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead className="text-[11px] uppercase tracking-[0.18em]">Date</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-[0.18em]">Items</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.18em]">Warehouse</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.18em] text-right">Total Qty</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.18em]">Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grouped.map((group) => {
                  const isMulti = group.movements.length > 1;
                  const isExpanded = expanded.has(group.batchId);
                  const totalQty = group.movements.reduce((s: number, m: any) => s + m.quantity, 0);
                  const itemCodes = group.movements.map((m: any) => (m.products as any)?.item_code).join(", ");
                  return (
                    <>
                      <TableRow key={group.batchId} className={`hover:bg-muted/40 ${isMulti ? "cursor-pointer" : ""}`} onClick={() => isMulti && toggleBatch(group.batchId)}>
                        <TableCell className="w-8 px-2">
                          {isMulti && (isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />)}
                        </TableCell>
                        <TableCell className="text-sm font-mono text-muted-foreground">{new Date(group.date).toLocaleDateString()}</TableCell>
                        <TableCell className="font-mono text-sm font-medium">
                          {isMulti ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="bg-blue-500/15 text-blue-600 dark:text-blue-300 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">{group.movements.length}</span>
                              <span className="text-muted-foreground text-xs truncate max-w-[180px]">{itemCodes}</span>
                            </span>
                          ) : itemCodes}
                        </TableCell>
                        <TableCell className="text-sm">{group.warehouse}</TableCell>
                        <TableCell className="text-sm font-mono text-right font-medium">{totalQty}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[220px] truncate">{group.note || "—"}</TableCell>
                      </TableRow>
                      {isMulti && isExpanded && group.movements.map((m: any) => (
                        <TableRow key={m.id} className="bg-muted/20 hover:bg-muted/30">
                          <TableCell />
                          <TableCell className="text-xs font-mono text-muted-foreground pl-6">{new Date(m.movement_date).toLocaleDateString()}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {(m.products as any)?.item_code}
                            {m.metadata?.credit_reason && (
                              <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-300 text-[10px] font-mono">
                                {m.metadata.credit_reason}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">{(m.warehouses as any)?.warehouse_name}</TableCell>
                          <TableCell className="text-xs font-mono text-right">{m.quantity}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{m.reference_note || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
