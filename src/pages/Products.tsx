import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { useProducts, useAddProducts } from "@/hooks/useStockData";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

interface ParsedRow {
  category: string | null;
  item_code: string;
  item_description: string | null;
}

export default function Products() {
  const { data: products, isLoading } = useProducts();
  const addProducts = useAddProducts();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ParsedRow[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const parseExcel = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        // Check for merged cells
        if (sheet["!merges"] && sheet["!merges"].length > 0) {
          setErrors(["Merged cells detected in the Excel file. Please unmerge all cells and try again."]);
          setPreview(null);
          return;
        }

        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

        const parseErrors: string[] = [];
        const seenCodes = new Set<string>();
        const existingCodes = new Set(products?.map((p) => p.item_code) ?? []);
        const rows: ParsedRow[] = [];

        json.forEach((row, idx) => {
          const rawCode = String(row["Item Code"] ?? row["item_code"] ?? "").trim();
          if (!rawCode) return; // skip blank item codes

          const category = String(row["Category"] ?? row["category"] ?? "").trim() || null;
          const description = String(row["Item Description"] ?? row["item_description"] ?? "").trim() || null;

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
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Products</h1>
        <div className="flex items-center gap-3">
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
            onClick={() => fileInputRef.current?.click()}
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Select Excel File
          </Button>
        </div>
      </div>

      {/* Upload preview */}
      {errors.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4 mb-4">
          {errors.map((err, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              {err}
            </div>
          ))}
        </div>
      )}

      {preview && (
        <div className="bg-card border rounded-md mb-6">
          <div className="p-4 border-b flex items-center justify-between">
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">CATEGORY</TableHead>
                <TableHead className="font-mono text-xs">ITEM CODE</TableHead>
                <TableHead className="text-xs">DESCRIPTION</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.slice(0, 20).map((row, i) => (
                <TableRow key={i}>
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
      )}

      {/* Products list */}
      <div className="bg-card border rounded-md">
        <div className="p-4 border-b">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            All Products ({products?.length ?? 0})
          </h2>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading...</div>
        ) : !products?.length ? (
          <div className="p-8 text-center text-muted-foreground">
            No products yet. Upload an Excel file to get started.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-mono text-xs">ITEM CODE</TableHead>
                <TableHead className="text-xs">DESCRIPTION</TableHead>
                <TableHead className="text-xs">CATEGORY</TableHead>
                <TableHead className="text-xs">CREATED</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-sm font-medium">{p.item_code}</TableCell>
                  <TableCell className="text-sm">{p.item_description || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.category || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground font-mono">
                    {new Date(p.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
