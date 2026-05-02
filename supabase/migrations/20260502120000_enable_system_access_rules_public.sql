-- Global system visibility/password rules used by Control Panel.
-- This table must be readable/writable from the client so settings apply to all users/devices.

CREATE TABLE IF NOT EXISTS public.system_access_rules (
  id TEXT PRIMARY KEY,
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.system_access_rules ENABLE ROW LEVEL SECURITY;

-- Public read for applying visibility/protection rules on page load.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'system_access_rules'
      AND policyname = 'system_access_rules_select_all'
  ) THEN
    CREATE POLICY system_access_rules_select_all
      ON public.system_access_rules
      FOR SELECT
      USING (true);
  END IF;
END$$;

-- Public upsert/update for control-panel save (single global row).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'system_access_rules'
      AND policyname = 'system_access_rules_insert_all'
  ) THEN
    CREATE POLICY system_access_rules_insert_all
      ON public.system_access_rules
      FOR INSERT
      WITH CHECK (true);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'system_access_rules'
      AND policyname = 'system_access_rules_update_all'
  ) THEN
    CREATE POLICY system_access_rules_update_all
      ON public.system_access_rules
      FOR UPDATE
      USING (true)
      WITH CHECK (true);
  END IF;
END$$;

INSERT INTO public.system_access_rules (id, rules)
VALUES ('global', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
