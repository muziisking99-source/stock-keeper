import { useState } from "react";
import {
  useProducts,
  useWarehouses,
  useAddStockMovement,
  useStockMovements,
  useStockLevels,
} from "@/hooks/useStockData";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ArrowUpFromLine, FileText, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { generateMovementReceipt, generateMovementReport } from "@/lib/pdfGenerator";
import MovementLineItems, { type LineItem, newLine } from "@/components/MovementLineItems";

export default function Issuing() {
  const { data: products } = useProducts();
  const { data: warehouses } = useWarehouses();
  const { data: movements, isLoading } = useStockMovements();
  const { data: stockLevels } = useStockLevels();
  const addMovement = useAddStockMovement();

  const [open, setOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<LineItem[]>([newLine()]);
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setWarehouseId(""); setNote(""); setLines([newLine()]); setOpen(false);
  };

  const updateLine = (id: string, field: keyof LineItem, value: string) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  };
  const removeLine = (id: string) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.id !== id)));
  };
  const addLine = () => setLines((prev) => [...prev, newLine()]);

  const getStock = (prodId: string, whId: string) => {
    const level = stockLevels?.find((s) => s.product_id === prodId && s.warehouse_id === whId);
    return (level?.current_stock as number) ?? 0;
  };

  const isValid = warehouseId && lines.every((l) => l.productId && l.quantity && parseInt(l.quantity) > 0);

  const handleSubmit = async () => {
    if (!isValid) return;
    for (const line of lines) {
      const stock = getStock(line.productId, warehouseId);
      const qty = parseInt(line.quantity);
      if (qty > stock) {
        const product = products?.find((p) => p.id === line.productId);
        toast.error(`Insufficient stock for ${product?.item_code || "item"}. Available: ${stock}`);
        return;
      }
    }
    setSubmitting(true);
    try {
      for (const line of lines) {
        await addMovement.mutateAsync({
          product_id: line.productId,
          warehouse_id: warehouseId,
          movement_type: "OUT",
          quantity: parseInt(line.quantity),
          reference_note: note || undefined,
        });
      }
      toast.success(`${lines.length} item(s) issued successfully`);
      resetForm();
    } catch (err: any) {
      toast.error(err.message || "Operation failed");
    } finally {
      setSubmitting(false);
    }
  };

  const issueMovements = movements?.filter((m) => m.movement_type === "OUT") ?? [];
  const handleDownloadReceipt = (movement: any) => generateMovementReceipt(movement, "Issue Slip");
  const handleDownloadReport = () => generateMovementReport(issueMovements, "Issuing Report");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground/70 font-mono mb-1">Outbound</p>
          <h1 className="text-2xl font-semibold tracking-tight">Issuing</h1>
          <p className="mt-1 text-xs text-muted-foreground">Issue stock from any warehouse.</p>
        </div>
        <div className="flex gap-2">
          {issueMovements.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleDownloadReport}>
              <FileText className="h-4 w-4 mr-2" /> Summary PDF
            </Button>
          )}
          <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : resetForm())}>
            <DialogTrigger asChild>
              <Button variant="outline" className="text-stock-out border-stock-out/30 hover:bg-stock-out/10">
                <ArrowUpFromLine className="h-4 w-4 mr-2" /> Issue Stock
              </Button>
            </DialogTrigger>
            <DialogContent
              className="max-w-lg max-h-[85vh] overflow-y-auto p-0"
              onInteractOutside={(e) => {
                const target = e.target as HTMLElement;
                if (target.closest("#product-search-dropdown")) {
                  e.preventDefault();
                }
              }}
            >
              {/* Colored header */}
              <div className="bg-gradient-to-r from-stock-out/15 to-stock-out/5 border-b border-stock-out/20 px-6 py-5">
                <DialogHeader>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-stock-out/20 flex items-center justify-center">
                      <ArrowUpFromLine className="h-5 w-5 text-stock-out" />
                    </div>
                    <div>
                      <DialogTitle className="text-lg">Issue Stock</DialogTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">Dispatch goods from a warehouse</p>
                    </div>
                  </div>
                </DialogHeader>
              </div>

              <div className="space-y-5 px-6 py-5">
                {/* Warehouse */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Warehouse className="h-3.5 w-3.5" /> Source Warehouse
                  </Label>
                  <Select value={warehouseId} onValueChange={setWarehouseId}>
                    <SelectTrigger className="bg-background"><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                    <SelectContent>
                      {warehouses?.map((w: any) => (
                        <SelectItem key={w.id} value={w.id}>{w.warehouse_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Line items */}
                <MovementLineItems
                  lines={lines}
                  products={products as any}
                  onUpdate={updateLine}
                  onRemove={removeLine}
                  onAdd={addLine}
                  accentClass="text-stock-out"
                  getStock={warehouseId ? (pid) => getStock(pid, warehouseId) : undefined}
                />

                {/* Note */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reference Note</Label>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason, order ref, etc." rows={2} className="bg-background" />
                </div>

                {/* Submit */}
                <Button
                  className="w-full h-11 bg-stock-out hover:bg-stock-out/90 text-stock-out-foreground font-semibold"
                  onClick={handleSubmit} disabled={!isValid || submitting}
                >
                  {submitting ? "Processing…" : `Issue ${lines.length} Item(s)`}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="bg-card/95 border border-border/70 rounded-2xl shadow-sm">
        <div className="px-5 py-4 border-b border-border/70">
          <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">Issuing History</h2>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
        ) : !issueMovements.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm">No issuing records yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] uppercase tracking-[0.18em]">Date</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-[0.18em]">Item Code</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.18em]">Warehouse</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.18em] text-right">Qty</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.18em]">Note</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {issueMovements.map((m) => (
                  <TableRow key={m.id} className="hover:bg-muted/40">
                    <TableCell className="text-sm font-mono text-muted-foreground">{new Date(m.movement_date).toLocaleDateString()}</TableCell>
                    <TableCell className="font-mono text-sm font-medium">{(m.products as any)?.item_code}</TableCell>
                    <TableCell className="text-sm">{(m.warehouses as any)?.warehouse_name}</TableCell>
                    <TableCell className="text-sm font-mono text-right font-medium">{m.quantity}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[220px] truncate">{m.reference_note || "—"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => handleDownloadReceipt(m)}>
                        <FileText className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
