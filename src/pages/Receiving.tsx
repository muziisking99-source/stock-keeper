import { useState } from "react";
import {
  useProducts,
  useWarehouses,
  useAddStockMovement,
  useStockMovements,
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
import { ArrowDownToLine, FileText, Warehouse, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { generateMovementReceipt, generateMovementReport } from "@/lib/pdfGenerator";
import MovementLineItems, { type LineItem, newLine } from "@/components/MovementLineItems";
import { groupByBatch } from "@/lib/groupMovements";

export default function Receiving() {
  const { data: products } = useProducts();
  const { data: warehouses } = useWarehouses();
  const { data: movements, isLoading } = useStockMovements();
  const addMovement = useAddStockMovement();

  const [open, setOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<LineItem[]>([newLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());

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
          movement_type: "IN",
          quantity: parseInt(line.quantity),
          reference_note: note || undefined,
          batch_id: batchId,
        });
      }
      toast.success(`${lines.length} item(s) received successfully`);
      resetForm();
    } catch (err: any) {
      toast.error(err.message || "Operation failed");
    } finally {
      setSubmitting(false);
    }
  };

  const receiveMovements = movements?.filter((m) => m.movement_type === "IN") ?? [];
  const grouped = groupByBatch(receiveMovements);
  const handleDownloadReceipt = (movement: any) => generateMovementReceipt(movement, "Goods Received Note");
  const handleDownloadReport = () => generateMovementReport(receiveMovements, "Receiving Report");

  const toggleBatch = (batchId: string) => {
    setExpandedBatches((prev) => {
      const next = new Set(prev);
      next.has(batchId) ? next.delete(batchId) : next.add(batchId);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground/70 font-mono mb-1">Inbound</p>
          <h1 className="text-2xl font-semibold tracking-tight">Receiving</h1>
          <p className="mt-1 text-xs text-muted-foreground">Receive stock into any warehouse.</p>
        </div>
        <div className="flex gap-2">
          {receiveMovements.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleDownloadReport}>
              <FileText className="h-4 w-4 mr-2" /> Summary PDF
            </Button>
          )}
          <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : resetForm())}>
            <DialogTrigger asChild>
              <Button variant="outline" className="text-stock-in border-stock-in/30 hover:bg-stock-in/10">
                <ArrowDownToLine className="h-4 w-4 mr-2" /> Receive Stock
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
              <div className="bg-gradient-to-r from-stock-in/15 to-stock-in/5 border-b border-stock-in/20 px-6 py-5">
                <DialogHeader>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-stock-in/20 flex items-center justify-center">
                      <ArrowDownToLine className="h-5 w-5 text-stock-in" />
                    </div>
                    <div>
                      <DialogTitle className="text-lg">Receive Stock</DialogTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">Add incoming goods to a warehouse</p>
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
                        <SelectItem key={w.id} value={w.id}>{w.warehouse_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <MovementLineItems
                  lines={lines}
                  products={products as any}
                  onUpdate={updateLine}
                  onRemove={removeLine}
                  onAdd={addLine}
                  accentClass="text-stock-in"
                />

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reference Note</Label>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="PO number, supplier, reason…" rows={2} className="bg-background" />
                </div>

                <Button
                  className="w-full h-11 bg-stock-in hover:bg-stock-in/90 text-stock-in-foreground font-semibold"
                  onClick={handleSubmit} disabled={!isValid || submitting}
                >
                  {submitting ? "Processing…" : `Receive ${lines.length} Item(s)`}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="bg-card/95 border border-border/70 rounded-2xl shadow-sm">
        <div className="px-5 py-4 border-b border-border/70">
          <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">Receiving History</h2>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
        ) : !grouped.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm">No receiving records yet.</div>
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
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {grouped.map((group) => {
                  const isMulti = group.movements.length > 1;
                  const isExpanded = expandedBatches.has(group.batchId);
                  const totalQty = group.movements.reduce((s: number, m: any) => s + m.quantity, 0);
                  const itemCodes = group.movements.map((m: any) => (m.products as any)?.item_code).join(", ");

                  return (
                    <>
                      <TableRow
                        key={group.batchId}
                        className={`hover:bg-muted/40 ${isMulti ? "cursor-pointer" : ""}`}
                        onClick={() => isMulti && toggleBatch(group.batchId)}
                      >
                        <TableCell className="w-8 px-2">
                          {isMulti && (isExpanded
                            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="text-sm font-mono text-muted-foreground">{new Date(group.date).toLocaleDateString()}</TableCell>
                        <TableCell className="font-mono text-sm font-medium">
                          {isMulti ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="bg-stock-in/15 text-stock-in text-[10px] font-semibold px-1.5 py-0.5 rounded-full">{group.movements.length}</span>
                              <span className="text-muted-foreground text-xs truncate max-w-[180px]">{itemCodes}</span>
                            </span>
                          ) : itemCodes}
                        </TableCell>
                        <TableCell className="text-sm">{group.warehouse}</TableCell>
                        <TableCell className="text-sm font-mono text-right font-medium">{totalQty}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[220px] truncate">{group.note || "—"}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleDownloadReceipt(group.movements[0]); }}>
                            <FileText className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                      {isMulti && isExpanded && group.movements.map((m: any) => (
                        <TableRow key={m.id} className="bg-muted/20 hover:bg-muted/30">
                          <TableCell />
                          <TableCell className="text-xs font-mono text-muted-foreground pl-6">{new Date(m.movement_date).toLocaleDateString()}</TableCell>
                          <TableCell className="font-mono text-xs">{(m.products as any)?.item_code}</TableCell>
                          <TableCell className="text-xs">{(m.warehouses as any)?.warehouse_name}</TableCell>
                          <TableCell className="text-xs font-mono text-right">{m.quantity}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{m.reference_note || "—"}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => handleDownloadReceipt(m)}>
                              <FileText className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
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
