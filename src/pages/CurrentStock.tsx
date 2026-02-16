import { useState } from "react";
import { useStockLevels, useWarehouses } from "@/hooks/useStockData";
import { Input } from "@/components/ui/input";

export default function CurrentStock() {
  const { data: stockLevels, isLoading: stockLoading } = useStockLevels();
  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();

  const isLoading = stockLoading || warehousesLoading;

  const [search, setSearch] = useState("");

  // Group stock by warehouse
  const stockByWarehouse = new Map<string, { warehouse_name: string; items: typeof stockLevels }>();
  stockLevels?.forEach((sl: any) => {
    if (!sl.warehouse_id) return;
    if (!stockByWarehouse.has(sl.warehouse_id)) {
      stockByWarehouse.set(sl.warehouse_id, { warehouse_name: sl.warehouse_name, items: [] });
    }
    stockByWarehouse.get(sl.warehouse_id)!.items!.push(sl);
  });

  const searchTerm = search.trim().toLowerCase();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground/70 font-mono mb-1">
            Snapshot
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Current Stock</h1>
        </div>
        <div className="w-full sm:w-auto sm:min-w-[260px]">
          <Input
            placeholder="Search by code or description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 text-sm"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-border/70 bg-card/95 p-8 text-center text-sm text-muted-foreground">
          Loading current stock…
        </div>
      ) : !stockLevels?.length ? (
        <div className="rounded-2xl border border-border/70 bg-card/95 p-8 text-center text-sm text-muted-foreground">
          No stock on hand in any warehouse.
        </div>
      ) : (
        <div className="space-y-5">
          {Array.from(stockByWarehouse.entries()).map(([warehouseId, { warehouse_name, items }]) => {
            const filtered = (items ?? [])
              .filter((sl: any) => {
                if (!searchTerm) return true;
                const code = (sl.item_code || "").toLowerCase();
                const desc = (sl.item_description || "").toLowerCase();
                const cat = (sl.category || "").toLowerCase();
                return code.includes(searchTerm) || desc.includes(searchTerm) || cat.includes(searchTerm);
              })
              .sort((a: any, b: any) => (a.item_code || "").localeCompare(b.item_code || ""));

            if (filtered.length === 0) return null;

            return (
              <div
                key={warehouseId}
                className="bg-card/95 border border-border/70 rounded-2xl shadow-sm"
              >
                <div className="px-5 py-4 border-b border-border/70 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      {warehouse_name}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {filtered.length} SKUs with stock
                    </p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-t border-border/60 text-sm">
                    <thead>
                      <tr className="border-b border-border/60 bg-muted/40">
                        <th className="px-4 py-2 text-left font-mono text-[11px] uppercase tracking-[0.18em]">
                          Item Code
                        </th>
                        <th className="px-4 py-2 text-left text-[11px] uppercase tracking-[0.18em]">
                          Description
                        </th>
                        <th className="px-4 py-2 text-left text-[11px] uppercase tracking-[0.18em]">
                          Category
                        </th>
                        <th className="px-4 py-2 text-right text-[11px] uppercase tracking-[0.18em]">
                          Stock
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((sl: any) => {
                        const stock = sl.current_stock ?? 0;
                        const colorClass =
                          stock <= 5 ? "text-stock-transfer" : "text-stock-in";

                        return (
                          <tr
                            key={`${sl.product_id}-${warehouseId}`}
                            className="border-b border-border/60 last:border-b-0 hover:bg-muted/40"
                          >
                            <td className="px-4 py-2 font-mono text-sm font-medium">
                              {sl.item_code}
                            </td>
                            <td className="px-4 py-2 text-sm">
                              {sl.item_description || "—"}
                            </td>
                            <td className="px-4 py-2 text-sm text-muted-foreground">
                              {sl.category || "—"}
                            </td>
                            <td
                              className={`px-4 py-2 text-sm font-mono text-right font-semibold ${colorClass}`}
                            >
                              {stock}
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
    </div>
  );
}
