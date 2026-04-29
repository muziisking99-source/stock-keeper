## SpareLube branding + full mobile optimization

### 1. Logo & assets
- Copy uploaded logo to `src/assets/sparelube-logo.png` (full lockup) and `public/favicon.png` (square crop for tab icon).
- Update `index.html`:
  - Title → `SpareLube Stock`
  - Description → SpareLube auto lubricant inventory
  - Add `<link rel="icon" href="/favicon.png">`
  - Update OG title/description
- Update `Login.tsx` to show the full logo above the sign-in card.

### 2. Theme — match logo colors

Logo palette: **red (#E30613)**, **black (#0B0B0D)**, **silver/grey accents**, **white**.

Update `src/index.css` design tokens (light + dark mode):

```text
Light mode (workspace default — clean for daytime warehouse use)
  --background:        near-white (0 0% 98%)
  --foreground:        near-black (0 0% 8%)
  --primary:           red 354 96% 45%   (SpareLube red)
  --primary-foreground white
  --accent:            light grey
  --destructive:       deeper red so it differs from brand red
  --ring:              brand red

Dark sidebar (always dark like the logo background)
  --sidebar-background:  0 0% 7%   (logo black)
  --sidebar-foreground:  0 0% 88%
  --sidebar-primary:     354 96% 50% (red)
  --sidebar-accent:      0 0% 14%
  --sidebar-border:      0 0% 18%

Stock semantic colors (preserved per project memory)
  --stock-in:        green (Receiving) — unchanged
  --stock-out:       brand red (Issuing) — aligns with logo
  --stock-transfer:  amber — unchanged
```

The dashboard's sky-blue gradient cards become red/grey/black gradient cards so the brand carries through. Receiving stays green and Transfer stays amber so operational color-coding (project rule) is preserved.

### 3. Sidebar → mobile drawer

Convert the fixed 288px sidebar in `AppLayout.tsx` to:
- **Desktop (md+):** unchanged sidebar, but with logo image at the top instead of just "StockTracker" text → "SpareLube" wordmark + "Stock Control" subtitle.
- **Mobile (<md):** sidebar becomes a `Sheet` drawer. A sticky top bar appears with:
  - Hamburger button (opens drawer)
  - Small SpareLube logo + "SpareLube" text
  - Logout icon button
- Drawer auto-closes on navigation.
- Main content padding reduces on mobile (`p-3` instead of `p-8`), card border-radius reduces, the outer "Inventory Control Surface" chrome simplifies on small screens.

### 4. Responsive page pass

Every page audited for mobile:

**Dashboard** — stat cards already `grid-cols-1 md:grid-cols-3`. Make the stock-by-product table horizontally scrollable inside a wrapper, shrink heading sizes, stack the header row.

**Current Stock** — biggest mobile pain point. Add a responsive switch:
- ≥ md: existing table with checkboxes
- < md: card list view, one card per stock row showing item code, description, warehouse badge, quantity, checkbox, delete button. Filter controls stack vertically full-width. Bulk action bar becomes a sticky bottom bar.

**Stock Upload / Stock Reconciliation** — file picker full-width, summary cards `grid-cols-2` on mobile (was 4-col), comparison/preview tables wrapped in horizontal scroll containers with sticky first column. Action buttons stack and become full-width.

**Receiving / Issuing / Transfer** — line-item rows currently horizontal; on mobile each line item collapses to a stacked card (product search, warehouse, qty each on its own row). "Add line" and "Submit" become full-width sticky.

**Products / Warehouses (Master Data)** — tables → mobile card list. Add/edit dialogs already responsive via shadcn Dialog; verify padding.

**Login** — center logo above card, max-width card, larger touch targets on inputs/buttons.

**Stock Movements history** — date filters stack, table wraps in scroll container.

### 5. Touch & input polish
- All interactive controls min height 44px on mobile (`h-11` on inputs/buttons in mobile breakpoints).
- `font-size: 16px` on text inputs to prevent iOS zoom-on-focus.
- Replace any hover-only affordances with always-visible buttons on mobile.
- Add `overflow-x-hidden` on body to kill horizontal scroll bleed.

### 6. Memory updates
- Update `mem://style/visual-theming` with new SpareLube palette (brand red primary, black sidebar) while keeping operational color-coding rules.
- Add `mem://ui/responsive-layout` documenting the table-to-card mobile pattern.

### Files touched
- `index.html` (title, favicon, meta)
- `src/index.css` (color tokens)
- `src/assets/sparelube-logo.png` (new)
- `public/favicon.png` (new)
- `src/components/AppLayout.tsx` (logo + mobile drawer + top bar)
- `src/pages/Login.tsx` (logo)
- `src/pages/Dashboard.tsx` (responsive header + table scroll, brand gradients)
- `src/pages/CurrentStock.tsx` (mobile card view, stacked filters, sticky bulk bar)
- `src/pages/StockUpload.tsx` (responsive grids + scroll wrappers)
- `src/pages/SalesClearance.tsx` (same)
- `src/pages/Receiving.tsx`, `Issuing.tsx`, `Transfer.tsx` (line-item mobile stacking)
- `src/pages/Products.tsx`, `Warehouses.tsx` (mobile card list)
- `src/pages/StockMovements.tsx` (responsive filters + scroll)
- `src/components/MovementLineItems.tsx` (stacked layout < md)

No DB or backend changes. No new dependencies — uses existing shadcn `Sheet`, `Card`, and Tailwind responsive classes.
