-- Fix infinite trigger bounce between menu_items <-> inventory that causes
-- "tuple to be updated was already modified by an operation triggered by the current command"

-- Use a session-level guard to prevent re-entry between the two sync triggers.

CREATE OR REPLACE FUNCTION public.sync_menu_item_to_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inv_id uuid;
  _status inventory_status;
  _guard text;
BEGIN
  -- If we are already inside an inventory->menu sync, do nothing to break the loop
  BEGIN
    _guard := current_setting('app.syncing_inventory', true);
  EXCEPTION WHEN OTHERS THEN
    _guard := NULL;
  END;
  IF _guard = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.is_inventory_item = false THEN
    RETURN NEW;
  END IF;

  _status := CASE
    WHEN COALESCE(NEW.stock_qty,0) <= 0 THEN 'finished'::inventory_status
    WHEN COALESCE(NEW.stock_qty,0) <= 5 THEN 'almost_finished'::inventory_status
    ELSE 'available'::inventory_status
  END;

  -- mark that we are syncing menu->inventory so the inventory trigger skips
  PERFORM set_config('app.syncing_menu', 'on', true);

  IF NEW.inventory_id IS NOT NULL THEN
    UPDATE public.inventory
       SET quantity = NEW.stock_qty,
           status = _status,
           updated_at = now()
     WHERE id = NEW.inventory_id
       AND (quantity IS DISTINCT FROM NEW.stock_qty OR status IS DISTINCT FROM _status);
    PERFORM set_config('app.syncing_menu', 'off', true);
    RETURN NEW;
  END IF;

  SELECT id INTO _inv_id
    FROM public.inventory
   WHERE restaurant_id = NEW.restaurant_id
     AND lower(name) = lower(NEW.name)
   LIMIT 1;

  IF _inv_id IS NULL THEN
    INSERT INTO public.inventory (name, restaurant_id, quantity, unit, status)
    VALUES (NEW.name, NEW.restaurant_id, NEW.stock_qty, 'units', _status)
    RETURNING id INTO _inv_id;
  ELSE
    UPDATE public.inventory
       SET quantity = NEW.stock_qty,
           status = _status,
           updated_at = now()
     WHERE id = _inv_id
       AND (quantity IS DISTINCT FROM NEW.stock_qty OR status IS DISTINCT FROM _status);
  END IF;

  NEW.inventory_id := _inv_id;
  PERFORM set_config('app.syncing_menu', 'off', true);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_inventory_to_menu_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _guard text;
BEGIN
  -- If we are already inside a menu->inventory sync, skip to break the loop
  BEGIN
    _guard := current_setting('app.syncing_menu', true);
  EXCEPTION WHEN OTHERS THEN
    _guard := NULL;
  END;
  IF _guard = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.quantity IS DISTINCT FROM OLD.quantity OR NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM set_config('app.syncing_inventory', 'on', true);
    UPDATE public.menu_items
       SET stock_qty = GREATEST(FLOOR(NEW.quantity)::int, 0),
           is_available = CASE WHEN NEW.quantity > 0 AND NEW.status <> 'finished' THEN true ELSE false END,
           updated_at = now()
     WHERE inventory_id = NEW.id
       AND (stock_qty IS DISTINCT FROM GREATEST(FLOOR(NEW.quantity)::int, 0));
    PERFORM set_config('app.syncing_inventory', 'off', true);
  END IF;
  RETURN NEW;
END;
$$;

-- Also update decrement function to set the guard so the inventory mirror
-- doesn't bounce back into menu_items within the same statement.
CREATE OR REPLACE FUNCTION public.decrement_menu_item_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inv_id uuid;
  _new_qty numeric;
BEGIN
  PERFORM set_config('app.syncing_menu', 'on', true);

  UPDATE public.menu_items
     SET stock_qty = GREATEST(stock_qty - NEW.quantity, 0),
         is_available = CASE WHEN (stock_qty - NEW.quantity) > 0 THEN true ELSE false END
   WHERE id = NEW.menu_item_id
     AND is_inventory_item = true
  RETURNING inventory_id, stock_qty INTO _inv_id, _new_qty;

  IF _inv_id IS NOT NULL THEN
    UPDATE public.inventory
       SET quantity = _new_qty,
           status = CASE
             WHEN _new_qty <= 0 THEN 'finished'::inventory_status
             WHEN _new_qty <= 5 THEN 'almost_finished'::inventory_status
             ELSE 'available'::inventory_status
           END,
           updated_at = now()
     WHERE id = _inv_id;
  END IF;

  PERFORM set_config('app.syncing_menu', 'off', true);
  RETURN NEW;
END;
$$;