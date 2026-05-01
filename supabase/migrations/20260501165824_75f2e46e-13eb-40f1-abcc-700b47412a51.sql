CREATE OR REPLACE FUNCTION public.create_staff_order(_restaurant_id uuid, _payment_method text, _notes text, _discount_amount numeric, _customer_name text, _items jsonb, _payment_status text DEFAULT 'paid'::text)
 RETURNS TABLE(id uuid, order_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _order_id uuid := gen_random_uuid();
  _order_number text;
  _subtotal_total numeric := 0;
  _item jsonb;
  _menu_item public.menu_items%ROWTYPE;
  _quantity int;
  _extra_units int;
  _subtotal numeric;
  _user_id uuid := auth.uid();
  _final_total numeric;
  _disc numeric := COALESCE(_discount_amount, 0);
  _ps text := COALESCE(NULLIF(btrim(_payment_status),''), 'paid');
  _status text;
  _slot_at timestamptz;
  _slot_end timestamptz;
  _booked int;
  _new_oi_id uuid;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _restaurant_id IS NULL THEN RAISE EXCEPTION 'Restaurant required'; END IF;
  IF btrim(COALESCE(_payment_method,'')) = '' THEN RAISE EXCEPTION 'Payment method required'; END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;
  IF _ps NOT IN ('paid','unpaid') THEN _ps := 'paid'; END IF;

  SELECT r.status INTO _status FROM public.restaurants r WHERE r.id = _restaurant_id;
  IF _status = 'on_hold' THEN RAISE EXCEPTION 'Restaurant is on hold. Please contact support.';
  ELSIF _status = 'archived' THEN RAISE EXCEPTION 'Restaurant is archived.';
  END IF;

  IF NOT (
    _restaurant_id = public.current_restaurant_id(_user_id)
    OR public.is_manager(_user_id, _restaurant_id)
    OR public.is_superadmin(_user_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized for this restaurant';
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _quantity := GREATEST(COALESCE((_item->>'quantity')::int, 0), 0);
    _extra_units := GREATEST(COALESCE((_item->>'extra_units')::int, 0), 0);
    SELECT mi.* INTO _menu_item FROM public.menu_items mi
      WHERE mi.id = (_item->>'menu_item_id')::uuid AND mi.restaurant_id = _restaurant_id LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Menu item not found'; END IF;
    IF _menu_item.is_service THEN
      IF (_item->>'slot_at') IS NULL THEN RAISE EXCEPTION 'Please choose a time slot for %', _menu_item.name; END IF;
      _quantity := 1; _extra_units := 0;
    END IF;
    IF _quantity = 0 AND _extra_units = 0 THEN RAISE EXCEPTION 'Each item must have quantity or extra units'; END IF;
    _subtotal := (_menu_item.base_price * _quantity) + (COALESCE(_menu_item.per_unit_price,0) * _extra_units);
    _subtotal_total := _subtotal_total + _subtotal;
  END LOOP;

  IF _disc < 0 THEN _disc := 0; END IF;
  IF _disc > _subtotal_total THEN _disc := _subtotal_total; END IF;
  _final_total := _subtotal_total - _disc;

  _order_number := public.get_next_order_number(_restaurant_id);

  INSERT INTO public.orders (
    id, staff_id, total, payment_method, notes, currency, is_public_order,
    restaurant_id, order_number, discount_amount, status, customer_name, payment_status
  ) VALUES (
    _order_id, _user_id, _final_total, _payment_method,
    NULLIF(btrim(COALESCE(_notes,'')),''), 'TRY', false,
    _restaurant_id, _order_number, _disc, 'confirmed',
    NULLIF(btrim(COALESCE(_customer_name,'')),''), _ps
  );

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _quantity := GREATEST(COALESCE((_item->>'quantity')::int, 0), 0);
    _extra_units := GREATEST(COALESCE((_item->>'extra_units')::int, 0), 0);
    SELECT mi.* INTO _menu_item FROM public.menu_items mi
      WHERE mi.id = (_item->>'menu_item_id')::uuid AND mi.restaurant_id = _restaurant_id LIMIT 1;
    IF _menu_item.is_service THEN _quantity := 1; _extra_units := 0; END IF;
    _subtotal := (_menu_item.base_price * _quantity) + (COALESCE(_menu_item.per_unit_price,0) * _extra_units);

    INSERT INTO public.order_items AS oi (
      order_id, menu_item_id, menu_item_name, quantity, extra_units,
      base_price_at_time, per_unit_price_at_time, price_at_time, subtotal
    ) VALUES (
      _order_id, _menu_item.id, _menu_item.name, _quantity, _extra_units,
      _menu_item.base_price, _menu_item.per_unit_price, _menu_item.base_price, _subtotal
    ) RETURNING oi.id INTO _new_oi_id;

    IF _menu_item.is_service THEN
      _slot_at := (_item->>'slot_at')::timestamptz;
      _slot_end := _slot_at + make_interval(mins => COALESCE(_menu_item.service_duration_minutes, 60));
      SELECT count(*) INTO _booked FROM public.service_bookings sb
        WHERE sb.menu_item_id = _menu_item.id AND sb.start_at = _slot_at AND sb.status IN ('booked','completed');
      IF _booked >= GREATEST(COALESCE(_menu_item.slot_capacity,1),1) THEN
        RAISE EXCEPTION 'That slot for % is no longer available', _menu_item.name;
      END IF;
      INSERT INTO public.service_bookings (order_id, order_item_id, menu_item_id, restaurant_id, start_at, end_at, status, customer_name)
      VALUES (_order_id, _new_oi_id, _menu_item.id, _restaurant_id, _slot_at, _slot_end, 'booked', NULLIF(btrim(COALESCE(_customer_name,'')),''));
    END IF;
  END LOOP;

  RETURN QUERY SELECT _order_id, _order_number;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_public_order(_restaurant_id uuid, _customer_name text, _customer_email text, _customer_phone text, _customer_location text, _payment_method text, _notes text, _items jsonb)
 RETURNS TABLE(id uuid, order_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _order_id uuid := gen_random_uuid();
  _order_number text;
  _total numeric := 0;
  _item jsonb;
  _menu_item public.menu_items%ROWTYPE;
  _quantity integer;
  _extra_units integer;
  _subtotal numeric;
  _status text;
  _slot_at timestamptz;
  _slot_end timestamptz;
  _booked int;
  _new_oi_id uuid;
BEGIN
  IF _restaurant_id IS NULL THEN RAISE EXCEPTION 'Restaurant not configured'; END IF;
  IF btrim(COALESCE(_customer_name,'')) = '' THEN RAISE EXCEPTION 'Name is required'; END IF;
  IF btrim(COALESCE(_payment_method,'')) = '' THEN RAISE EXCEPTION 'Payment method is required'; END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Please add items to the order'; END IF;

  SELECT r.status INTO _status FROM public.restaurants r WHERE r.id = _restaurant_id;
  IF _status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Online ordering is currently unavailable for this restaurant';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.restaurant_settings rs WHERE rs.restaurant_id = _restaurant_id AND rs.allow_public_orders = true) THEN
    RAISE EXCEPTION 'Online ordering is currently unavailable for this restaurant';
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _quantity := GREATEST(COALESCE((_item->>'quantity')::int, 0), 0);
    _extra_units := GREATEST(COALESCE((_item->>'extra_units')::int, 0), 0);
    SELECT mi.* INTO _menu_item FROM public.menu_items mi
      WHERE mi.id = (_item->>'menu_item_id')::uuid AND mi.restaurant_id = _restaurant_id AND mi.is_available = true AND mi.is_public = true LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'One or more menu items are unavailable'; END IF;
    IF _menu_item.is_service THEN
      IF (_item->>'slot_at') IS NULL THEN RAISE EXCEPTION 'Please choose a time slot for %', _menu_item.name; END IF;
      _quantity := 1; _extra_units := 0;
    END IF;
    IF _quantity = 0 AND _extra_units = 0 THEN RAISE EXCEPTION 'Each order item must include quantity or extra units'; END IF;
    _subtotal := (_menu_item.base_price * _quantity) + (COALESCE(_menu_item.per_unit_price,0) * _extra_units);
    _total := _total + _subtotal;
  END LOOP;

  _order_number := public.get_next_order_number(_restaurant_id);

  INSERT INTO public.orders (id, staff_id, total, payment_method, notes, customer_name, customer_email, customer_phone, customer_location, is_public_order, currency, restaurant_id, order_number, discount_amount, status)
  VALUES (_order_id, '00000000-0000-0000-0000-000000000000', _total, _payment_method, NULLIF(btrim(COALESCE(_notes,'')),''), btrim(_customer_name), NULLIF(btrim(COALESCE(_customer_email,'')),''), NULLIF(btrim(COALESCE(_customer_phone,'')),''), NULLIF(btrim(COALESCE(_customer_location,'')),''), true, 'TRY', _restaurant_id, _order_number, 0, 'pending');

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _quantity := GREATEST(COALESCE((_item->>'quantity')::int, 0), 0);
    _extra_units := GREATEST(COALESCE((_item->>'extra_units')::int, 0), 0);
    SELECT mi.* INTO _menu_item FROM public.menu_items mi
      WHERE mi.id = (_item->>'menu_item_id')::uuid AND mi.restaurant_id = _restaurant_id LIMIT 1;
    IF _menu_item.is_service THEN _quantity := 1; _extra_units := 0; END IF;
    _subtotal := (_menu_item.base_price * _quantity) + (COALESCE(_menu_item.per_unit_price,0) * _extra_units);

    INSERT INTO public.order_items AS oi (order_id, menu_item_id, menu_item_name, quantity, extra_units, base_price_at_time, per_unit_price_at_time, price_at_time, subtotal)
    VALUES (_order_id, _menu_item.id, _menu_item.name, _quantity, _extra_units, _menu_item.base_price, _menu_item.per_unit_price, _menu_item.base_price, _subtotal)
    RETURNING oi.id INTO _new_oi_id;

    IF _menu_item.is_service THEN
      _slot_at := (_item->>'slot_at')::timestamptz;
      _slot_end := _slot_at + make_interval(mins => COALESCE(_menu_item.service_duration_minutes, 60));
      SELECT count(*) INTO _booked FROM public.service_bookings sb
        WHERE sb.menu_item_id = _menu_item.id AND sb.start_at = _slot_at AND sb.status IN ('booked','completed');
      IF _booked >= GREATEST(COALESCE(_menu_item.slot_capacity,1),1) THEN
        RAISE EXCEPTION 'That slot for % is no longer available', _menu_item.name;
      END IF;
      INSERT INTO public.service_bookings (order_id, order_item_id, menu_item_id, restaurant_id, start_at, end_at, status, customer_name, customer_phone)
      VALUES (_order_id, _new_oi_id, _menu_item.id, _restaurant_id, _slot_at, _slot_end, 'booked', btrim(_customer_name), NULLIF(btrim(COALESCE(_customer_phone,'')),''));
    END IF;
  END LOOP;

  RETURN QUERY SELECT _order_id, _order_number;
END;
$function$;