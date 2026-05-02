CREATE OR REPLACE FUNCTION public.superadmin_get_menu(_restaurant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _items jsonb;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', mi.id,
    'name', mi.name,
    'category', mi.category,
    'description', mi.description,
    'base_price', mi.base_price,
    'per_unit_price', mi.per_unit_price,
    'pricing_unit', mi.pricing_unit,
    'currency', mi.currency,
    'stock_qty', mi.stock_qty,
    'is_available', mi.is_available,
    'is_public', mi.is_public,
    'is_service', mi.is_service,
    'service_duration_minutes', mi.service_duration_minutes,
    'slot_capacity', mi.slot_capacity,
    'image_url', mi.image_url,
    'created_at', mi.created_at
  ) ORDER BY mi.category NULLS LAST, mi.name), '[]'::jsonb)
  INTO _items
  FROM public.menu_items mi
  WHERE mi.restaurant_id = _restaurant_id;

  RETURN jsonb_build_object('items', _items);
END $$;