DROP POLICY IF EXISTS system_access_rules_select_public ON public.system_access_rules;
REVOKE ALL ON public.system_access_rules FROM anon;
REVOKE ALL ON public.system_access_rules FROM authenticated;
GRANT ALL ON public.system_access_rules TO service_role;