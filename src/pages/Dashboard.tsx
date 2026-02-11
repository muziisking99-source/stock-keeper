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
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-6">Dashboard</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-card border rounded-md p-5">
          <div className="flex items-center gap-3 mb-2">
            <Package className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Total Products</span>
          </div>
          <p className="text-3xl font-bold font-mono">{totalProducts}</p>
        </div>
        <div className="bg-card border rounded-md p-5">
          <div className="flex items-center gap-3 mb-2">
            <Warehouse className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Warehouses</span>
          </div>
          <p className="text-3xl font-bold font-mono">{totalWarehouses}</p>
        </div>
        <div className="bg-card border rounded-md p-5">
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle className="h-5 w-5 text-stock-transfer" />
            <span className="text-sm font-medium text-muted-foreground">Low Stock Items</span>
          </div>
          <p className="text-3xl font-bold font-mono">{lowStockCount}</p>
        </div>
      </div>

      {/* Stock table */}
      <div className="bg-card border rounded-md">
        <div className="p-4 border-b">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Stock Overview
          </h2>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading...</div>
        ) : totalProducts === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No products yet. Upload products via the Products page.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-mono text-xs">ITEM CODE</TableHead>
                <TableHead className="text-xs">DESCRIPTION</TableHead>
                <TableHead className="text-xs">CATEGORY</TableHead>
                {warehouses?.map((w) => (
                  <TableHead key={w.id} className="text-xs text-center">
                    {w.warehouse_name?.toUpperCase()}
                  </TableHead>
                ))}
                <TableHead className="text-xs text-center">TOTAL</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from(productMap.entries()).map(([productId, levels]) => {
                const first = levels![0];
                const total = levels!.reduce((sum, l) => sum + (l.current_stock as number), 0);
                return (
                  <TableRow key={productId}>
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
                      className={`text-center font-mono text-sm font-bold ${
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
        )}
      </div>
    </div>
  );
}
