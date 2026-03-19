import { useMemo, useState } from "react";
import { useStockLevels, useWarehouses } from "@/hooks/useStockData";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X, Trash2 } from "lucide-react";
import DeleteStockDialog from "@/components/DeleteStockDialog";

type SortOption = "code-asc" | "code-desc" | "stock-high" | "stock-low" | "desc-asc";

interface DeleteTarget {
  product_id: string;
  warehouse_id: string;
  item_code: string;
  item_description: string | null;
  warehouse_name: string;
  current_stock: number;
}

export default function CurrentStock() {
  const { data: stockLevels, isLoading: stockLoading } = useStockLevels();
  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const isLoading = stockLoading || warehousesLoading;

  const [search, setSearch] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("code-asc");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  // Derive unique categories from stock data
  const categories = useMemo(() => {
    const cats = new Set<string>();
    stockLevels?.forEach((sl: any) => {
      if (sl.category) cats.add(sl.category);
    });
    return Array.from(cats).sort();
  }, [stockLevels]);

  // Filter + sort
  const filtered = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();
    return (stockLevels ?? [])
      .filter((sl: any) => {
        if (warehouseFilter !== "all" && sl.warehouse_id !== warehouseFilter) return false;
        if (categoryFilter !== "all" && (sl.category || "") !== categoryFilter) return false;
        if (searchTerm) {
          const code = (sl.item_code || "").toLowerCase();
          const desc = (sl.item_description || "").toLowerCase();
          if (!code.includes(searchTerm) && !desc.includes(searchTerm)) return false;
        }
        return true;
      })
      .sort((a: any, b: any) => {
        switch (sortBy) {
          case "stock-high": return (b.current_stock ?? 0) - (a.current_stock ?? 0);
          case "stock-low": return (a.current_stock ?? 0) - (b.current_stock ?? 0);
          case "code-desc": return (b.item_code || "").localeCompare(a.item_code || "");
          case "desc-asc": return (a.item_description || "").localeCompare(b.item_description || "");
          default: return (a.item_code || "").localeCompare(b.item_code || "");
        }
      });
  }, [stockLevels, search, warehouseFilter, categoryFilter, sortBy]);

  // Group filtered results by warehouse
  const stockByWarehouse = useMemo(() => {
    const map = new Map<string, { warehouse_name: string; items: any[] }>();
    filtered.forEach((sl: any) => {
      if (!sl.warehouse_id) return;
      if (!map.has(sl.warehouse_id)) {
        map.set(sl.warehouse_id, { warehouse_name: sl.warehouse_name, items: [] });
      }
      map.get(sl.warehouse_id)!.items.push(sl);
    });
    return map;
  }, [filtered]);

  const hasActiveFilters = warehouseFilter !== "all" || categoryFilter !== "all" || search.trim() !== "";

  const clearFilters = () => {
    setSearch("");
    setWarehouseFilter("all");
    setCategoryFilter("all");
    setSortBy("code-asc");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground/70 font-mono mb-1">
            Snapshot
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Current Stock</h1>
        </div>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px] max-w-xs space-y-1">
          <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-mono">Search</label>
          <Input
            placeholder="Code or description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 text-sm"
          />
        </div>
        <div className="min-w-[160px] space-y-1">
          <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-mono">Warehouse</label>
          <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Warehouses</SelectItem>
              {(warehouses ?? []).map((w: any) => (
                <SelectItem key={w.id} value={w.id}>{w.warehouse_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[160px] space-y-1">
          <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-mono">Category</label>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[160px] space-y-1">
          <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-mono">Sort By</label>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="code-asc">Code A → Z</SelectItem>
              <SelectItem value="code-desc">Code Z → A</SelectItem>
              <SelectItem value="stock-high">Stock High → Low</SelectItem>
              <SelectItem value="stock-low">Stock Low → High</SelectItem>
              <SelectItem value="desc-asc">Description A → Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-xs gap-1">
            <X className="h-3 w-3" /> Clear
          </Button>
        )}
      </div>

      {/* Results count */}
      <p className="text-xs text-muted-foreground font-mono">
        {filtered.length} item{filtered.length !== 1 ? "s" : ""} found
      </p>

      {isLoading ? (
        <div className="rounded-2xl border border-border/70 bg-card/95 p-8 text-center text-sm text-muted-foreground">
          Loading current stock…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-border/70 bg-card/95 p-8 text-center text-sm text-muted-foreground">
          {hasActiveFilters ? "No items match your filters." : "No stock on hand in any warehouse."}
        </div>
      ) : (
        <div className="space-y-5">
          {Array.from(stockByWarehouse.entries()).map(([warehouseId, { warehouse_name, items }]) => (
            <div key={warehouseId} className="bg-card/95 border border-border/70 rounded-2xl shadow-sm">
              <div className="px-5 py-4 border-b border-border/70 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    {warehouse_name}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">{items.length} SKUs</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-t border-border/60 text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/40">
                      <th className="px-4 py-2 text-left font-mono text-[11px] uppercase tracking-[0.18em]">Item Code</th>
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-[0.18em]">Description</th>
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-[0.18em]">Category</th>
                      <th className="px-4 py-2 text-right text-[11px] uppercase tracking-[0.18em]">Stock</th>
                      <th className="px-4 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((sl: any) => {
                      const stock = sl.current_stock ?? 0;
                      const colorClass = stock <= 5 ? "text-stock-transfer" : "text-stock-in";
                      return (
                        <tr key={`${sl.product_id}-${warehouseId}`} className="border-b border-border/60 last:border-b-0 hover:bg-muted/40">
                          <td className="px-4 py-2 font-mono text-sm font-medium">{sl.item_code}</td>
                          <td className="px-4 py-2 text-sm">{sl.item_description || "—"}</td>
                          <td className="px-4 py-2 text-sm text-muted-foreground">{sl.category || "—"}</td>
                          <td className={`px-4 py-2 text-sm font-mono text-right font-semibold ${colorClass}`}>{stock}</td>
                          <td className="px-2 py-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              onClick={() =>
                                setDeleteTarget({
                                  product_id: sl.product_id,
                                  warehouse_id: sl.warehouse_id,
                                  item_code: sl.item_code,
                                  item_description: sl.item_description,
                                  warehouse_name: warehouse_name,
                                  current_stock: stock,
                                })
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <DeleteStockDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        item={deleteTarget}
      />
    </div>
  );
}
