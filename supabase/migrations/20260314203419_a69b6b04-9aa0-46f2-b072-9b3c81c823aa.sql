
-- Create tabs table
CREATE TABLE public.tabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL,
  customer_name text,
  notes text,
  currency text NOT NULL DEFAULT 'TRY',
  status text NOT NULL DEFAULT 'open',
  closed_at timestamptz,
  payment_method text,
  total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create tab_items table
CREATE TABLE public.tab_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_id uuid NOT NULL REFERENCES public.tabs(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id),
  menu_item_name text NOT NULL,
  quantity integer NOT NULL,
  extra_units integer NOT NULL DEFAULT 0,
  base_price_at_time numeric NOT NULL,
  per_unit_price_at_time numeric,
  subtotal numeric NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tab_items ENABLE ROW LEVEL SECURITY;

-- RLS for tabs: restaurant members can view
CREATE POLICY "Restaurant members can view tabs"
  ON public.tabs FOR SELECT
  USING (auth.uid() IS NOT NULL AND (restaurant_id = current_restaurant_id(auth.uid()) OR is_manager(auth.uid(), restaurant_id)));

-- RLS for tabs: staff can create tabs for their restaurant
CREATE POLICY "Staff can create tabs"
  ON public.tabs FOR INSERT
  WITH CHECK (auth.uid() = staff_id AND restaurant_id = current_restaurant_id(auth.uid()));

-- RLS for tabs: staff can update own tabs, managers can update all
CREATE POLICY "Staff can update own tabs"
  ON public.tabs FOR UPDATE
  USING ((auth.uid() = staff_id AND restaurant_id = current_restaurant_id(auth.uid())) OR is_manager(auth.uid(), restaurant_id));

-- RLS for tabs: staff can delete own tabs, managers can delete all
CREATE POLICY "Staff can delete own tabs"
  ON public.tabs FOR DELETE
  USING ((auth.uid() = staff_id AND restaurant_id = current_restaurant_id(auth.uid())) OR is_manager(auth.uid(), restaurant_id));

-- RLS for tab_items: viewable if user can view the parent tab
CREATE POLICY "Users can view tab items"
  ON public.tab_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.tabs t
    WHERE t.id = tab_items.tab_id
      AND auth.uid() IS NOT NULL
      AND (t.restaurant_id = current_restaurant_id(auth.uid()) OR is_manager(auth.uid(), t.restaurant_id))
  ));

-- RLS for tab_items: insertable if user owns or manages the parent tab
CREATE POLICY "Users can create tab items"
  ON public.tab_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tabs t
    WHERE t.id = tab_items.tab_id
      AND ((auth.uid() = t.staff_id AND t.restaurant_id = current_restaurant_id(auth.uid())) OR is_manager(auth.uid(), t.restaurant_id))
  ));

-- RLS for tab_items: deletable if user owns or manages the parent tab
CREATE POLICY "Users can delete tab items"
  ON public.tab_items FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.tabs t
    WHERE t.id = tab_items.tab_id
      AND ((auth.uid() = t.staff_id AND t.restaurant_id = current_restaurant_id(auth.uid())) OR is_manager(auth.uid(), t.restaurant_id))
  ));
