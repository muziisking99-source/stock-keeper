import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAddStockMovement } from "@/hooks/useStockData";
import { toast } from "sonner";

interface DeleteStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: {
    product_id: string;
    warehouse_id: string;
    item_code: string;
    item_description: string | null;
    warehouse_name: string;
    current_stock: number;
  } | null;
}

export default function DeleteStockDialog({ open, onOpenChange, item }: DeleteStockDialogProps) {
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const mutation = useAddStockMovement();

  const handleSubmit = () => {
    if (!item) return;
    const qty = parseInt(quantity);
    if (!qty || qty <= 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    if (qty > item.current_stock) {
      toast.error(`Cannot remove more than current stock (${item.current_stock})`);
      return;
    }

    mutation.mutate(
      {
        product_id: item.product_id,
        warehouse_id: item.warehouse_id,
        movement_type: "OUT",
        quantity: qty,
        reference_note: note || "Stock write-off from Current Stock",
      },
      {
        onSuccess: () => {
          toast.success(`Removed ${qty} × ${item.item_code}`);
          setQuantity("");
          setNote("");
          onOpenChange(false);
        },
        onError: (err: any) => {
          toast.error(err.message || "Failed to remove stock");
        },
      }
    );
  };

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove Stock</DialogTitle>
          <DialogDescription>
            Write off stock for <span className="font-mono font-semibold">{item.item_code}</span> from{" "}
            <span className="font-semibold">{item.warehouse_name}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
              Product
            </label>
            <p className="text-sm">{item.item_description || item.item_code}</p>
          </div>

          <div className="flex gap-4">
            <div className="space-y-1 flex-1">
              <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
                Current Stock
              </label>
              <p className="text-sm font-mono font-semibold">{item.current_stock}</p>
            </div>
            <div className="space-y-1 flex-1">
              <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
                Qty to Remove
              </label>
              <Input
                type="number"
                min="1"
                max={item.current_stock}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
                className="h-9 text-sm font-mono"
                autoFocus
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
              Reason (optional)
            </label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Damaged, expired, write-off…"
              className="text-sm resize-none"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Removing…" : "Remove Stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
