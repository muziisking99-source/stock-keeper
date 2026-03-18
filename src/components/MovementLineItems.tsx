import { useState, useRef, useEffect, forwardRef, type ForwardedRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Package, Search, Check } from "lucide-react";

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

interface ProductSearchProps {
  products: Product[] | undefined;
  value: string;
  onChange: (id: string) => void;
  accentClass: string;
}

const assignRef = <T,>(ref: ForwardedRef<T>, value: T) => {
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  if (ref) {
    ref.current = value;
  }
};

const ProductSearch = forwardRef<HTMLDivElement, ProductSearchProps>(function ProductSearch(
  { products, value, onChange, accentClass },
  forwardedRef,
) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selected = products?.find((p) => p.id === value);

  const filtered = products?.filter((p) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return p.item_code.toLowerCase().includes(q) || (p.item_description?.toLowerCase().includes(q) ?? false);
  }) ?? [];

  useEffect(() => {
    if (!open) return;

    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSelect = (productId: string) => {
    onChange(productId);
    setOpen(false);
    setQuery("");
  };

  return (
    <div
      ref={(node) => {
        containerRef.current = node;
        assignRef(forwardedRef, node);
      }}
      className="relative flex-1"
    >
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          value={open ? query : (selected ? `${selected.item_code} — ${selected.item_description || "N/A"}` : "")}
          placeholder="Search products…"
          className="flex h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
        />
      </div>

      {open && (
        <div
          id="product-search-dropdown"
          data-product-search-dropdown="true"
          ref={dropdownRef}
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 bg-popover border border-border rounded-lg shadow-xl max-h-48 overflow-y-auto"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">No products found</div>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/60 transition-colors flex items-center gap-2 ${p.id === value ? "bg-muted/40" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSelect(p.id);
                }}
              >
                {p.id === value && <Check className={`h-3 w-3 shrink-0 ${accentClass}`} />}
                <span className="font-mono font-medium">{p.item_code}</span>
                <span className="text-muted-foreground truncate">— {p.item_description || "N/A"}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
});

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

      <div className="rounded-xl border border-border/70 bg-muted/30 divide-y divide-border/50">
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
                    Stock: <span className={`font-semibold ${stock === 0 ? "text-destructive" : "text-foreground"}`}>{stock}</span>
                  </span>
                )}
              </div>
              <div className="flex gap-2 items-start">
                <ProductSearch
                  products={products}
                  value={line.productId}
                  onChange={(v) => onUpdate(line.id, "productId", v)}
                  accentClass={accentClass}
                />
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
