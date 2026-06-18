import { useState } from "react";
import { useWarehouses, useAddWarehouse, useUpdateWarehouse } from "@/hooks/useStockData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Pencil, Check, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function Warehouses() {
  const { data: warehouses, isLoading } = useWarehouses();
  const addWarehouse = useAddWarehouse();
  const updateWarehouse = useUpdateWarehouse();

  const [newName, setNewName] = useState("");
  const [newAllowNeg, setNewAllowNeg] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingAllowNeg, setEditingAllowNeg] = useState(false);

  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      toast.error("Warehouse name cannot be empty");
      return;
    }
    try {
      await addWarehouse.mutateAsync({ warehouse_name: trimmed, allow_negative_stock: newAllowNeg });
      toast.success(`Warehouse "${trimmed}" added`);
      setNewName("");
      setNewAllowNeg(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to add warehouse");
    }
  };

  const startEdit = (w: any) => {
    setEditingId(w.id);
    setEditingName(w.warehouse_name);
    setEditingAllowNeg(!!w.allow_negative_stock);
  };
  const cancelEdit = () => { setEditingId(null); setEditingName(""); setEditingAllowNeg(false); };

  const saveEdit = async () => {
    if (!editingId) return;
    const trimmed = editingName.trim();
    if (!trimmed) {
      toast.error("Warehouse name cannot be empty");
      return;
    }
    try {
      await updateWarehouse.mutateAsync({ id: editingId, warehouse_name: trimmed, allow_negative_stock: editingAllowNeg });
      toast.success("Warehouse updated");
      cancelEdit();
    } catch (err: any) {
      toast.error(err.message || "Failed to update warehouse");
    }
  };

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div>
          <p className="text-[10px] sm:text-xs uppercase tracking-[0.22em] text-muted-foreground/70 font-mono mb-1">Master Data</p>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Warehouses</h1>
        </div>
      </div>

      <div className="bg-card/95 border border-border/70 rounded-2xl shadow-sm p-5 space-y-4">
        <div>
          <Label htmlFor="new-warehouse" className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Add Warehouse</Label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              id="new-warehouse"
              placeholder="e.g. Main Store, Yard, Branch A"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="sm:max-w-sm"
            />
            <div className="flex items-center gap-2 sm:ml-2">
              <Switch id="new-allow-neg" checked={newAllowNeg} onCheckedChange={setNewAllowNeg} />
              <Label htmlFor="new-allow-neg" className="text-xs cursor-pointer">Allow negative stock</Label>
            </div>
            <Button onClick={handleAdd} disabled={addWarehouse.isPending} className="sm:ml-auto sm:w-auto w-full">
              {addWarehouse.isPending ? "Saving..." : "Add Warehouse"}
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-card/95 border border-border/70 rounded-2xl shadow-sm">
        <div className="px-5 py-4 border-b border-border/70">
          <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">Existing Warehouses</h2>
          <p className="mt-1 text-xs text-muted-foreground">Enable "Allow negative stock" for warehouses (e.g. Main) that should still issue when on-hand is zero.</p>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading warehouses…</div>
        ) : !warehouses?.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm">No warehouses yet. Add at least one above.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] uppercase tracking-[0.18em]">Name</TableHead>
                <TableHead className="text-[11px] uppercase tracking-[0.18em]">Negative Stock</TableHead>
                <TableHead className="text-[11px] uppercase tracking-[0.18em]">Created</TableHead>
                <TableHead className="w-[160px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {warehouses.map((w: any) => {
                const isEditing = editingId === w.id;
                return (
                  <TableRow key={w.id} className="hover:bg-muted/40">
                    <TableCell className="align-middle">
                      {isEditing ? (
                        <Input value={editingName} onChange={(e) => setEditingName(e.target.value)} className="h-9" autoFocus />
                      ) : (
                        <span className="text-sm font-medium">{w.warehouse_name}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <Switch checked={editingAllowNeg} onCheckedChange={setEditingAllowNeg} />
                          <span className="text-xs text-muted-foreground">{editingAllowNeg ? "Allowed" : "Blocked"}</span>
                        </div>
                      ) : w.allow_negative_stock ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[11px] font-mono">
                          <AlertTriangle className="h-3 w-3" /> Allowed
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Blocked</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono">
                      {new Date(w.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <div className="inline-flex items-center gap-1">
                          <Button size="sm" variant="outline" onClick={saveEdit} disabled={updateWarehouse.isPending}>
                            <Check className="h-4 w-4 mr-1" /> Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={cancelEdit}><X className="h-4 w-4" /></Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => startEdit(w)}>
                          <Pencil className="h-4 w-4 mr-1" /> Edit
                        </Button>
                      )}
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
