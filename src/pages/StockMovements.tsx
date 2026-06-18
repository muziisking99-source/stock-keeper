import { useState } from "react";
import {
  useProducts,
  useWarehouses,
  useStockMovements,
  useAddStockMovement,
  useTransferStock,
  useStockLevels,
} from "@/hooks/useStockData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";

type ModalType = "receive" | "issue" | "transfer" | null;

export default function StockMovements() {
  const { data: products } = useProducts();
  const { data: warehouses } = useWarehouses();
  const { data: movements, isLoading } = useStockMovements();
  const { data: stockLevels } = useStockLevels();
  const addMovement = useAddStockMovement();
  const transferStock = useTransferStock();

  // Business rules:
  // - Exactly one Picking Floor warehouse (by name).
  // - Only the Picking Floor can dispatch (Issue / OUT).
  // - Storage warehouses can only move stock to the Picking Floor (Transfer).
  const pickingFloor = warehouses?.find(
    (w: any) => w.warehouse_name?.toLowerCase() === "picking floor"
  );
  const storageWarehouses =
    warehouses?.filter((w: any) => w.id !== pickingFloor?.id) ?? warehouses ?? [];

  const [modal, setModal] = useState<ModalType>(null);
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const resetForm = () => {
    setProductId("");
    setWarehouseId("");
    setFromWarehouseId("");
    setToWarehouseId("");
    setQuantity("");
    setNote("");
    setModal(null);
  };

  const getStock = (prodId: string, whId: string) => {
    const level = stockLevels?.find(
      (s) => s.product_id === prodId && s.warehouse_id === whId
    );
    return (level?.current_stock as number) ?? 0;
  };

  const handleSubmit = async () => {
    const qty = parseInt(quantity);
    if (!qty || qty <= 0) {
      toast.error("Quantity must be greater than 0");
      return;
    }

    try {
      if (modal === "receive") {
        await addMovement.mutateAsync({
          product_id: productId,
          warehouse_id: warehouseId,
          movement_type: "IN",
          quantity: qty,
          reference_note: note || undefined,
        });
        toast.success("Stock received successfully");
      } else if (modal === "issue") {
        if (!pickingFloor) {
          toast.error("Configure a 'Picking Floor' warehouse in Master Data before issuing stock.");
          return;
        }
        if (warehouseId !== pickingFloor.id) {
          toast.error("Stock can only be issued from the Picking Floor.");
          return;
        }
        const currentStock = getStock(productId, warehouseId);
        if (qty > currentStock) {
          toast.error(`Insufficient stock. Current: ${currentStock}`);
          return;
        }
        await addMovement.mutateAsync({
          product_id: productId,
          warehouse_id: warehouseId,
          movement_type: "OUT",
          quantity: qty,
          reference_note: note || undefined,
        });
        toast.success("Stock issued successfully");
      } else if (modal === "transfer") {
        if (!pickingFloor) {
          toast.error("Configure a 'Picking Floor' warehouse in Master Data before transferring stock.");
          return;
        }
        if (fromWarehouseId === toWarehouseId) {
          toast.error("Source and destination must be different");
          return;
        }
        if (toWarehouseId !== pickingFloor.id) {
          toast.error("Transfers must move stock into the Picking Floor.");
          return;
        }
        if (fromWarehouseId === pickingFloor.id) {
          toast.error("Transfers must start from a storage warehouse, not the Picking Floor.");
          return;
        }
        const currentStock = getStock(productId, fromWarehouseId);
        if (qty > currentStock) {
          toast.error(`Insufficient stock. Current: ${currentStock}`);
          return;
        }
        await transferStock.mutateAsync({
          product_id: productId,
          from_warehouse_id: fromWarehouseId,
          to_warehouse_id: toWarehouseId,
          quantity: qty,
          reference_note: note || undefined,
        });
        toast.success("Stock transferred successfully");
      }
      resetForm();
    } catch (err: any) {
      toast.error(err.message || "Operation failed");
    }
  };

  const movementTypeStyles: Record<string, string> = {
    IN: "bg-stock-in/15 text-stock-in",
    OUT: "bg-stock-out/15 text-stock-out",
    TRANSFER_IN: "bg-stock-transfer/15 text-stock-transfer",
    TRANSFER_OUT: "bg-stock-transfer/15 text-stock-transfer",
    CREDIT: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
  };

  const isFormValid =
    productId &&
    quantity &&
    parseInt(quantity) > 0 &&
    (modal === "transfer"
      ? fromWarehouseId && toWarehouseId && fromWarehouseId !== toWarehouseId
      : warehouseId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground/70 font-mono mb-1">
            Flow
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Stock Movements</h1>
          {pickingFloor ? (
            <p className="mt-1 text-xs text-muted-foreground max-w-xl">
              Dispatch is only allowed from the Picking Floor. Storage warehouses can transfer stock
              into the Picking Floor, which then issues it out.
            </p>
          ) : (
            <p className="mt-1 text-xs text-destructive max-w-xl">
              Create a warehouse named &quot;Picking Floor&quot; in Master Data → Warehouses to enable
              dispatch and transfers.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={modal === "receive"} onOpenChange={(o) => (o ? setModal("receive") : resetForm())}>
            <DialogTrigger asChild>
              <Button variant="outline" className="text-stock-in border-stock-in/30 hover:bg-stock-in/10">
                <ArrowDownToLine className="h-4 w-4 mr-2" />
                Receive
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Receive Stock</DialogTitle>
              </DialogHeader>
              <MovementForm
                products={products}
                warehouses={warehouses}
                productId={productId}
                setProductId={setProductId}
                warehouseId={warehouseId}
                setWarehouseId={setWarehouseId}
                quantity={quantity}
                setQuantity={setQuantity}
                note={note}
                setNote={setNote}
                onSubmit={handleSubmit}
                isValid={!!isFormValid}
                isPending={addMovement.isPending}
                submitLabel="Receive Stock"
              />
            </DialogContent>
          </Dialog>

          <Dialog open={modal === "issue"} onOpenChange={(o) => (o ? setModal("issue") : resetForm())}>
            <DialogTrigger asChild>
              <Button variant="outline" className="text-stock-out border-stock-out/30 hover:bg-stock-out/10">
                <ArrowUpFromLine className="h-4 w-4 mr-2" />
                Issue
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Issue Stock</DialogTitle>
              </DialogHeader>
              <MovementForm
                products={products}
                warehouses={pickingFloor ? [pickingFloor] : []}
                productId={productId}
                setProductId={setProductId}
                warehouseId={warehouseId}
                setWarehouseId={setWarehouseId}
                quantity={quantity}
                setQuantity={setQuantity}
                note={note}
                setNote={setNote}
                onSubmit={handleSubmit}
                isValid={!!isFormValid}
                isPending={addMovement.isPending}
                submitLabel="Issue Stock"
                showStock
                currentStock={productId && warehouseId ? getStock(productId, warehouseId) : null}
              />
            </DialogContent>
          </Dialog>

          <Dialog open={modal === "transfer"} onOpenChange={(o) => (o ? setModal("transfer") : resetForm())}>
            <DialogTrigger asChild>
              <Button variant="outline" className="text-stock-transfer border-stock-transfer/30 hover:bg-stock-transfer/10">
                <ArrowLeftRight className="h-4 w-4 mr-2" />
                Transfer
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Transfer Stock</DialogTitle>
              </DialogHeader>
              <TransferForm
                products={products}
                sourceWarehouses={storageWarehouses}
                destinationWarehouses={pickingFloor ? [pickingFloor] : []}
                productId={productId}
                setProductId={setProductId}
                fromWarehouseId={fromWarehouseId}
                setFromWarehouseId={setFromWarehouseId}
                toWarehouseId={toWarehouseId}
                setToWarehouseId={setToWarehouseId}
                quantity={quantity}
                setQuantity={setQuantity}
                note={note}
                setNote={setNote}
                onSubmit={handleSubmit}
                isValid={!!isFormValid}
                isPending={transferStock.isPending}
                currentStock={productId && fromWarehouseId ? getStock(productId, fromWarehouseId) : null}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Movements history */}
      <div className="bg-card/95 border border-border/70 rounded-2xl shadow-sm">
        <div className="px-5 py-4 border-b border-border/70 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Recent Movements
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Chronological log of every stock transaction.
            </p>
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px] h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="IN">Receiving (IN)</SelectItem>
              <SelectItem value="OUT">Issuing (OUT)</SelectItem>
              <SelectItem value="TRANSFER_IN">Transfer In</SelectItem>
              <SelectItem value="TRANSFER_OUT">Transfer Out</SelectItem>
              <SelectItem value="CREDIT">Credits</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading movement history…</div>
        ) : !movements?.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No movements yet. Use the buttons above to record stock movements.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] uppercase tracking-[0.18em]">Date</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.18em]">Type</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-[0.18em]">
                    Item Code
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.18em]">
                    Warehouse
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.18em] text-right">
                    Qty
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.18em]">
                    Note
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.filter((m: any) => typeFilter === "all" || m.movement_type === typeFilter).map((m) => (
                  <TableRow key={m.id} className={`hover:bg-muted/40 ${m.movement_type === "CREDIT" ? "border-l-4 border-l-blue-500/60" : ""}`}>
                    <TableCell className="text-sm font-mono text-muted-foreground">
                      {new Date(m.movement_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-medium ${
                          movementTypeStyles[m.movement_type] ?? ""
                        }`}
                      >
                        {m.movement_type}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-sm font-medium">
                      {(m.products as any)?.item_code}
                    </TableCell>
                    <TableCell className="text-sm">
                      {(m.warehouses as any)?.warehouse_name}
                    </TableCell>
                    <TableCell className="text-sm font-mono text-right font-medium">
                      {m.quantity}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[220px] truncate">
                      {m.reference_note || "—"}
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

// Shared movement form
function MovementForm({
  products,
  warehouses,
  productId,
  setProductId,
  warehouseId,
  setWarehouseId,
  quantity,
  setQuantity,
  note,
  setNote,
  onSubmit,
  isValid,
  isPending,
  submitLabel,
  showStock,
  currentStock,
}: {
  products: any[] | undefined;
  warehouses: any[] | undefined;
  productId: string;
  setProductId: (v: string) => void;
  warehouseId: string;
  setWarehouseId: (v: string) => void;
  quantity: string;
  setQuantity: (v: string) => void;
  note: string;
  setNote: (v: string) => void;
  onSubmit: () => void;
  isValid: boolean;
  isPending: boolean;
  submitLabel: string;
  showStock?: boolean;
  currentStock?: number | null;
}) {
  return (
    <div className="space-y-4 pt-2">
      <div>
        <Label>Product</Label>
        <Select value={productId} onValueChange={setProductId}>
          <SelectTrigger>
            <SelectValue placeholder="Select product" />
          </SelectTrigger>
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
          <SelectTrigger>
            <SelectValue placeholder="Select warehouse" />
          </SelectTrigger>
          <SelectContent>
            {warehouses?.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.warehouse_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {showStock && currentStock !== null && currentStock !== undefined && (
          <p className="text-xs text-muted-foreground mt-1 font-mono">
            Current stock: {currentStock}
          </p>
        )}
      </div>
      <div>
        <Label>Quantity</Label>
        <Input
          type="number"
          min="1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="Enter quantity"
        />
      </div>
      <div>
        <Label>Reference Note (optional)</Label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="PO number, reason, etc."
          rows={2}
        />
      </div>
      <Button
        className="w-full"
        onClick={onSubmit}
        disabled={!isValid || isPending}
      >
        {isPending ? "Processing..." : submitLabel}
      </Button>
    </div>
  );
}

// Transfer form
function TransferForm({
  products,
  sourceWarehouses,
  destinationWarehouses,
  productId,
  setProductId,
  fromWarehouseId,
  setFromWarehouseId,
  toWarehouseId,
  setToWarehouseId,
  quantity,
  setQuantity,
  note,
  setNote,
  onSubmit,
  isValid,
  isPending,
  currentStock,
}: {
  products: any[] | undefined;
  sourceWarehouses: any[] | undefined;
  destinationWarehouses: any[] | undefined;
  productId: string;
  setProductId: (v: string) => void;
  fromWarehouseId: string;
  setFromWarehouseId: (v: string) => void;
  toWarehouseId: string;
  setToWarehouseId: (v: string) => void;
  quantity: string;
  setQuantity: (v: string) => void;
  note: string;
  setNote: (v: string) => void;
  onSubmit: () => void;
  isValid: boolean;
  isPending: boolean;
  currentStock: number | null;
}) {
  return (
    <div className="space-y-4 pt-2">
      <div>
        <Label>Product</Label>
        <Select value={productId} onValueChange={setProductId}>
          <SelectTrigger>
            <SelectValue placeholder="Select product" />
          </SelectTrigger>
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
          <Label>From Warehouse</Label>
          <Select value={fromWarehouseId} onValueChange={setFromWarehouseId}>
            <SelectTrigger>
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              {sourceWarehouses?.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.warehouse_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {currentStock !== null && currentStock !== undefined && (
            <p className="text-xs text-muted-foreground mt-1 font-mono">
              Stock: {currentStock}
            </p>
          )}
        </div>
        <div>
          <Label>To Warehouse</Label>
          <Select value={toWarehouseId} onValueChange={setToWarehouseId}>
            <SelectTrigger>
              <SelectValue placeholder="Destination" />
            </SelectTrigger>
            <SelectContent>
              {destinationWarehouses?.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.warehouse_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Quantity</Label>
        <Input
          type="number"
          min="1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="Enter quantity"
        />
      </div>
      <div>
        <Label>Reference Note (optional)</Label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Transfer reason, etc."
          rows={2}
        />
      </div>
      <Button
        className="w-full"
        onClick={onSubmit}
        disabled={!isValid || isPending}
      >
        {isPending ? "Processing..." : "Transfer Stock"}
      </Button>
    </div>
  );
}
