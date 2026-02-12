import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Products from "@/pages/Products";
import Warehouses from "@/pages/Warehouses";

export default function MasterData() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground/70 font-mono mb-1">
            Configuration
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Master Data</h1>
        </div>
      </div>

      <Tabs defaultValue="products" className="space-y-4">
        <TabsList>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="warehouses">Warehouses</TabsTrigger>
        </TabsList>

        <TabsContent value="products">
          <Products />
        </TabsContent>

        <TabsContent value="warehouses">
          <Warehouses />
        </TabsContent>
      </Tabs>
    </div>
  );
}

