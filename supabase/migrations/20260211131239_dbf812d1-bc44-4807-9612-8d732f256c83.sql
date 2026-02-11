
-- Products table
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT,
  item_code TEXT NOT NULL UNIQUE,
  item_description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Warehouses table
CREATE TABLE public.warehouses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  warehouse_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Stock Movements table
CREATE TABLE public.stock_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id),
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  movement_type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  reference_note TEXT,
  movement_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Validation trigger for movement_type
CREATE OR REPLACE FUNCTION public.validate_stock_movement()
RETURNS TRIGGER AS $$
DECLARE
  current_stock INTEGER;
BEGIN
  -- Validate movement_type
  IF NEW.movement_type NOT IN ('IN', 'OUT', 'TRANSFER_IN', 'TRANSFER_OUT') THEN
    RAISE EXCEPTION 'Invalid movement_type: %. Must be IN, OUT, TRANSFER_IN, or TRANSFER_OUT', NEW.movement_type;
  END IF;

  -- Validate quantity > 0
  IF NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than 0';
  END IF;

  -- Prevent negative stock for OUT and TRANSFER_OUT
  IF NEW.movement_type IN ('OUT', 'TRANSFER_OUT') THEN
    SELECT COALESCE(
      SUM(CASE WHEN movement_type IN ('IN', 'TRANSFER_IN') THEN quantity ELSE 0 END) -
      SUM(CASE WHEN movement_type IN ('OUT', 'TRANSFER_OUT') THEN quantity ELSE 0 END),
      0
    ) INTO current_stock
    FROM public.stock_movements
    WHERE product_id = NEW.product_id AND warehouse_id = NEW.warehouse_id;

    IF current_stock - NEW.quantity < 0 THEN
      RAISE EXCEPTION 'Insufficient stock. Current stock: %, requested: %', current_stock, NEW.quantity;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER validate_stock_movement_trigger
BEFORE INSERT ON public.stock_movements
FOR EACH ROW
EXECUTE FUNCTION public.validate_stock_movement();

-- Enable RLS (public access for internal tool)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- Allow all operations for anon and authenticated users (internal tool)
CREATE POLICY "Allow all access to products" ON public.products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to warehouses" ON public.warehouses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to stock_movements" ON public.stock_movements FOR ALL USING (true) WITH CHECK (true);

-- Seed two warehouses
INSERT INTO public.warehouses (warehouse_name) VALUES ('Warehouse A'), ('Warehouse B');

-- Create a view for current stock levels
CREATE OR REPLACE VIEW public.stock_levels AS
SELECT 
  p.id as product_id,
  p.item_code,
  p.item_description,
  p.category,
  w.id as warehouse_id,
  w.warehouse_name,
  COALESCE(
    SUM(CASE WHEN sm.movement_type IN ('IN', 'TRANSFER_IN') THEN sm.quantity ELSE 0 END) -
    SUM(CASE WHEN sm.movement_type IN ('OUT', 'TRANSFER_OUT') THEN sm.quantity ELSE 0 END),
    0
  ) as current_stock
FROM public.products p
CROSS JOIN public.warehouses w
LEFT JOIN public.stock_movements sm ON sm.product_id = p.id AND sm.warehouse_id = w.id
GROUP BY p.id, p.item_code, p.item_description, p.category, w.id, w.warehouse_name;
