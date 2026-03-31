
-- Add inventory columns to menu_items
ALTER TABLE public.menu_items ADD COLUMN is_inventory_item boolean NOT NULL DEFAULT false;
ALTER TABLE public.menu_items ADD COLUMN stock_qty integer NOT NULL DEFAULT 0;

-- Create trigger function to decrement stock when order_items are inserted
CREATE OR REPLACE FUNCTION public.decrement_menu_item_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.menu_items
  SET stock_qty = GREATEST(stock_qty - NEW.quantity, 0),
      is_available = CASE WHEN (stock_qty - NEW.quantity) > 0 THEN true ELSE false END
  WHERE id = NEW.menu_item_id
    AND is_inventory_item = true;
  RETURN NEW;
END;
$$;

-- Create trigger on order_items insert
CREATE TRIGGER trg_decrement_menu_item_stock
  AFTER INSERT ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.decrement_menu_item_stock();

-- Also create trigger on tab_items insert (tabs also sell items)
CREATE TRIGGER trg_decrement_menu_item_stock_tabs
  AFTER INSERT ON public.tab_items
  FOR EACH ROW
  EXECUTE FUNCTION public.decrement_menu_item_stock();
