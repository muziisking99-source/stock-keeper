import { useState } from "react";
import {
  useProducts,
  useWarehouses,
  useTransferStock,
  useStockMovements,
  useStockLevels,
} from "@/hooks/useStockData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { ArrowLeftRight, FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { generateMovementReceipt, generateMovementReport } from "@/lib/pdfGenerator";

interface LineItem {
  id: string;
  productId: string;
  quantity: string;
}

let lineIdCounter = 0;
const newLine = (): LineItem => ({ id: String(++lineIdCounter), productId: "", quantity: "" });

export default function Transfer() {
  const { data: products } = useProducts();
  const { data: warehouses } = useWarehouses();
  const { data: movements, isLoading } = useStockMovements();
  const { data: stockLevels } = useStockLevels();
  const transferStock = useTransferStock();

  const [open, setOpen] = useState(false);
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<LineItem[]>([newLine()]);
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setFromWarehouseId(""); setToWarehouseId(""); setNote(""); setLines([newLine()]); setOpen(false);
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

  const destinationWarehouses = warehouses?.filter((w: any) => w.id !== fromWarehouseId) ?? [];

  const isValid = fromWarehouseId && toWarehouseId && fromWarehouseId !== toWarehouseId &&
    lines.every((l) => l.productId && l.quantity && parseInt(l.quantity) > 0);

  const handleSubmit = async () => {
    if (!isValid) return;
    // Validate stock for all lines
    for (const line of lines) {
      const stock = getStock(line.productId, fromWarehouseId);
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
        await transferStock.mutateAsync({
          product_id: line.productId,
          from_warehouse_id: fromWarehouseId,
          to_warehouse_id: toWarehouseId,
          quantity: parseInt(line.quantity),
          reference_note: note || undefined,
        });
      }
      toast.success(`${lines.length} item(s) transferred successfully`);
      resetForm();
    } catch (err: any) {
      toast.error(err.message || "Operation failed");
    } finally {
      setSubmitting(false);
    }
  };

  const transferMovements = movements?.filter((m) => m.movement_type === "TRANSFER_IN" || m.movement_type === "TRANSFER_OUT") ?? [];

  const handleDownloadReceipt = (movement: any) => generateMovementReceipt(movement, "Transfer Note");
  const handleDownloadReport = () => generateMovementReport(transferMovements, "Transfer Report");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground/70 font-mono mb-1">Internal</p>
          <h1 className="text-2xl font-semibold tracking-tight">Transfer</h1>
          <p className="mt-1 text-xs text-muted-foreground">Transfer stock between any warehouses.</p>
        </div>
        <div className="flex gap-2">
          {transferMovements.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleDownloadReport}>
              <FileText className="h-4 w-4 mr-2" /> Summary PDF
            </Button>
          )}
          <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : resetForm())}>
            <DialogTrigger asChild>
              <Button variant="outline" className="text-stock-transfer border-stock-transfer/30 hover:bg-stock-transfer/10">
                <ArrowLeftRight className="h-4 w-4 mr-2" /> Transfer Stock
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Transfer Stock</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>From</Label>
                    <Select value={fromWarehouseId} onValueChange={setFromWarehouseId}>
                      <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                      <SelectContent>
                        {warehouses?.map((w: any) => (
                          <SelectItem key={w.id} value={w.id}>{w.warehouse_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>To</Label>
                    <Select value={toWarehouseId} onValueChange={setToWarehouseId}>
                      <SelectTrigger><SelectValue placeholder="Destination" /></SelectTrigger>
                      <SelectContent>
                        {destinationWarehouses.map((w: any) => (
                          <SelectItem key={w.id} value={w.id}>{w.warehouse_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-medium">Items</Label>
                    <Button type="button" variant="ghost" size="sm" onClick={addLine} className="h-7 text-xs">
                      <Plus className="h-3 w-3 mr-1" /> Add Item
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {lines.map((line, idx) => {
                      const stock = fromWarehouseId && line.productId ? getStock(line.productId, fromWarehouseId) : null;
                      return (
                        <div key={line.id} className="space-y-1">
                          <div className="flex gap-2 items-start">
                            <div className="flex-1">
                              <Select value={line.productId} onValueChange={(v) => updateLine(line.id, "productId", v)}>
                                <SelectTrigger className="h-9 text-xs">
                                  <SelectValue placeholder={`Product ${idx + 1}`} />
                                </SelectTrigger>
                                <SelectContent>
                                  {products?.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                      <span className="font-mono">{p.item_code}</span> — {p.item_description || "N/A"}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <Input
                              type="number" min="1" value={line.quantity}
                              onChange={(e) => updateLine(line.id, "quantity", e.target.value)}
                              placeholder="Qty" className="w-20 h-9 text-xs"
                            />
                            <Button type="button" variant="ghost" size="sm" onClick={() => removeLine(line.id)}
                              disabled={lines.length <= 1} className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          {stock !== null && (
                            <p className="text-[10px] text-muted-foreground font-mono pl-1">Available: {stock}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <Label>Reference Note (optional)</Label>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Transfer reason, etc." rows={2} />
                </div>
                <Button className="w-full" onClick={handleSubmit} disabled={!isValid || submitting}>
                  {submitting ? "Processing..." : `Transfer ${lines.length} Item(s)`}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="bg-card/95 border border-border/70 rounded-2xl shadow-sm">
        <div className="px-5 py-4 border-b border-border/70">
          <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">Transfer History</h2>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
        ) : !transferMovements.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm">No transfers yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] uppercase tracking-[0.18em]">Date</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.18em]">Type</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-[0.18em]">Item Code</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.18em]">Warehouse</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.18em] text-right">Qty</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.18em]">Note</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {transferMovements.map((m) => (
                  <TableRow key={m.id} className="hover:bg-muted/40">
                    <TableCell className="text-sm font-mono text-muted-foreground">{new Date(m.movement_date).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-mono font-medium bg-stock-transfer/15 text-stock-transfer">
                        {m.movement_type}
                      </span>
                    </TableCell>
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
