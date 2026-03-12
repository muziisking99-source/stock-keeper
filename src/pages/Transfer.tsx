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
import { ArrowLeftRight, FileText } from "lucide-react";
import { toast } from "sonner";
import { generateMovementReceipt, generateMovementReport } from "@/lib/pdfGenerator";

export default function Transfer() {
  const { data: products } = useProducts();
  const { data: warehouses } = useWarehouses();
  const { data: movements, isLoading } = useStockMovements();
  const { data: stockLevels } = useStockLevels();
  const transferStock = useTransferStock();

  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");

  const resetForm = () => {
    setProductId(""); setFromWarehouseId(""); setToWarehouseId(""); setQuantity(""); setNote(""); setOpen(false);
  };

  const getStock = (prodId: string, whId: string) => {
    const level = stockLevels?.find((s) => s.product_id === prodId && s.warehouse_id === whId);
    return (level?.current_stock as number) ?? 0;
  };

  const currentStock = productId && fromWarehouseId ? getStock(productId, fromWarehouseId) : null;
  const destinationWarehouses = warehouses?.filter((w: any) => w.id !== fromWarehouseId) ?? [];

  const handleSubmit = async () => {
    const qty = parseInt(quantity);
    if (!qty || qty <= 0) { toast.error("Quantity must be greater than 0"); return; }
    if (fromWarehouseId === toWarehouseId) { toast.error("Source and destination must be different"); return; }
    if (currentStock !== null && qty > currentStock) {
      toast.error(`Insufficient stock. Current: ${currentStock}`);
      return;
    }
    try {
      await transferStock.mutateAsync({
        product_id: productId,
        from_warehouse_id: fromWarehouseId,
        to_warehouse_id: toWarehouseId,
        quantity: qty,
        reference_note: note || undefined,
      });
      toast.success("Stock transferred successfully");
      resetForm();
    } catch (err: any) {
      toast.error(err.message || "Operation failed");
    }
  };

  const isValid = productId && fromWarehouseId && toWarehouseId && fromWarehouseId !== toWarehouseId && quantity && parseInt(quantity) > 0;
  const transferMovements = movements?.filter((m) => m.movement_type === "TRANSFER_IN" || m.movement_type === "TRANSFER_OUT") ?? [];

  const handleDownloadReceipt = (movement: any) => {
    generateMovementReceipt(movement, "Transfer Note");
  };

  const handleDownloadReport = () => {
    generateMovementReport(transferMovements, "Transfer Report");
  };

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
            <DialogContent>
              <DialogHeader><DialogTitle>Transfer Stock</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label>Product</Label>
                  <Select value={productId} onValueChange={setProductId}>
                    <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                    <SelectContent>
                      {products?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="font-mono">{p.item_code}</span> — {p.item_description || "No description"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
                    {currentStock !== null && (
                      <p className="text-xs text-muted-foreground mt-1 font-mono">Stock: {currentStock}</p>
                    )}
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
                  <Label>Quantity</Label>
                  <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Enter quantity" />
                </div>
                <div>
                  <Label>Reference Note (optional)</Label>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Transfer reason, etc." rows={2} />
                </div>
                <Button className="w-full" onClick={handleSubmit} disabled={!isValid || transferStock.isPending}>
                  {transferStock.isPending ? "Processing..." : "Transfer Stock"}
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
