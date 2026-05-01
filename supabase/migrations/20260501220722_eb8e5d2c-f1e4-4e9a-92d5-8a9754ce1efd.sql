CREATE OR REPLACE FUNCTION public.get_available_slots(
  _menu_item_id uuid,
  _from date,
  _to date
)
RETURNS TABLE(start_at timestamptz, end_at timestamptz, remaining int)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _mi public.menu_items%ROWTYPE;
  _tz text;
  _duration int;
  _buffer int;
  _capacity int;
  _day date;
  _avail record;
  _slot_local timestamp;
  _window_end_local timestamp;
  _slot_start timestamptz;
  _slot_end timestamptz;
  _booked int;
BEGIN
  SELECT * INTO _mi FROM public.menu_items AS mi WHERE mi.id = _menu_item_id;
  IF NOT FOUND OR NOT _mi.is_service THEN RETURN; END IF;
  IF _mi.is_available = false THEN RETURN; END IF;

  SELECT COALESCE(NULLIF(rs.timezone,''), 'Europe/Istanbul') INTO _tz
    FROM public.restaurant_settings AS rs
   WHERE rs.restaurant_id = _mi.restaurant_id
   LIMIT 1;
  IF _tz IS NULL THEN _tz := 'Europe/Istanbul'; END IF;

  _duration := COALESCE(_mi.service_duration_minutes, 60);
  _buffer := COALESCE(_mi.buffer_minutes, 0);
  _capacity := GREATEST(COALESCE(_mi.slot_capacity, 1), 1);

  _day := _from;
  WHILE _day <= _to LOOP
    FOR _avail IN
      SELECT sa.start_time, sa.end_time
        FROM public.service_availability AS sa
       WHERE sa.menu_item_id = _menu_item_id
         AND sa.is_active = true
         AND sa.weekday = EXTRACT(DOW FROM _day)::smallint
    LOOP
      _slot_local := (_day::timestamp + _avail.start_time);
      _window_end_local := (_day::timestamp + _avail.end_time);
      WHILE _slot_local + make_interval(mins => _duration) <= _window_end_local LOOP
        _slot_start := (_slot_local AT TIME ZONE _tz);
        _slot_end := _slot_start + make_interval(mins => _duration);

        IF _slot_start > now() THEN
          SELECT count(*) INTO _booked
            FROM public.service_bookings AS sb
           WHERE sb.menu_item_id = _menu_item_id
             AND sb.start_at = _slot_start
             AND sb.status IN ('booked','completed');

          start_at := _slot_start;
          end_at := _slot_end;
          remaining := GREATEST(_capacity - _booked, 0);
          IF remaining > 0 THEN RETURN NEXT; END IF;
        END IF;

        _slot_local := _slot_local + make_interval(mins => _duration + _buffer);
      END LOOP;
    END LOOP;
    _day := _day + 1;
  END LOOP;
END;
$$;