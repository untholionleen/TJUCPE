-- These legacy public SECURITY DEFINER wrappers are unused by the frontend and policies.
-- Keep role checks inside the private schema only.
revoke all on function public.is_admin() from public, anon, authenticated;
revoke all on function public.is_staff() from public, anon, authenticated;
