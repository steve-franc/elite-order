-- Add pricing_unit column to menu_items table
ALTER TABLE public.menu_items 
ADD COLUMN pricing_unit text DEFAULT 'per piece';

-- Add a comment to explain the column
COMMENT ON COLUMN public.menu_items.pricing_unit IS 'Pricing unit for the item (e.g., per piece, per scoop, per serving)';