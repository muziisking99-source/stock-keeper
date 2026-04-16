

## End-of-Day Sales Clearing

A new page where you upload an Excel file of items sold during the day. The system validates each row against current stock and creates `OUT` movements to reduce inventory.

### Excel Format
Same pattern as Stock Upload: **Item Code**, **Warehouse**, **Quantity** — but this time quantities are deducted (OUT movements).

### What gets built

1. **New page: `src/pages/SalesClearance.tsx`**
   - Reuses the same upload pattern as StockUpload (file picker, parse, validate, preview, progress bar)
   - Parses Excel with columns: Item Code, Warehouse, Quantity
   - Validates: product exists, warehouse exists, quantity > 0, sufficient stock available
   - On upload, creates `OUT` movements with `movement_type: "OUT"` and `reference_note: "End of day sales clearing from {filename}"`
   - Groups all rows under a single `batch_id`
   - Includes a "Download Template" button

2. **Stock validation** — Before uploading, checks current stock levels for each row. If a row would cause negative stock, it is flagged as an error ("Insufficient stock: current X, requested Y").

3. **Navigation** — Add "Sales Clearing" to the sidebar nav items with a suitable icon (e.g., `ClipboardMinus` or `FileDown`).

4. **Routing** — Register `/sales-clearance` route in `App.tsx` inside the protected routes.

### Technical notes
- Uses existing `useProducts`, `useWarehouses`, `useStockLevels`, and `useAddStockMovement` hooks
- Stock validation uses `useStockLevels()` to check available quantities before submission
- Movement type is `OUT`, which triggers the existing `validate_stock_movement` DB trigger as a safety net against negative stock
- Follows the same red color coding for issuing/out operations per the project's visual theming

