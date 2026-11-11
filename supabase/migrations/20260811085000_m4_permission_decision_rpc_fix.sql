-- Allow the authenticated public wrapper to cross the private permission boundary.
-- The wrapper remains owner-scoped because it always evaluates auth.uid().

alter function public.get_my_permission_decision(text, uuid) security definer;
