
-- Create debtors table
CREATE TABLE public.debtors (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL,
  customer_name text NOT NULL,
  amount_owed numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'TRY',
  notes text,
  staff_id uuid NOT NULL,
  is_resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.debtors ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Restaurant members can view debtors"
ON public.debtors FOR SELECT
USING (
  auth.uid() IS NOT NULL AND (
    restaurant_id = current_restaurant_id(auth.uid())
    OR is_manager(auth.uid(), restaurant_id)
  )
);

CREATE POLICY "Staff can create debtors"
ON public.debtors FOR INSERT
WITH CHECK (
  auth.uid() = staff_id
  AND restaurant_id = current_restaurant_id(auth.uid())
);

CREATE POLICY "Staff can update debtors"
ON public.debtors FOR UPDATE
USING (
  (auth.uid() = staff_id AND restaurant_id = current_restaurant_id(auth.uid()))
  OR is_manager(auth.uid(), restaurant_id)
);

CREATE POLICY "Staff can delete debtors"
ON public.debtors FOR DELETE
USING (
  (auth.uid() = staff_id AND restaurant_id = current_restaurant_id(auth.uid()))
  OR is_manager(auth.uid(), restaurant_id)
);

-- Trigger for updated_at
CREATE TRIGGER update_debtors_updated_at
BEFORE UPDATE ON public.debtors
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Migrate payment_methods from string array to object array
UPDATE public.restaurant_settings
SET payment_methods = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'name', elem::text,
      'currency', 'TRY',
      'account_number', '',
      'conversion_rate', 1
    )
  )
  FROM jsonb_array_elements_text(payment_methods) AS elem
)
WHERE jsonb_typeof(payment_methods) = 'array'
  AND jsonb_array_length(payment_methods) > 0
  AND jsonb_typeof(payment_methods->0) = 'string';

-- Update default for new rows
ALTER TABLE public.restaurant_settings
ALTER COLUMN payment_methods SET DEFAULT '[{"name":"Cash","currency":"TRY","account_number":"","conversion_rate":1},{"name":"Card","currency":"TRY","account_number":"","conversion_rate":1}]'::jsonb;
