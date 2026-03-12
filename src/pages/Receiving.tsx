import { useState } from "react";
import {
  useProducts,
  useWarehouses,
  useAddStockMovement,
  useStockMovements,
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
import { ArrowDownToLine, FileText } from "lucide-react";
import { toast } from "sonner";
import { generateMovementReceipt, generateMovementReport } from "@/lib/pdfGenerator";

export default function Receiving() {
  const { data: products } = useProducts();
  const { data: warehouses } = useWarehouses();
  const { data: movements, isLoading } = useStockMovements();
  const addMovement = useAddStockMovement();

  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");

  const resetForm = () => { setProductId(""); setWarehouseId(""); setQuantity(""); setNote(""); setOpen(false); };

  const handleSubmit = async () => {
    const qty = parseInt(quantity);
    if (!qty || qty <= 0) { toast.error("Quantity must be greater than 0"); return; }
    try {
      await addMovement.mutateAsync({
        product_id: productId,
        warehouse_id: warehouseId,
        movement_type: "IN",
        quantity: qty,
        reference_note: note || undefined,
      });
      toast.success("Stock received successfully");
      resetForm();
    } catch (err: any) {
      toast.error(err.message || "Operation failed");
    }
  };

  const isValid = productId && warehouseId && quantity && parseInt(quantity) > 0;
  const receiveMovements = movements?.filter((m) => m.movement_type === "IN") ?? [];

  const handleDownloadReceipt = (movement: any) => {
    generateMovementReceipt(movement, "Goods Received Note");
  };

  const handleDownloadReport = () => {
    generateMovementReport(receiveMovements, "Receiving Report");
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
            <DialogContent>
              <DialogHeader><DialogTitle>Receive Stock</DialogTitle></DialogHeader>
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
                <div>
                  <Label>Warehouse</Label>
                  <Select value={warehouseId} onValueChange={setWarehouseId}>
                    <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                    <SelectContent>
                      {warehouses?.map((w: any) => (
                        <SelectItem key={w.id} value={w.id}>{w.warehouse_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Quantity</Label>
                  <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Enter quantity" />
                </div>
                <div>
                  <Label>Reference Note (optional)</Label>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="PO number, reason, etc." rows={2} />
                </div>
                <Button className="w-full" onClick={handleSubmit} disabled={!isValid || addMovement.isPending}>
                  {addMovement.isPending ? "Processing..." : "Receive Stock"}
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
        ) : !receiveMovements.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm">No receiving records yet.</div>
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
                {receiveMovements.map((m) => (
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
