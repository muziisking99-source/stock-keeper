import { useState } from "react";
import { useProducts, useStockLevels, useWarehouses } from "@/hooks/useStockData";
import { Input } from "@/components/ui/input";

export default function CurrentStock() {
  const { data: products, isLoading: productsLoading } = useProducts();
  const { data: stockLevels, isLoading: stockLoading } = useStockLevels();
  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();

  const isLoading = productsLoading || stockLoading || warehousesLoading;

  const [search, setSearch] = useState("");

  // Index stock by product+warehouse for fast lookup
  const stockIndex = new Map<string, number>();
  stockLevels?.forEach((sl: any) => {
    if (!sl.product_id || !sl.warehouse_id) return;
    const key = `${sl.product_id}-${sl.warehouse_id}`;
    stockIndex.set(key, (sl.current_stock as number) ?? 0);
  });

  // Pre-sort products for consistent display
  const sortedProducts = [...(products ?? [])].sort((a: any, b: any) =>
    (a.item_code || "").localeCompare(b.item_code || "")
  );

  const searchTerm = search.trim().toLowerCase();
  const filteredProducts =
    searchTerm.length === 0
      ? sortedProducts
      : sortedProducts.filter((p: any) => {
          const code = (p.item_code || "").toString().toLowerCase();
          const desc = (p.item_description || "").toString().toLowerCase();
          const category = (p.category || "").toString().toLowerCase();
          return (
            code.includes(searchTerm) ||
            desc.includes(searchTerm) ||
            category.includes(searchTerm)
          );
        });

  const hasAnyStockForFilter =
    warehouses?.some((w: any) =>
      filteredProducts.some((p: any) => {
        const key = `${p.id}-${w.id}`;
        const stock = stockIndex.get(key) ?? 0;
        return stock > 0;
      }),
    ) ?? false;

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
      ) : !warehouses?.length || !products?.length ? (
        <div className="rounded-2xl border border-border/70 bg-card/95 p-8 text-center text-sm text-muted-foreground">
          To see current stock, add at least one warehouse and one product.
        </div>
      ) : !hasAnyStockForFilter ? (
        <div className="rounded-2xl border border-border/70 bg-card/95 p-8 text-center text-sm text-muted-foreground">
          {searchTerm
            ? `No stock found matching “${search}”.`
            : "No stock on hand in any warehouse."}
        </div>
      ) : (
        <div className="space-y-5">
          {warehouses.map((w: any) => {
            // Compute SKUs with positive stock in this warehouse
            const productsWithStock = filteredProducts.filter((p: any) => {
              const key = `${p.id}-${w.id}`;
              const value = stockIndex.get(key) ?? 0;
              return value > 0;
            });

            const activeSkuCount = productsWithStock.length;

            // Skip warehouses that have no stock for the current filter
            if (activeSkuCount === 0) return null;

            return (
              <div
                key={w.id}
                className="bg-card/95 border border-border/70 rounded-2xl shadow-sm"
              >
                <div className="px-5 py-4 border-b border-border/70 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      {w.warehouse_name}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {activeSkuCount} SKUs with stock &bull;{" "}
                      {filteredProducts.length} matching SKUs
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
                      {productsWithStock.map((p: any) => {
                        const key = `${p.id}-${w.id}`;
                        const stock = stockIndex.get(key) ?? 0;
                        const colorClass =
                          stock === 0
                            ? "text-stock-zero"
                            : stock <= 5
                            ? "text-stock-transfer"
                            : "text-stock-in";

                        return (
                          <tr
                            key={p.id}
                            className="border-b border-border/60 last:border-b-0 hover:bg-muted/40"
                          >
                            <td className="px-4 py-2 font-mono text-sm font-medium">
                              {p.item_code}
                            </td>
                            <td className="px-4 py-2 text-sm">
                              {p.item_description || "—"}
                            </td>
                            <td className="px-4 py-2 text-sm text-muted-foreground">
                              {p.category || "—"}
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

