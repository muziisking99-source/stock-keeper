import { useState } from "react";
import { useWarehouses, useAddWarehouse, useUpdateWarehouse } from "@/hooks/useStockData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";

export default function Warehouses() {
  const { data: warehouses, isLoading } = useWarehouses();
  const addWarehouse = useAddWarehouse();
  const updateWarehouse = useUpdateWarehouse();

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      toast.error("Warehouse name cannot be empty");
      return;
    }
    try {
      await addWarehouse.mutateAsync({ warehouse_name: trimmed });
      toast.success(`Warehouse "${trimmed}" added`);
      setNewName("");
    } catch (err: any) {
      toast.error(err.message || "Failed to add warehouse");
    }
  };

  const startEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const trimmed = editingName.trim();
    if (!trimmed) {
      toast.error("Warehouse name cannot be empty");
      return;
    }
    try {
      await updateWarehouse.mutateAsync({ id: editingId, warehouse_name: trimmed });
      toast.success("Warehouse renamed");
      setEditingId(null);
      setEditingName("");
    } catch (err: any) {
      toast.error(err.message || "Failed to rename warehouse");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground/70 font-mono mb-1">
            Master Data
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Warehouses</h1>
        </div>
      </div>

      <div className="bg-card/95 border border-border/70 rounded-2xl shadow-sm p-5 space-y-4">
        <div>
          <Label htmlFor="new-warehouse" className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Add Warehouse
          </Label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              id="new-warehouse"
              placeholder="e.g. Main Store, Yard, Branch A"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="sm:max-w-sm"
            />
            <Button
              onClick={handleAdd}
              disabled={addWarehouse.isPending}
              className="sm:ml-2 sm:w-auto w-full"
            >
              {addWarehouse.isPending ? "Saving..." : "Add Warehouse"}
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-card/95 border border-border/70 rounded-2xl shadow-sm">
        <div className="px-5 py-4 border-b border-border/70 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Existing Warehouses
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Rename warehouses to match how your team refers to locations.
            </p>
          </div>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading warehouses…</div>
        ) : !warehouses?.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No warehouses yet. Add at least one above to start tracking stock.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] uppercase tracking-[0.18em]">Name</TableHead>
                <TableHead className="text-[11px] uppercase tracking-[0.18em]">Created</TableHead>
                <TableHead className="w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {warehouses.map((w) => {
                const isEditing = editingId === w.id;
                return (
                  <TableRow key={w.id} className="hover:bg-muted/40">
                    <TableCell className="align-middle">
                      {isEditing ? (
                        <Input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="h-9"
                          autoFocus
                        />
                      ) : (
                        <span className="text-sm font-medium">{w.warehouse_name}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono">
                      {new Date(w.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <div className="inline-flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={saveEdit}
                            disabled={updateWarehouse.isPending}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={cancelEdit}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startEdit(w.id, w.warehouse_name)}
                        >
                          <Pencil className="h-4 w-4 mr-1" />
                          Rename
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

