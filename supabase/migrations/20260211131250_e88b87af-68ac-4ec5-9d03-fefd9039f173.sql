
-- Fix the security definer view by setting security_invoker
ALTER VIEW public.stock_levels SET (security_invoker = on);
