CREATE TABLE IF NOT EXISTS public.system_access_rules (
  id text NOT NULL PRIMARY KEY,
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.system_access_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "system_access_rules_read_all" ON public.system_access_rules;
CREATE POLICY "system_access_rules_read_all" ON public.system_access_rules FOR SELECT USING (true);

DROP POLICY IF EXISTS "system_access_rules_write_all" ON public.system_access_rules;
CREATE POLICY "system_access_rules_write_all" ON public.system_access_rules FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.system_access_rules (id, rules) VALUES ('global', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;