import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Package } from "lucide-react";

export interface LineItem {
  id: string;
  productId: string;
  quantity: string;
}

let lineIdCounter = 0;
export const newLine = (): LineItem => ({ id: String(++lineIdCounter), productId: "", quantity: "" });

interface Product {
  id: string;
  item_code: string;
  item_description: string | null;
}

interface Props {
  lines: LineItem[];
  products: Product[] | undefined;
  onUpdate: (id: string, field: keyof LineItem, value: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  getStock?: (productId: string) => number | null;
  accentClass?: string;
}

export default function MovementLineItems({ lines, products, onUpdate, onRemove, onAdd, getStock, accentClass = "text-primary" }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className={`h-4 w-4 ${accentClass}`} />
          <span className="text-sm font-semibold text-foreground">Line Items</span>
          <span className="text-[10px] font-mono bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
            {lines.length}
          </span>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onAdd} className="h-7 text-xs gap-1">
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>

      <div className="rounded-xl border border-border/70 bg-muted/30 divide-y divide-border/50 overflow-hidden">
        {lines.map((line, idx) => {
          const stock = getStock ? getStock(line.productId) : null;
          return (
            <div key={line.id} className="p-3 hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-1.5 mb-2">
                <span className={`text-[10px] font-mono font-bold ${accentClass} bg-muted rounded-md w-5 h-5 flex items-center justify-center`}>
                  {idx + 1}
                </span>
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Item</span>
                {stock !== null && (
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                    Stock: <span className={`font-semibold ${stock === 0 ? 'text-destructive' : 'text-foreground'}`}>{stock}</span>
                  </span>
                )}
              </div>
              <div className="flex gap-2 items-start">
                <div className="flex-1">
                  <Select value={line.productId} onValueChange={(v) => onUpdate(line.id, "productId", v)}>
                    <SelectTrigger className="h-9 text-xs bg-background">
                      <SelectValue placeholder="Select product…" />
                    </SelectTrigger>
                    <SelectContent>
                      {products?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="font-mono font-medium">{p.item_code}</span>
                          <span className="text-muted-foreground ml-1.5">— {p.item_description || "N/A"}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  type="number" min="1" value={line.quantity}
                  onChange={(e) => onUpdate(line.id, "quantity", e.target.value)}
                  placeholder="Qty" className="w-20 h-9 text-xs font-mono bg-background text-center"
                />
                <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(line.id)}
                  disabled={lines.length <= 1}
                  className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
