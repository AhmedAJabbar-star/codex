-- Ensure anon/authenticated clients can read and update the global access rules row.
GRANT SELECT, INSERT, UPDATE ON TABLE public.system_access_rules TO anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.system_access_rules TO authenticated;
