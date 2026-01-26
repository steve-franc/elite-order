-- Drop the old trigger that causes the ON CONFLICT error
DROP TRIGGER IF EXISTS on_auth_user_created_role ON auth.users;

-- Drop the old function that references a non-existent unique constraint
DROP FUNCTION IF EXISTS public.handle_new_user_role();

-- Ensure proper unique constraint exists for restaurant-scoped roles
-- First drop any existing constraint on (user_id, role) without restaurant_id
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;

-- Add unique constraint that includes restaurant_id for proper multi-tenancy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'user_roles_user_id_role_restaurant_id_key'
  ) THEN
    ALTER TABLE public.user_roles 
    ADD CONSTRAINT user_roles_user_id_role_restaurant_id_key 
    UNIQUE (user_id, role, restaurant_id);
  END IF;
END $$;