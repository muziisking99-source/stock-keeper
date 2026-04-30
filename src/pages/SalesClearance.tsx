import { useState, useRef, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  X,
  Download,
  ArrowDown,
  ArrowUp,
  FileDown,
  PackagePlus,
} from "lucide-react";
import {
  useProducts,
  useWarehouses,
  useStockLevels,
  useAddStockMovement,
  useAddProducts,
} from "@/hooks/useStockData";
import { toast } from "sonner";

interface ParsedRow {
  rowNum: number;
  item_code: string;
  item_description: string;
  quantity: number;          // signed: positive = IN, negative = OUT
  product_id?: string;
  current_stock: number;
  error?: string;            // post-processing error (e.g. insufficient stock from server)
  willCreateProduct?: boolean;
}

type UploadState = "idle" | "parsed" | "uploading" | "done";

const MAIN_WAREHOUSE_NAME = "Main Warehouse";

// Yesterday at 12:00 local time, returned as ISO string
function yesterdayNoonISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

export default function SalesClearance() {
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
  const [resultRows, setResultRows] = useState<
    { row: ParsedRow; status: "in" | "out" | "skipped" | "error"; message?: string }[]
  >([]);

  const productMap = useMemo(() => {
    const m = new Map<string, { id: string; description: string | null }>();
    products?.forEach((p: any) =>
      m.set(p.item_code?.trim().toLowerCase(), { id: p.id, description: p.item_description })
    );
    return m;
  }, [products]);

  const mainWarehouse = useMemo(
    () =>
      warehouses?.find(
        (w: any) =>
          (w.warehouse_name || "").trim().toLowerCase() === MAIN_WAREHOUSE_NAME.toLowerCase()
      ),
    [warehouses]
  );

  const stockMap = useMemo(() => {
    const m = new Map<string, number>();
    if (!mainWarehouse) return m;
    stockLevels?.forEach((s: any) => {
      if (s.warehouse_id === mainWarehouse.id) {
        m.set(s.product_id, s.current_stock ?? 0);
      }
    });
    return m;
  }, [stockLevels, mainWarehouse]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResultRows([]);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target?.result, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      const parsed: ParsedRow[] = [];
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

        if (!itemCode) return;

        const existing = productMap.get(itemCode.toLowerCase());
        const entry: ParsedRow = {
          rowNum: idx + 2,
          item_code: itemCode,
          item_description: desc || existing?.description || "",
          quantity: isNaN(qty) ? 0 : qty,
          current_stock: existing ? stockMap.get(existing.id) ?? 0 : 0,
        };

        if (isNaN(qty) || qty === 0) {
          entry.error = "Quantity must be a non-zero number";
        } else if (!existing) {
          entry.willCreateProduct = true;
        } else {
          entry.product_id = existing.id;
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
  const inRows = validRows.filter((r) => r.quantity > 0);
  const outRows = validRows.filter((r) => r.quantity < 0);
  const newProductRows = validRows.filter((r) => r.willCreateProduct);

  const totals = useMemo(() => {
    let inUnits = 0;
    let outUnits = 0;
    inRows.forEach((r) => (inUnits += r.quantity));
    outRows.forEach((r) => (outUnits += -r.quantity));
    return { inUnits, outUnits, inLines: inRows.length, outLines: outRows.length };
  }, [inRows, outRows]);

  const handleUpload = async () => {
    if (!mainWarehouse) {
      toast.error(`"${MAIN_WAREHOUSE_NAME}" warehouse not found. Create it first under Master Data.`);
      return;
    }
    if (validRows.length === 0) return;

    setState("uploading");
    setProgress(0);

    // 1. Auto-create any missing products first
    const codeToProductId = new Map<string, string>();
    productMap.forEach((v, code) => codeToProductId.set(code, v.id));

    if (newProductRows.length > 0) {
      // Dedupe by code
      const seen = new Map<string, { item_code: string; item_description: string | null; category: null }>();
      newProductRows.forEach((r) => {
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
        // Map newly created products
        (created || []).forEach((p: any) => {
          codeToProductId.set(p.item_code.trim().toLowerCase(), p.id);
        });
        // Also fetch any that were dedup-skipped (already existed) — re-resolve from upsert returning
        toast.success(`Auto-created ${seen.size} new product${seen.size === 1 ? "" : "s"}`);
      } catch (err: any) {
        toast.error(`Failed to create new products: ${err.message}`);
        setState("parsed");
        return;
      }

      // For any rows whose product_id is still missing, try to look them up via a fresh products query
      const stillMissing = validRows.filter(
        (r) => !r.product_id && !codeToProductId.get(r.item_code.toLowerCase())
      );
      if (stillMissing.length > 0) {
        const { data: refetched } = await (await import("@/integrations/supabase/client")).supabase
          .from("products")
          .select("id, item_code")
          .in(
            "item_code",
            stillMissing.map((r) => r.item_code)
          );
        (refetched || []).forEach((p: any) => {
          codeToProductId.set(p.item_code.trim().toLowerCase(), p.id);
        });
      }
    }

    const batchId = crypto.randomUUID();
    const movementDate = yesterdayNoonISO();
    const results: typeof resultRows = [];
    let done = 0;

    for (const row of validRows) {
      const pid = row.product_id || codeToProductId.get(row.item_code.toLowerCase());
      if (!pid) {
        results.push({ row, status: "error", message: "Could not resolve product id" });
        done++;
        setProgress(Math.round((done / validRows.length) * 100));
        continue;
      }

      const isIn = row.quantity > 0;
      try {
        await addMovement.mutateAsync({
          product_id: pid,
          warehouse_id: mainWarehouse.id,
          movement_type: isIn ? "IN" : "OUT",
          quantity: Math.abs(row.quantity),
          reference_note: `Daily reconciliation ${fileName} (row ${row.rowNum})`,
          batch_id: batchId,
          movement_date: movementDate,
        });
        results.push({ row, status: isIn ? "in" : "out" });
      } catch (err: any) {
        results.push({
          row,
          status: "error",
          message: err.message ?? "Failed",
        });
      }
      done++;
      setProgress(Math.round((done / validRows.length) * 100));
    }

    setResultRows(results);
    setState("done");
    const okCount = results.filter((r) => r.status === "in" || r.status === "out").length;
    const failCount = results.filter((r) => r.status === "error").length;
    toast.success(`Posted ${okCount} movement${okCount === 1 ? "" : "s"}`);
    if (failCount > 0) toast.error(`${failCount} row${failCount === 1 ? "" : "s"} failed`);
  };

  const reset = () => {
    setRows([]);
    setState("idle");
    setProgress(0);
    setFileName("");
    setResultRows([]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const downloadTemplate = useCallback(() => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Item Code", "Item Description", "Quantity Of Units"],
      ["01CAS CAS 003", "CASTROL GTX 20 W 50 4X5LT", -4],
      ["01CAS CAS 003", "CASTROL GTX 20 W 50 4X5LT", -8],
      ["XYZ-001", "EXAMPLE STOCK RECEIPT", 24],
    ]);
    ws["!cols"] = [{ wch: 22 }, { wch: 36 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, "Daily Reconciliation");
    XLSX.writeFile(wb, "stock_reconciliation_template.xlsx");
  }, []);

  const downloadReport = useCallback(() => {
    if (resultRows.length === 0) {
      toast.info("Run the reconciliation first to generate a report");
      return;
    }
    const wb = XLSX.utils.book_new();

    const postedIn = resultRows.filter((r) => r.status === "in");
    const postedOut = resultRows.filter((r) => r.status === "out");
    const failed = resultRows.filter((r) => r.status === "error");

    const summary = [
      ["Daily Stock Reconciliation Report"],
      ["Source file", fileName],
      ["Warehouse", MAIN_WAREHOUSE_NAME],
      ["Movement date", new Date(yesterdayNoonISO()).toLocaleDateString()],
      ["Generated", new Date().toLocaleString()],
      [],
      ["Stock In — units", postedIn.reduce((s, r) => s + r.row.quantity, 0)],
      ["Stock In — line items", postedIn.length],
      ["Stock Out — units", postedOut.reduce((s, r) => s + -r.row.quantity, 0)],
      ["Stock Out — line items", postedOut.length],
      ["Failed rows", failed.length],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summary);
    wsSummary["!cols"] = [{ wch: 28 }, { wch: 32 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

    const buildSheet = (rs: typeof resultRows, signed: boolean) => [
      ["Row", "Item Code", "Item Description", "Quantity"],
      ...rs.map((r) => [
        r.row.rowNum,
        r.row.item_code,
        r.row.item_description,
        signed ? r.row.quantity : Math.abs(r.row.quantity),
      ]),
    ];

    const wsIn = XLSX.utils.aoa_to_sheet(buildSheet(postedIn, false));
    wsIn["!cols"] = [{ wch: 6 }, { wch: 22 }, { wch: 36 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsIn, "Stock In");

    const wsOut = XLSX.utils.aoa_to_sheet(buildSheet(postedOut, false));
    wsOut["!cols"] = [{ wch: 6 }, { wch: 22 }, { wch: 36 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsOut, "Stock Out");

    if (failed.length > 0) {
      const wsErr = XLSX.utils.aoa_to_sheet([
        ["Row", "Item Code", "Item Description", "Quantity", "Error"],
        ...failed.map((r) => [
          r.row.rowNum,
          r.row.item_code,
          r.row.item_description,
          r.row.quantity,
          r.message ?? "",
        ]),
      ]);
      wsErr["!cols"] = [{ wch: 6 }, { wch: 22 }, { wch: 36 }, { wch: 10 }, { wch: 40 }];
      XLSX.utils.book_append_sheet(wb, wsErr, "Failed");
    }

    const safeName = fileName.replace(/\.[^.]+$/, "") || "reconciliation";
    XLSX.writeFile(wb, `${safeName}_report.xlsx`);
    toast.success("Report downloaded");
  }, [resultRows, fileName]);

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between flex-wrap gap-3">
        <div>
          <p className="text-[10px] sm:text-xs uppercase tracking-[0.22em] text-muted-foreground/70 font-mono mb-1">
            End of Day
          </p>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Stock Reconciliation</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Upload yesterday's transactions for the{" "}
            <span className="font-semibold text-foreground">{MAIN_WAREHOUSE_NAME}</span>. Each row is
            one movement — <span className="text-stock-in font-semibold">positive</span> = stock in,{" "}
            <span className="text-destructive font-semibold">negative</span> = stock out. Columns:{" "}
            <span className="font-mono text-xs">Item Code</span>,{" "}
            <span className="font-mono text-xs">Item Description</span>,{" "}
            <span className="font-mono text-xs">Quantity Of Units</span>. Movements are dated{" "}
            <span className="font-semibold text-foreground">yesterday</span>. Unknown item codes are
            auto-created.
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
            <AlertTriangle className="h-4 w-4" /> Missing warehouse
          </p>
          <p className="text-muted-foreground mt-1">
            No warehouse named "{MAIN_WAREHOUSE_NAME}" exists. Create it under Master Data → Warehouses
            before uploading.
          </p>
        </div>
      )}

      {state === "idle" && (
        <label className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/20 p-12 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all">
          <Upload className="h-10 w-10 text-muted-foreground/60" />
          <span className="text-sm text-muted-foreground text-center px-3">
            Click to select an Excel file (.xlsx, .xls, .csv)
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
          <div className="flex items-center gap-3 px-4 py-3 bg-muted/40 rounded-xl border border-border">
            <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-mono flex-1 truncate">{fileName}</span>
            {state === "parsed" && (
              <Button variant="ghost" size="sm" onClick={reset} className="h-7 w-7 p-0">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-stock-in/30 bg-stock-in/5 px-4 py-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-stock-in font-mono">
                <ArrowUp className="h-3.5 w-3.5" /> Stock In
              </div>
              <p className="text-2xl font-semibold mt-1 text-stock-in">+{totals.inUnits}</p>
              <p className="text-[11px] text-muted-foreground font-mono">
                {totals.inLines} line{totals.inLines !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-destructive font-mono">
                <ArrowDown className="h-3.5 w-3.5" /> Stock Out
              </div>
              <p className="text-2xl font-semibold mt-1 text-destructive">−{totals.outUnits}</p>
              <p className="text-[11px] text-muted-foreground font-mono">
                {totals.outLines} line{totals.outLines !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary font-mono">
                <PackagePlus className="h-3.5 w-3.5" /> New Products
              </div>
              <p className="text-2xl font-semibold mt-1 text-primary">{newProductRows.length}</p>
              <p className="text-[11px] text-muted-foreground font-mono">will be auto-created</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-mono">
                <AlertTriangle className="h-3.5 w-3.5" /> Errors
              </div>
              <p className="text-2xl font-semibold mt-1">{errorRows.length}</p>
              <p className="text-[11px] text-muted-foreground font-mono">will be skipped</p>
            </div>
          </div>

          {errorRows.length > 0 && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-destructive">
                Rows with errors (will be skipped)
              </p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {errorRows.map((r) => (
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

          {validRows.length > 0 && state !== "done" && (
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <div className="overflow-x-auto max-h-[420px]">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 sticky top-0">
                    <tr className="border-b border-border/60">
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider font-mono">Row</th>
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider font-mono">
                        Item Code
                      </th>
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-4 py-2 text-right text-[11px] uppercase tracking-wider font-mono">
                        Current
                      </th>
                      <th className="px-4 py-2 text-right text-[11px] uppercase tracking-wider font-mono">
                        Qty
                      </th>
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider font-mono">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {validRows.slice(0, 200).map((r) => {
                      const isIn = r.quantity > 0;
                      return (
                        <tr key={r.rowNum} className="border-b border-border/60 last:border-b-0">
                          <td className="px-4 py-1.5 text-xs text-muted-foreground font-mono">
                            {r.rowNum}
                          </td>
                          <td className="px-4 py-1.5 font-mono text-sm">
                            {r.item_code}
                            {r.willCreateProduct && (
                              <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-mono uppercase tracking-wider">
                                <PackagePlus className="h-2.5 w-2.5" />
                                new
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-1.5 text-sm text-muted-foreground truncate max-w-[280px]">
                            {r.item_description || "—"}
                          </td>
                          <td className="px-4 py-1.5 text-sm font-mono text-right text-muted-foreground">
                            {r.willCreateProduct ? "—" : r.current_stock}
                          </td>
                          <td
                            className={`px-4 py-1.5 text-sm font-mono text-right font-semibold ${
                              isIn ? "text-stock-in" : "text-destructive"
                            }`}
                          >
                            {isIn ? `+${r.quantity}` : `${r.quantity}`}
                          </td>
                          <td className="px-4 py-1.5 text-xs">
                            {isIn ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stock-in/10 text-stock-in font-mono">
                                <ArrowUp className="h-3 w-3" /> IN
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-destructive/10 text-destructive font-mono">
                                <ArrowDown className="h-3 w-3" /> OUT
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {validRows.length > 200 && (
                <p className="text-xs text-muted-foreground px-4 py-2 bg-muted/20">
                  Showing 200 of {validRows.length} rows
                </p>
              )}
            </div>
          )}

          {/* Result table after upload */}
          {state === "done" && resultRows.length > 0 && (
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <div className="px-4 py-2 bg-muted/30 border-b border-border/60 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                Posted movements
              </div>
              <div className="overflow-x-auto max-h-[420px]">
                <table className="w-full text-sm">
                  <thead className="bg-muted/20 sticky top-0">
                    <tr className="border-b border-border/60">
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider font-mono">Row</th>
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider font-mono">
                        Item Code
                      </th>
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-4 py-2 text-right text-[11px] uppercase tracking-wider font-mono">
                        Qty
                      </th>
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider font-mono">
                        Result
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultRows.slice(0, 300).map((r, i) => {
                      const isIn = r.status === "in";
                      const isOut = r.status === "out";
                      const isErr = r.status === "error";
                      return (
                        <tr key={i} className="border-b border-border/60 last:border-b-0">
                          <td className="px-4 py-1.5 text-xs text-muted-foreground font-mono">
                            {r.row.rowNum}
                          </td>
                          <td className="px-4 py-1.5 font-mono text-sm">{r.row.item_code}</td>
                          <td className="px-4 py-1.5 text-sm text-muted-foreground truncate max-w-[280px]">
                            {r.row.item_description || "—"}
                          </td>
                          <td
                            className={`px-4 py-1.5 text-sm font-mono text-right font-semibold ${
                              isIn ? "text-stock-in" : isOut ? "text-destructive" : ""
                            }`}
                          >
                            {r.row.quantity > 0 ? `+${r.row.quantity}` : `${r.row.quantity}`}
                          </td>
                          <td className="px-4 py-1.5 text-xs">
                            {isIn && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stock-in/10 text-stock-in font-mono">
                                <CheckCircle2 className="h-3 w-3" /> IN posted
                              </span>
                            )}
                            {isOut && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-destructive/10 text-destructive font-mono">
                                <CheckCircle2 className="h-3 w-3" /> OUT posted
                              </span>
                            )}
                            {isErr && (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-destructive/15 text-destructive font-mono"
                                title={r.message}
                              >
                                <AlertTriangle className="h-3 w-3" /> {r.message ?? "Failed"}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {state === "uploading" && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground font-mono text-center">{progress}%</p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:flex-wrap">
            {state === "parsed" && validRows.length > 0 && (
              <>
                <Button
                  onClick={handleUpload}
                  disabled={!mainWarehouse}
                  className="gap-2 w-full sm:w-auto h-11 sm:h-10"
                >
                  <Upload className="h-4 w-4" />
                  Post {validRows.length} movement{validRows.length !== 1 ? "s" : ""}
                </Button>
                <Button
                  variant="outline"
                  onClick={reset}
                  className="gap-2 w-full sm:w-auto h-11 sm:h-10"
                >
                  Cancel
                </Button>
              </>
            )}
            {state === "done" && (
              <>
                <Button
                  onClick={downloadReport}
                  variant="outline"
                  className="gap-2 w-full sm:w-auto h-11 sm:h-10"
                >
                  <FileDown className="h-4 w-4" />
                  Download IN/OUT Report
                </Button>
                <Button onClick={reset} className="gap-2 w-full sm:w-auto h-11 sm:h-10">
                  Upload another file
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
