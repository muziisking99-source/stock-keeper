import { useMemo, useState } from "react";
import { useStockLevels, useWarehouses, useAddStockMovement } from "@/hooks/useStockData";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { X, Trash2 } from "lucide-react";
import DeleteStockDialog from "@/components/DeleteStockDialog";
import { toast } from "sonner";

type SortOption = "code-asc" | "code-desc" | "stock-high" | "stock-low" | "desc-asc";

interface DeleteTarget {
  product_id: string;
  warehouse_id: string;
  item_code: string;
  item_description: string | null;
  warehouse_name: string;
  current_stock: number;
}

const rowKey = (sl: any) => `${sl.product_id}__${sl.warehouse_id}`;

export default function CurrentStock() {
  const { data: stockLevels, isLoading: stockLoading } = useStockLevels();
  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const addMovement = useAddStockMovement();
  const isLoading = stockLoading || warehousesLoading;

  const [search, setSearch] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("code-asc");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);

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

  const allKeys = useMemo(() => filtered.map((sl: any) => rowKey(sl)), [filtered]);
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.has(k));
  const someSelected = selected.size > 0 && !allSelected;

  const toggleRow = (sl: any) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const k = rowKey(sl);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      if (allKeys.every((k) => prev.has(k))) {
        // unselect all visible
        const next = new Set(prev);
        allKeys.forEach((k) => next.delete(k));
        return next;
      }
      return new Set(allKeys);
    });
  };

  const toggleWarehouse = (items: any[]) => {
    setSelected((prev) => {
      const keys = items.map(rowKey);
      const allOn = keys.every((k) => prev.has(k));
      const next = new Set(prev);
      if (allOn) keys.forEach((k) => next.delete(k));
      else keys.forEach((k) => next.add(k));
      return next;
    });
  };

  const hasActiveFilters = warehouseFilter !== "all" || categoryFilter !== "all" || search.trim() !== "";

  const clearFilters = () => {
    setSearch("");
    setWarehouseFilter("all");
    setCategoryFilter("all");
    setSortBy("code-asc");
  };

  const selectedItems = useMemo(
    () => filtered.filter((sl: any) => selected.has(rowKey(sl))),
    [filtered, selected]
  );

  const selectedTotalUnits = selectedItems.reduce(
    (sum, sl: any) => sum + (sl.current_stock ?? 0),
    0
  );

  const runBulkDelete = async () => {
    if (selectedItems.length === 0) return;
    setBulkRunning(true);
    let ok = 0;
    let fail = 0;
    for (const sl of selectedItems) {
      const qty = sl.current_stock ?? 0;
      if (qty <= 0) continue;
      try {
        await addMovement.mutateAsync({
          product_id: sl.product_id,
          warehouse_id: sl.warehouse_id,
          movement_type: "OUT",
          quantity: qty,
          reference_note: "Bulk clear from Current Stock",
        });
        ok++;
      } catch (err: any) {
        fail++;
        toast.error(`${sl.item_code}: ${err.message ?? "Failed"}`);
      }
    }
    setBulkRunning(false);
    setBulkOpen(false);
    setSelected(new Set());
    if (ok > 0) toast.success(`Cleared stock for ${ok} item${ok === 1 ? "" : "s"}`);
    if (fail > 0) toast.error(`${fail} item${fail === 1 ? "" : "s"} failed`);
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end gap-3">
        <div className="space-y-1 sm:col-span-2 lg:flex-1 lg:min-w-[200px] lg:max-w-xs">
          <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-mono">Search</label>
          <Input
            placeholder="Code or description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 sm:h-9 text-sm"
          />
        </div>
        <div className="space-y-1 lg:min-w-[160px]">
          <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-mono">Warehouse</label>
          <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
            <SelectTrigger className="h-10 sm:h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Warehouses</SelectItem>
              {(warehouses ?? []).map((w: any) => (
                <SelectItem key={w.id} value={w.id}>{w.warehouse_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 lg:min-w-[160px]">
          <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-mono">Category</label>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-10 sm:h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 lg:min-w-[160px]">
          <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-mono">Sort By</label>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="h-10 sm:h-9 text-sm"><SelectValue /></SelectTrigger>
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
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-xs gap-1 sm:col-span-2 lg:col-span-1 lg:w-auto">
            <X className="h-3 w-3" /> Clear filters
          </Button>
        )}
      </div>

      {/* Selection toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground font-mono">
          {filtered.length} item{filtered.length !== 1 ? "s" : ""} found
          {selected.size > 0 && (
            <span className="ml-3 text-foreground">
              · {selected.size} selected ({selectedTotalUnits} units)
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          {filtered.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={toggleAll}
              className="h-8 text-xs"
            >
              {allSelected ? "Unselect all" : "Select all"}
            </Button>
          )}
          {selected.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setBulkOpen(true)}
              className="h-8 text-xs gap-1"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete {selected.size} item{selected.size === 1 ? "" : "s"}
            </Button>
          )}
        </div>
      </div>

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
          {Array.from(stockByWarehouse.entries()).map(([warehouseId, { warehouse_name, items }]) => {
            const whKeys = items.map(rowKey);
            const whAll = whKeys.every((k) => selected.has(k));
            const whSome = whKeys.some((k) => selected.has(k)) && !whAll;
            return (
              <div key={warehouseId} className="bg-card/95 border border-border/70 rounded-2xl shadow-sm">
                <div className="px-5 py-4 border-b border-border/70 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      {warehouse_name}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">{items.length} SKUs</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleWarehouse(items)}
                    className="h-7 text-xs"
                  >
                    {whAll ? "Unselect warehouse" : "Select warehouse"}
                  </Button>
                </div>
                {/* Mobile card list */}
                <div className="md:hidden divide-y divide-border/60">
                  {items.map((sl: any) => {
                    const stock = sl.current_stock ?? 0;
                    const isNeg = stock < 0;
                    const colorClass = isNeg ? "text-destructive" : stock <= 5 ? "text-stock-transfer" : "text-stock-in";
                    const k = rowKey(sl);
                    const isChecked = selected.has(k);
                    return (
                      <div
                        key={k}
                        className={`flex items-start gap-3 p-3 ${isChecked ? "bg-primary/5" : ""} ${isNeg ? "bg-destructive/10" : ""}`}
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => toggleRow(sl)}
                          aria-label={`Select ${sl.item_code}`}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-sm font-semibold truncate">{sl.item_code}</span>
                            <span className={`font-mono text-base font-bold tabular-nums ${colorClass}`}>{stock}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {sl.item_description || "—"}
                          </p>
                          {sl.category && (
                            <span className="inline-block mt-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                              {sl.category}
                            </span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 w-9 p-0 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
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
                          aria-label={`Delete ${sl.item_code}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full border-t border-border/60 text-sm">
                    <thead>
                      <tr className="border-b border-border/60 bg-muted/40">
                        <th className="px-3 py-2 w-10">
                          <Checkbox
                            checked={whAll ? true : whSome ? "indeterminate" : false}
                            onCheckedChange={() => toggleWarehouse(items)}
                            aria-label="Select warehouse rows"
                          />
                        </th>
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
                        const k = rowKey(sl);
                        const isChecked = selected.has(k);
                        return (
                          <tr
                            key={k}
                            className={`border-b border-border/60 last:border-b-0 hover:bg-muted/40 ${
                              isChecked ? "bg-primary/5" : ""
                            }`}
                          >
                            <td className="px-3 py-2">
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={() => toggleRow(sl)}
                                aria-label={`Select ${sl.item_code}`}
                              />
                            </td>
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
            );
          })}
        </div>
      )}

      <DeleteStockDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        item={deleteTarget}
      />

      <AlertDialog open={bulkOpen} onOpenChange={(o) => !bulkRunning && setBulkOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear stock for {selectedItems.length} item{selectedItems.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will create OUT movements that remove the full current stock
              ({selectedTotalUnits} units total) for every selected row. You can
              still see the history under Stock Movements. This cannot be undone
              from this screen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkRunning}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); runBulkDelete(); }}
              disabled={bulkRunning}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkRunning ? "Clearing…" : "Yes, clear stock"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
