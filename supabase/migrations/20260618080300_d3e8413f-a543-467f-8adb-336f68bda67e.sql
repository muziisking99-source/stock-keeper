-- Add metadata column to stock_movements
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Add allow_negative_stock to warehouses
ALTER TABLE public.warehouses
  ADD COLUMN IF NOT EXISTS allow_negative_stock boolean NOT NULL DEFAULT false;

-- Update validate_stock_movement trigger fn: accept CREDIT, respect allow_negative_stock
CREATE OR REPLACE FUNCTION public.validate_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  current_stock INTEGER;
  allow_neg BOOLEAN;
BEGIN
  IF NEW.movement_type NOT IN ('IN', 'OUT', 'TRANSFER_IN', 'TRANSFER_OUT', 'CREDIT') THEN
    RAISE EXCEPTION 'Invalid movement_type: %. Must be IN, OUT, TRANSFER_IN, TRANSFER_OUT, or CREDIT', NEW.movement_type;
  END IF;

  IF NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than 0';
  END IF;

  IF NEW.movement_type IN ('OUT', 'TRANSFER_OUT') THEN
    SELECT allow_negative_stock INTO allow_neg
    FROM public.warehouses WHERE id = NEW.warehouse_id;

    IF NOT COALESCE(allow_neg, false) THEN
      SELECT COALESCE(
        SUM(CASE WHEN movement_type IN ('IN', 'TRANSFER_IN', 'CREDIT') THEN quantity ELSE 0 END) -
        SUM(CASE WHEN movement_type IN ('OUT', 'TRANSFER_OUT') THEN quantity ELSE 0 END),
        0
      ) INTO current_stock
      FROM public.stock_movements
      WHERE product_id = NEW.product_id AND warehouse_id = NEW.warehouse_id;

      IF current_stock - NEW.quantity < 0 THEN
        RAISE EXCEPTION 'Insufficient stock. Current stock: %, requested: %', current_stock, NEW.quantity;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS validate_stock_movement_trigger ON public.stock_movements;
CREATE TRIGGER validate_stock_movement_trigger
  BEFORE INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.validate_stock_movement();

-- Recreate stock_levels view to include CREDIT as positive
DROP VIEW IF EXISTS public.stock_levels;
CREATE VIEW public.stock_levels AS
SELECT
  p.id AS product_id,
  p.item_code,
  p.item_description,
  p.category,
  w.id AS warehouse_id,
  w.warehouse_name,
  w.allow_negative_stock,
  COALESCE(SUM(
    CASE
      WHEN sm.movement_type IN ('IN', 'TRANSFER_IN', 'CREDIT') THEN sm.quantity
      WHEN sm.movement_type IN ('OUT', 'TRANSFER_OUT') THEN -sm.quantity
      ELSE 0
    END
  ), 0)::integer AS current_stock
FROM public.products p
CROSS JOIN public.warehouses w
LEFT JOIN public.stock_movements sm
  ON sm.product_id = p.id AND sm.warehouse_id = w.id
GROUP BY p.id, p.item_code, p.item_description, p.category, w.id, w.warehouse_name, w.allow_negative_stock;

GRANT SELECT ON public.stock_levels TO anon, authenticated, service_role;
