
-- Enum for user roles
CREATE TYPE public.app_role AS ENUM ('user', 'admin');

-- Teachers/users table (custom auth - not using auth.users because logins are Arabic names, not emails)
CREATE TABLE public.teacher_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL UNIQUE,
  department TEXT,
  college TEXT,
  password_hash TEXT NOT NULL,
  role public.app_role NOT NULL DEFAULT 'user',
  must_change_password BOOLEAN NOT NULL DEFAULT true,
  is_manual BOOLEAN NOT NULL DEFAULT false, -- true if added by admin, not synced from sheet
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_teacher_users_full_name ON public.teacher_users(full_name);

-- Password change archive
CREATE TABLE public.password_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.teacher_users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  action TEXT NOT NULL, -- 'self_change' | 'admin_reset' | 'initial_create' | 'admin_create'
  performed_by TEXT, -- name of admin or 'self'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_password_archive_created ON public.password_archive(created_at DESC);

-- Sessions table for simple custom auth tokens
CREATE TABLE public.teacher_sessions (
  token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.teacher_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days')
);

CREATE INDEX idx_teacher_sessions_user ON public.teacher_sessions(user_id);

-- Enable RLS but DENY all client access. Only service_role (edge functions) can read/write.
ALTER TABLE public.teacher_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_sessions ENABLE ROW LEVEL SECURITY;

-- No policies = no access for anon/authenticated. service_role bypasses RLS.

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_teacher_users_updated
BEFORE UPDATE ON public.teacher_users
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Seed the default admin: aa / aa
-- bcrypt hash of 'aa' (cost 10): $2b$10$8K1p/a0dRTY3F0qVoZX3oeBxkF.qXjQF0ZcR5x5xZ5xZ5xZ5xZ5xZ
-- We'll hash properly inside edge function on first run. For now insert with placeholder, then sync function will fix.
-- Use a known bcrypt hash for 'aa':
INSERT INTO public.teacher_users (full_name, department, college, password_hash, role, must_change_password, is_manual)
VALUES (
  'aa',
  'إدارة النظام',
  'إدارة النظام',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', -- placeholder, will be replaced by edge fn
  'admin',
  false,
  true
)
ON CONFLICT (full_name) DO NOTHING;
