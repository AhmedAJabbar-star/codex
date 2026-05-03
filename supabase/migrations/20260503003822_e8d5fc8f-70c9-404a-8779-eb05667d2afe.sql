-- Drop legacy unused auth tables (replaced by Google Sheets backend)
DROP TABLE IF EXISTS public.teacher_sessions CASCADE;
DROP TABLE IF EXISTS public.password_archive CASCADE;
DROP TABLE IF EXISTS public.teacher_users CASCADE;
DROP TYPE IF EXISTS public.app_role CASCADE;

-- Lock down system_access_rules: public can read, only service role can write.
DROP POLICY IF EXISTS system_access_rules_read_all ON public.system_access_rules;
DROP POLICY IF EXISTS system_access_rules_write_all ON public.system_access_rules;

CREATE POLICY system_access_rules_select_public
  ON public.system_access_rules FOR SELECT
  USING (true);

-- No INSERT/UPDATE/DELETE policies => only service_role (which bypasses RLS) can mutate.
