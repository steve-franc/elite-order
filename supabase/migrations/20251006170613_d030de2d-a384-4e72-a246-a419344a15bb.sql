-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'staff');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS policies for user_roles
CREATE POLICY "Users can view own roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Update orders table to allow UPDATE and DELETE
CREATE POLICY "Staff can update own orders"
  ON public.orders
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = staff_id);

CREATE POLICY "Staff can delete own orders"
  ON public.orders
  FOR DELETE
  TO authenticated
  USING (auth.uid() = staff_id);

CREATE POLICY "Admins can manage all orders"
  ON public.orders
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Update order_items to allow admin management
CREATE POLICY "Admins can manage all order items"
  ON public.order_items
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Assign staff role to all existing users by default
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'staff'::app_role
FROM auth.users
ON CONFLICT (user_id, role) DO NOTHING;