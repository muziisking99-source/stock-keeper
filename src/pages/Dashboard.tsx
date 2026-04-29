import { useStockLevels, useProducts, useWarehouses } from "@/hooks/useStockData";
import { Package, Warehouse, AlertTriangle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function Dashboard() {
  const { data: stockLevels, isLoading } = useStockLevels();
  const { data: products } = useProducts();
  const { data: warehouses } = useWarehouses();

  const totalProducts = products?.length ?? 0;
  const totalWarehouses = warehouses?.length ?? 0;
  const lowStockCount =
    stockLevels?.filter((s) => (s.current_stock as number) > 0 && (s.current_stock as number) <= 5).length ?? 0;

  // Group stock levels by product
  const productMap = new Map<string, typeof stockLevels>();
  stockLevels?.forEach((sl) => {
    const key = sl.product_id as string;
    if (!productMap.has(key)) productMap.set(key, []);
    productMap.get(key)!.push(sl);
  });

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] sm:text-xs uppercase tracking-[0.22em] text-muted-foreground/70 font-mono mb-1">
            Live Snapshot
          </p>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold tracking-tight">
            Control Tower
          </h1>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/60 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-mono uppercase tracking-[0.18em] text-[10px] sm:text-xs">
            {totalWarehouses} Warehouses
          </span>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-2">
        <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-primary/10 via-card to-primary/5 p-4 sm:p-5 shadow-sm">
          <div className="pointer-events-none absolute -right-10 -top-16 h-32 w-32 rounded-full bg-primary/15 blur-2xl" />
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Package className="h-4 w-4" />
              </div>
              <div>
                <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Total Products
                </span>
              </div>
            </div>
            <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-mono text-primary">
              Catalog
            </span>
          </div>
          <p className="text-2xl sm:text-3xl md:text-4xl font-semibold font-mono">{totalProducts}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Unique SKUs currently tracked across all warehouses.
          </p>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-foreground/10 via-card to-muted/30 p-4 sm:p-5 shadow-sm">
          <div className="pointer-events-none absolute -left-8 -bottom-16 h-32 w-32 rounded-full bg-foreground/10 blur-2xl" />
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-foreground/10 text-foreground">
                <Warehouse className="h-4 w-4" />
              </div>
              <div>
                <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Warehouses
                </span>
              </div>
            </div>
            <span className="rounded-full border border-foreground/30 bg-foreground/5 px-2 py-0.5 text-[10px] font-mono text-foreground/80">
              Network
            </span>
          </div>
          <p className="text-2xl sm:text-3xl md:text-4xl font-semibold font-mono">{totalWarehouses}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Active storage locations participating in live stock sync.
          </p>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-amber-500/10 via-card to-amber-400/5 p-4 sm:p-5 shadow-sm">
          <div className="pointer-events-none absolute right-[-14px] bottom-[-36px] h-32 w-32 rounded-full bg-amber-400/15 blur-2xl" />
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Low Stock Items
                </span>
              </div>
            </div>
            <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-mono text-amber-700 dark:text-amber-100">
              Risk Watch
            </span>
          </div>
          <p className="text-2xl sm:text-3xl md:text-4xl font-semibold font-mono">{lowStockCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Items between 1–5 units remaining across any warehouse.
          </p>
        </div>
      </div>

      {/* Stock table */}
      <div className="rounded-2xl border border-border/70 bg-card/95 shadow-sm">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border/70">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Stock Overview
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Per-warehouse visibility for every tracked SKU.
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 text-[11px] text-muted-foreground/80 font-mono">
            <span className="inline-flex h-2 w-2 rounded-full bg-stock-in" />
            <span>Healthy</span>
            <span className="inline-flex h-2 w-2 rounded-full bg-stock-transfer" />
            <span>Low</span>
            <span className="inline-flex h-2 w-2 rounded-full bg-stock-zero" />
            <span>Zero</span>
          </div>
        </div>
        {isLoading ? (
          <div className="p-10 text-center text-muted-foreground text-sm">Loading live inventory…</div>
        ) : totalProducts === 0 ? (
          <div className="p-10 text-center text-muted-foreground text-sm">
            No products yet. Upload products via the Products page to populate this view.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/70">
                  <TableHead className="font-mono text-[11px] uppercase tracking-[0.18em]">
                    Item Code
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.18em]">
                    Description
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.18em]">
                    Category
                  </TableHead>
                  {warehouses?.map((w) => (
                    <TableHead key={w.id} className="text-[11px] uppercase tracking-[0.18em] text-center">
                      {w.warehouse_name?.toUpperCase()}
                    </TableHead>
                  ))}
                  <TableHead className="text-[11px] uppercase tracking-[0.18em] text-center">
                    Total
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from(productMap.entries()).map(([productId, levels]) => {
                  const first = levels![0];
                  const total = levels!.reduce((sum, l) => sum + (l.current_stock as number), 0);
                  return (
                    <TableRow key={productId} className="border-border/60 hover:bg-muted/40">
                      <TableCell className="font-mono text-sm font-medium">
                        {first.item_code}
                      </TableCell>
                      <TableCell className="text-sm">{first.item_description}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {first.category || "—"}
                      </TableCell>
                      {warehouses?.map((w) => {
                        const level = levels!.find(
                          (l) => l.warehouse_id === w.id
                        );
                        const stock = (level?.current_stock as number) ?? 0;
                        return (
                          <TableCell
                            key={w.id}
                            className={`text-center font-mono text-sm font-medium ${
                              stock === 0
                                ? "text-stock-zero"
                                : stock <= 5
                                ? "text-stock-transfer"
                                : "text-stock-in"
                            }`}
                          >
                            {stock}
                          </TableCell>
                        );
                      })}
                      <TableCell
                        className={`text-center font-mono text-sm font-semibold ${
                          total === 0 ? "text-stock-zero" : "text-foreground"
                        }`}
                      >
                        {total}
                      </TableCell>
                    </TableRow>
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
