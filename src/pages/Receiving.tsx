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
import { ArrowDownToLine, FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { generateMovementReceipt, generateMovementReport } from "@/lib/pdfGenerator";

interface LineItem {
  id: string;
  productId: string;
  quantity: string;
}

let lineIdCounter = 0;
const newLine = (): LineItem => ({ id: String(++lineIdCounter), productId: "", quantity: "" });

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
      for (const line of lines) {
        await addMovement.mutateAsync({
          product_id: line.productId,
          warehouse_id: warehouseId,
          movement_type: "IN",
          quantity: parseInt(line.quantity),
          reference_note: note || undefined,
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

  const handleDownloadReceipt = (movement: any) => generateMovementReceipt(movement, "Goods Received Note");
  const handleDownloadReport = () => generateMovementReport(receiveMovements, "Receiving Report");

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
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Receive Stock</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
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
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-medium">Items</Label>
                    <Button type="button" variant="ghost" size="sm" onClick={addLine} className="h-7 text-xs">
                      <Plus className="h-3 w-3 mr-1" /> Add Item
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {lines.map((line, idx) => (
                      <div key={line.id} className="flex gap-2 items-start">
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
                    ))}
                  </div>
                </div>

                <div>
                  <Label>Reference Note (optional)</Label>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="PO number, reason, etc." rows={2} />
                </div>
                <Button className="w-full" onClick={handleSubmit} disabled={!isValid || submitting}>
                  {submitting ? "Processing..." : `Receive ${lines.length} Item(s)`}
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
