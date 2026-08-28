import { useState } from "react";
import {
  useProducts,
  useWarehouses,
  useAddStockMovement,
  useStockMovements,
  useUndoCreditBatch,
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
import { Input } from "@/components/ui/input";
import { Undo2, Warehouse, ChevronDown, ChevronRight, Plus, Trash2, Search, Check, Package, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { groupByBatch, type MovementGroup } from "@/lib/groupMovements";

const REASONS = ["Customer Return", "Wrong Item", "Defective", "Other"] as const;
type Reason = typeof REASONS[number];

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
  const { data: movements, isLoading } = useStockMovements(["CREDIT"]);
  const addMovement = useAddStockMovement();
  const undoCreditBatch = useUndoCreditBatch();

  const [open, setOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<CreditLine[]>([newCreditLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [undoTarget, setUndoTarget] = useState<MovementGroup | null>(null);

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

  const grouped = groupByBatch(movements ?? []);
  const lastCredit = grouped[0] ?? null;

  const handleUndo = async () => {
    if (!undoTarget) return;
    try {
      const count = await undoCreditBatch.mutateAsync(undoTarget.batchId);
      toast.success(`Undid ${count} credit${count === 1 ? "" : "s"} — stock levels updated`);
      setUndoTarget(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to undo credit");
    }
  };

  const formatUndoSummary = (group: MovementGroup) => {
    const totalQty = group.movements.reduce((s: number, m: any) => s + m.quantity, 0);
    const itemCount = group.movements.length;
    const date = new Date(group.date).toLocaleString();
    return `${itemCount} line${itemCount === 1 ? "" : "s"}, ${totalQty} unit${totalQty === 1 ? "" : "s"} · ${group.warehouse} · ${date}`;
  };

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
        <div className="flex flex-col sm:flex-row gap-2">
          {lastCredit && (
            <Button
              variant="outline"
              className="text-destructive border-destructive/40 hover:bg-destructive/10"
              onClick={() => setUndoTarget(lastCredit)}
              disabled={undoCreditBatch.isPending}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Undo Last Credit
            </Button>
          )}
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
      </div>

      <AlertDialog open={!!undoTarget} onOpenChange={(open) => !open && setUndoTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo this credit?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>This will remove the credit and reduce stock by the credited amounts.</p>
                {undoTarget && (
                  <p className="font-mono text-xs bg-muted/50 rounded-lg px-3 py-2 text-foreground">
                    {formatUndoSummary(undoTarget)}
                    {undoTarget.note ? (
                      <span className="block mt-1 text-muted-foreground truncate">{undoTarget.note}</span>
                    ) : null}
                  </p>
                )}
                <p>If stock has already been issued since this credit, undo may be blocked.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUndo}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {undoCreditBatch.isPending ? "Undoing…" : "Undo Credit"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                  <TableHead className="text-[11px] uppercase tracking-[0.18em] text-right w-24">Actions</TableHead>
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
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              setUndoTarget(group);
                            }}
                            disabled={undoCreditBatch.isPending}
                          >
                            <RotateCcw className="h-3.5 w-3.5 mr-1" />
                            Undo
                          </Button>
                        </TableCell>
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
                          <TableCell />
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
