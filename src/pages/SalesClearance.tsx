import { useState, useRef, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, X, Download, ArrowDown, ArrowUp, Minus, FileDown } from "lucide-react";
import { useProducts, useWarehouses, useStockLevels, useAddStockMovement } from "@/hooks/useStockData";
import { toast } from "sonner";

interface ParsedRow {
  rowNum: number;
  item_code: string;
  warehouse_name: string;
  new_quantity: number;       // value uploaded by user (target stock)
  current_stock: number;      // current stock in DB
  delta: number;              // new - current  (positive = IN, negative = OUT, 0 = no change)
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

      json.forEach((row, idx) => {
        const itemCode = String(row["Item Code"] ?? row["item_code"] ?? row["ItemCode"] ?? row["ITEM CODE"] ?? "").trim();
        const whName = String(row["Warehouse"] ?? row["warehouse"] ?? row["Warehouse Name"] ?? row["WAREHOUSE"] ?? "").trim();
        const qtyRaw = row["Quantity"] ?? row["quantity"] ?? row["QTY"] ?? row["Qty"] ?? row["qty"] ?? "";
        const qty = parseInt(String(qtyRaw));

        if (!itemCode) return;

        const pid = productMap.get(itemCode.toLowerCase());
        const wid = warehouseMap.get(whName.toLowerCase());
        const key = pid && wid ? `${pid}_${wid}` : "";
        const currentStock = key ? (stockMap.get(key) ?? 0) : 0;

        const entry: ParsedRow = {
          rowNum: idx + 2,
          item_code: itemCode,
          warehouse_name: whName,
          new_quantity: isNaN(qty) ? 0 : qty,
          current_stock: currentStock,
          delta: 0,
        };

        if (!pid) {
          entry.error = "Product not found";
        } else if (!wid) {
          entry.error = "Warehouse not found";
        } else if (isNaN(qty) || qty < 0) {
          entry.error = "Invalid quantity (must be 0 or greater)";
        } else {
          entry.product_id = pid;
          entry.warehouse_id = wid;
          entry.delta = qty - currentStock;
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
  const changedRows = validRows.filter((r) => r.delta !== 0);
  const unchangedRows = validRows.filter((r) => r.delta === 0);

  const totals = useMemo(() => {
    let inUnits = 0;
    let outUnits = 0;
    let inLines = 0;
    let outLines = 0;
    changedRows.forEach((r) => {
      if (r.delta > 0) {
        inUnits += r.delta;
        inLines++;
      } else if (r.delta < 0) {
        outUnits += -r.delta;
        outLines++;
      }
    });
    return { inUnits, outUnits, inLines, outLines };
  }, [changedRows]);

  const handleUpload = async () => {
    if (changedRows.length === 0) return;
    setState("uploading");
    setProgress(0);

    const batchId = crypto.randomUUID();
    let done = 0;

    for (const row of changedRows) {
      try {
        await addMovement.mutateAsync({
          product_id: row.product_id!,
          warehouse_id: row.warehouse_id!,
          movement_type: row.delta > 0 ? "IN" : "OUT",
          quantity: Math.abs(row.delta),
          reference_note: `Stock reconciliation from ${fileName} (was ${row.current_stock} → now ${row.new_quantity})`,
          batch_id: batchId,
        });
      } catch (err: any) {
        toast.error(`Row ${row.rowNum}: ${err.message}`);
      }
      done++;
      setProgress(Math.round((done / changedRows.length) * 100));
    }

    setState("done");
    toast.success(`Reconciled ${done} stock adjustments`);
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
      ["ITEM-001", "Main Warehouse", 25],
      ["ITEM-002", "Main Warehouse", 0],
    ]);
    ws["!cols"] = [{ wch: 20 }, { wch: 25 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, "Stock Reconciliation");
    XLSX.writeFile(wb, "stock_reconciliation_template.xlsx");
  }, []);

  const downloadReport = useCallback(() => {
    if (changedRows.length === 0) {
      toast.info("No changes to report");
      return;
    }
    const wb = XLSX.utils.book_new();

    const inRows = changedRows.filter((r) => r.delta > 0);
    const outRows = changedRows.filter((r) => r.delta < 0);

    const summary = [
      ["Stock Reconciliation Report"],
      ["Source file", fileName],
      ["Generated", new Date().toLocaleString()],
      [],
      ["Stock In — units", totals.inUnits],
      ["Stock In — line items", totals.inLines],
      ["Stock Out — units", totals.outUnits],
      ["Stock Out — line items", totals.outLines],
      ["Unchanged line items", unchangedRows.length],
      ["Errors (skipped)", errorRows.length],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summary);
    wsSummary["!cols"] = [{ wch: 26 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

    const buildSheet = (rows: ParsedRow[]) =>
      [
        ["Item Code", "Warehouse", "Previous Stock", "New Stock", "Change"],
        ...rows.map((r) => [
          r.item_code,
          r.warehouse_name,
          r.current_stock,
          r.new_quantity,
          r.delta,
        ]),
      ];

    const wsIn = XLSX.utils.aoa_to_sheet(buildSheet(inRows));
    wsIn["!cols"] = [{ wch: 18 }, { wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, wsIn, "Stock In");

    const wsOut = XLSX.utils.aoa_to_sheet(buildSheet(outRows));
    wsOut["!cols"] = [{ wch: 18 }, { wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, wsOut, "Stock Out");

    if (errorRows.length > 0) {
      const wsErr = XLSX.utils.aoa_to_sheet([
        ["Row", "Item Code", "Warehouse", "Quantity", "Error"],
        ...errorRows.map((r) => [r.rowNum, r.item_code, r.warehouse_name, r.new_quantity, r.error ?? ""]),
      ]);
      wsErr["!cols"] = [{ wch: 6 }, { wch: 18 }, { wch: 22 }, { wch: 10 }, { wch: 32 }];
      XLSX.utils.book_append_sheet(wb, wsErr, "Errors");
    }

    const safeName = fileName.replace(/\.[^.]+$/, "") || "reconciliation";
    XLSX.writeFile(wb, `${safeName}_report.xlsx`);
    toast.success("Report downloaded");
  }, [changedRows, errorRows, unchangedRows.length, totals, fileName]);

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between flex-wrap gap-3">
        <div>
          <p className="text-[10px] sm:text-xs uppercase tracking-[0.22em] text-muted-foreground/70 font-mono mb-1">End of Day</p>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Stock Reconciliation</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Upload your actual current stock counts. The system compares them to the system stock and creates the IN/OUT movements needed to match. Columns:{" "}
            <span className="font-mono text-xs">Item Code</span>,{" "}
            <span className="font-mono text-xs">Warehouse</span>,{" "}
            <span className="font-mono text-xs">Quantity</span>
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2 w-full sm:w-auto" onClick={downloadTemplate}>
          <Download className="h-4 w-4" />
          Download Template
        </Button>
      </div>

      {state === "idle" && (
        <label className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/20 p-12 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all">
          <Upload className="h-10 w-10 text-muted-foreground/60" />
          <span className="text-sm text-muted-foreground">Click to select an Excel file (.xlsx, .xls, .csv)</span>
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
            <span className="text-sm font-mono flex-1">{fileName}</span>
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
              <p className="text-[11px] text-muted-foreground font-mono">{totals.inLines} item{totals.inLines !== 1 ? "s" : ""}</p>
            </div>
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-destructive font-mono">
                <ArrowDown className="h-3.5 w-3.5" /> Stock Out
              </div>
              <p className="text-2xl font-semibold mt-1 text-destructive">−{totals.outUnits}</p>
              <p className="text-[11px] text-muted-foreground font-mono">{totals.outLines} item{totals.outLines !== 1 ? "s" : ""}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-mono">
                <Minus className="h-3.5 w-3.5" /> No Change
              </div>
              <p className="text-2xl font-semibold mt-1">{unchangedRows.length}</p>
              <p className="text-[11px] text-muted-foreground font-mono">already matching</p>
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
              <div className="overflow-x-auto max-h-[420px]">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 sticky top-0">
                    <tr className="border-b border-border/60">
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider font-mono">Row</th>
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider font-mono">Item Code</th>
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider">Warehouse</th>
                      <th className="px-4 py-2 text-right text-[11px] uppercase tracking-wider font-mono">Current</th>
                      <th className="px-4 py-2 text-right text-[11px] uppercase tracking-wider font-mono">New</th>
                      <th className="px-4 py-2 text-right text-[11px] uppercase tracking-wider font-mono">Change</th>
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider font-mono">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validRows.slice(0, 200).map((r) => {
                      const isIn = r.delta > 0;
                      const isOut = r.delta < 0;
                      const noChange = r.delta === 0;
                      return (
                        <tr key={r.rowNum} className="border-b border-border/60 last:border-b-0">
                          <td className="px-4 py-1.5 text-xs text-muted-foreground font-mono">{r.rowNum}</td>
                          <td className="px-4 py-1.5 font-mono text-sm">{r.item_code}</td>
                          <td className="px-4 py-1.5 text-sm">{r.warehouse_name}</td>
                          <td className="px-4 py-1.5 text-sm font-mono text-right text-muted-foreground">{r.current_stock}</td>
                          <td className="px-4 py-1.5 text-sm font-mono text-right">{r.new_quantity}</td>
                          <td className={`px-4 py-1.5 text-sm font-mono text-right font-semibold ${
                            isIn ? "text-stock-in" : isOut ? "text-destructive" : "text-muted-foreground"
                          }`}>
                            {isIn ? `+${r.delta}` : isOut ? `${r.delta}` : "—"}
                          </td>
                          <td className="px-4 py-1.5 text-xs">
                            {isIn && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stock-in/10 text-stock-in font-mono">
                                <ArrowUp className="h-3 w-3" /> IN
                              </span>
                            )}
                            {isOut && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-destructive/10 text-destructive font-mono">
                                <ArrowDown className="h-3 w-3" /> OUT
                              </span>
                            )}
                            {noChange && (
                              <span className="text-muted-foreground/60 font-mono">no change</span>
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

          {state === "uploading" && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground font-mono text-center">{progress}%</p>
            </div>
          )}

          <div className="flex gap-3 flex-wrap">
            {state === "parsed" && changedRows.length > 0 && (
              <>
                <Button onClick={handleUpload} className="gap-2">
                  <Upload className="h-4 w-4" />
                  Apply {changedRows.length} adjustment{changedRows.length !== 1 ? "s" : ""}
                  <span className="ml-1 text-xs opacity-80 font-mono">
                    ({totals.inLines} in / {totals.outLines} out)
                  </span>
                </Button>
                <Button variant="outline" onClick={downloadReport} className="gap-2">
                  <FileDown className="h-4 w-4" />
                  Preview report
                </Button>
              </>
            )}
            {state === "parsed" && changedRows.length === 0 && validRows.length > 0 && (
              <p className="text-sm text-muted-foreground">All uploaded values already match current stock — nothing to apply.</p>
            )}
            {state === "done" && (
              <>
                <Button onClick={downloadReport} className="gap-2">
                  <FileDown className="h-4 w-4" />
                  Download IN/OUT report
                </Button>
                <Button onClick={reset} variant="outline">Upload another file</Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
