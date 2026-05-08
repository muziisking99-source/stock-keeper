import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { useProducts, useAddProducts, useDeleteProduct } from "@/hooks/useStockData";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Plus, Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface ParsedRow {
  category: string | null;
  item_code: string;
  item_description: string | null;
}

export default function Products() {
  const { data: products, isLoading } = useProducts();
  const addProducts = useAddProducts();
  const deleteProduct = useDeleteProduct();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; item_code: string } | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteProduct.mutateAsync(deleteTarget.id);
      toast.success(`Deleted ${deleteTarget.item_code}`);
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete product");
    }
  };
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ParsedRow[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [newProduct, setNewProduct] = useState({ item_code: "", item_description: "", category: "" });

  const handleAddProduct = async () => {
    const code = newProduct.item_code.trim();
    if (!code) {
      toast.error("Item Code is required");
      return;
    }
    if (products?.some((p) => p.item_code === code)) {
      toast.error(`Item Code "${code}" already exists`);
      return;
    }
    try {
      await addProducts.mutateAsync([
        {
          item_code: code,
          item_description: newProduct.item_description.trim() || null,
          category: newProduct.category.trim() || null,
        },
      ]);
      toast.success("Product added");
      setNewProduct({ item_code: "", item_description: "", category: "" });
      setAddOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to add product");
    }
  };

  const parseExcel = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

        const parseErrors: string[] = [];
        const seenCodes = new Set<string>();
        const existingCodes = new Set(products?.map((p) => p.item_code) ?? []);
        const rows: ParsedRow[] = [];
        let lastCategory: string | null = null;

        // Try to detect the actual header names in a flexible way
        const sampleRow = json[0] ?? {};
        const headers = Object.keys(sampleRow);
        const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
        const findHeader = (candidates: string[]): string | undefined =>
          headers.find((header) =>
            candidates.some((candidate) => normalize(header) === normalize(candidate))
          );

        const categoryKey = findHeader(["Category"]);
        const codeKey = findHeader(["Item Code", "Code", "ItemCode", "SKU"]);
        const descriptionKey = findHeader(["Item Description", "Description", "ItemDescription"]);

        if (!codeKey) {
          setErrors([
            "Could not find an Item Code column. Make sure the first row has a header like 'Item Code'.",
          ]);
          setPreview(null);
          return;
        }

        json.forEach((row, idx) => {
          const rawCategory = categoryKey
            ? String(row[categoryKey] ?? "").trim()
            : "";
          if (rawCategory) {
            lastCategory = rawCategory;
          }

          const rawCode = String(row[codeKey] ?? "").trim();

          // If there is no item code, treat this row as a section/category header and skip it
          if (!rawCode) {
            return;
          }

          const category = lastCategory;
          const description = descriptionKey
            ? String(row[descriptionKey] ?? "").trim() || null
            : null;

          if (seenCodes.has(rawCode)) {
            parseErrors.push(`Row ${idx + 2}: Duplicate Item Code "${rawCode}" in file`);
            return;
          }

          if (existingCodes.has(rawCode)) {
            parseErrors.push(`Row ${idx + 2}: Item Code "${rawCode}" already exists in database`);
            return;
          }

          seenCodes.add(rawCode);
          rows.push({ category, item_code: rawCode, item_description: description });
        });

        setErrors(parseErrors);
        setPreview(rows.length > 0 ? rows : null);

        if (rows.length === 0 && parseErrors.length === 0) {
          setErrors(["No valid rows found. Ensure the Excel file has columns: Category, Item Code, Item Description"]);
        }
      } catch {
        setErrors(["Failed to parse Excel file. Please check the format."]);
        setPreview(null);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleUpload = async () => {
    if (!preview) return;
    try {
      await addProducts.mutateAsync(preview);
      toast.success(`${preview.length} products uploaded successfully`);
      setPreview(null);
      setErrors([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    }
  };

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
        <div>
          <p className="text-[10px] sm:text-xs uppercase tracking-[0.22em] text-muted-foreground/70 font-mono mb-1">
            Catalog
          </p>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Products</h1>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) parseExcel(file);
            }}
          />
          <Button
            variant="outline"
            className="border-dashed border-2 border-border/70 bg-background/70 hover:bg-muted/60 w-full sm:w-auto"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Select Excel File
          </Button>
          <Button className="w-full sm:w-auto" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Product
          </Button>
        </div>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Product</DialogTitle>
            <DialogDescription>
              Create a single product. Item Code must be unique.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="np-code">Item Code *</Label>
              <Input
                id="np-code"
                value={newProduct.item_code}
                onChange={(e) => setNewProduct({ ...newProduct, item_code: e.target.value })}
                placeholder="e.g. SL-1001"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="np-desc">Description</Label>
              <Input
                id="np-desc"
                value={newProduct.item_description}
                onChange={(e) => setNewProduct({ ...newProduct, item_description: e.target.value })}
                placeholder="Product description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="np-cat">Category</Label>
              <Input
                id="np-cat"
                value={newProduct.category}
                onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                placeholder="e.g. Lubricants"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddProduct} disabled={addProducts.isPending}>
              {addProducts.isPending ? "Adding..." : "Add Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload preview */}
      {errors.length > 0 && (
        <div className="bg-destructive/5 border border-destructive/25 rounded-2xl p-4 mb-4">
          {errors.map((err, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              {err}
            </div>
          ))}
        </div>
      )}

      {preview && (
        <div className="bg-card/95 border border-border/70 rounded-2xl mb-6 shadow-sm">
          <div className="px-5 py-4 border-b border-border/70 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                Preview: {preview.length} products to upload
              </span>
            </div>
            <Button size="sm" onClick={handleUpload} disabled={addProducts.isPending}>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              {addProducts.isPending ? "Uploading..." : "Confirm Upload"}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] uppercase tracking-[0.18em]">
                    Category
                  </TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-[0.18em]">
                    Item Code
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.18em]">
                    Description
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.slice(0, 20).map((row, i) => (
                  <TableRow key={i} className="hover:bg-muted/40">
                    <TableCell className="text-sm">{row.category || "—"}</TableCell>
                    <TableCell className="font-mono text-sm font-medium">{row.item_code}</TableCell>
                    <TableCell className="text-sm">{row.item_description || "—"}</TableCell>
                  </TableRow>
                ))}
                {preview.length > 20 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                      ...and {preview.length - 20} more
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Products list */}
      <div className="bg-card/95 border border-border/70 rounded-2xl shadow-sm">
        <div className="px-5 py-4 border-b border-border/70 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              All Products
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {products?.length ?? 0} records currently in your catalog.
            </p>
          </div>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading products…</div>
        ) : !products?.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No products yet. Upload an Excel file to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-mono text-[11px] uppercase tracking-[0.18em]">
                    Item Code
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.18em]">
                    Description
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.18em]">
                    Category
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.18em]">
                    Created
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.18em] text-right w-20">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.id} className="hover:bg-muted/40">
                    <TableCell className="font-mono text-sm font-medium">{p.item_code}</TableCell>
                    <TableCell className="text-sm">{p.item_description || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.category || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono">
                      {new Date(p.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteTarget({ id: p.id, item_code: p.item_code })}
                        aria-label={`Delete ${p.item_code}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-mono font-medium">{deleteTarget?.item_code}</span>. Products with stock movements cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteProduct.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteProduct.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
