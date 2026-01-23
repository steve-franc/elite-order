-- Turkish Lira only: set defaults
ALTER TABLE public.menu_items ALTER COLUMN currency SET DEFAULT 'TRY';
ALTER TABLE public.orders ALTER COLUMN currency SET DEFAULT 'TRY';
ALTER TABLE public.restaurant_settings ALTER COLUMN currency SET DEFAULT 'TRY';

-- Menu items: only managers can CRUD; all restaurant members can read
DROP POLICY IF EXISTS "Users can create own menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Users can update own menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Users can delete own menu items" ON public.menu_items;

CREATE POLICY "Managers can create menu items"
ON public.menu_items
FOR INSERT
WITH CHECK (
  is_manager(auth.uid(), restaurant_id)
  AND auth.uid() = staff_id
  AND restaurant_id = current_restaurant_id(auth.uid())
);

CREATE POLICY "Managers can update menu items"
ON public.menu_items
FOR UPDATE
USING (
  is_manager(auth.uid(), restaurant_id)
  AND restaurant_id = current_restaurant_id(auth.uid())
);

CREATE POLICY "Managers can delete menu items"
ON public.menu_items
FOR DELETE
USING (
  is_manager(auth.uid(), restaurant_id)
  AND restaurant_id = current_restaurant_id(auth.uid())
);
