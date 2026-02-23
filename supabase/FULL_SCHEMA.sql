-- ============================================================
-- TecForms - Schema Completo (Consolidado)
-- Execute este SQL no SQL Editor do Supabase para recriar tudo
-- Atualizado: 2026-02-19
-- ============================================================

-- ============================================================
-- 1. ENUM
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'editor', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 2. TABELAS PRINCIPAIS
-- ============================================================

-- Workspaces
CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- Workspace members
CREATE TABLE IF NOT EXISTS public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- User roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Forms
CREATE TABLE IF NOT EXISTS public.forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_version_id UUID,
  settings JSONB DEFAULT '{}',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;

-- Form versions
CREATE TABLE IF NOT EXISTS public.form_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  schema JSONB NOT NULL DEFAULT '{"blocks":[],"logic":[],"loops":[]}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.form_versions ENABLE ROW LEVEL SECURITY;

-- FK: forms.published_version_id → form_versions.id
DO $$ BEGIN
  ALTER TABLE public.forms
    ADD CONSTRAINT forms_published_version_id_fkey
    FOREIGN KEY (published_version_id) REFERENCES public.form_versions(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Responses
CREATE TABLE IF NOT EXISTS public.responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  form_version_id UUID NOT NULL REFERENCES public.form_versions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  session_token UUID DEFAULT gen_random_uuid(),
  meta JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;

-- Response answers
CREATE TABLE IF NOT EXISTS public.response_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id UUID NOT NULL REFERENCES public.responses(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  value JSONB,
  value_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.response_answers ENABLE ROW LEVEL SECURITY;

-- Webhooks
CREATE TABLE IF NOT EXISTS public.webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT,
  events JSONB DEFAULT '["response.completed"]',
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;

-- Integrations
CREATE TABLE IF NOT EXISTS public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'google_sheets',
  config JSONB DEFAULT '{}',
  last_synced_at TIMESTAMPTZ,
  service_account_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

-- Google Service Accounts
CREATE TABLE IF NOT EXISTS public.google_service_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.google_service_accounts ENABLE ROW LEVEL SECURITY;

-- FK: integrations.service_account_id → google_service_accounts.id
DO $$ BEGIN
  ALTER TABLE public.integrations
    ADD CONSTRAINT integrations_service_account_id_fkey
    FOREIGN KEY (service_account_id) REFERENCES public.google_service_accounts(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. COLUNAS EXTRAS (ADD IF NOT EXISTS)
-- ============================================================
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';
ALTER TABLE public.forms ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.responses ADD COLUMN IF NOT EXISTS session_token UUID DEFAULT gen_random_uuid();
ALTER TABLE public.integrations ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
ALTER TABLE public.integrations ADD COLUMN IF NOT EXISTS service_account_id UUID;

-- ============================================================
-- 4. HELPER FUNCTIONS (SECURITY DEFINER)
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.get_workspace_role(_workspace_id UUID)
RETURNS app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.workspace_members
  WHERE workspace_id = _workspace_id AND user_id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.can_manage_workspace(_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = auth.uid()
    AND role IN ('owner', 'admin')
  )
$$;

CREATE OR REPLACE FUNCTION public.can_edit_in_workspace(_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = auth.uid()
    AND role IN ('owner', 'admin', 'editor')
  )
$$;

CREATE OR REPLACE FUNCTION public.get_form_workspace(_form_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT workspace_id FROM public.forms WHERE id = _form_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.verify_response_session(_response_id UUID, _session_token UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.responses
    WHERE id = _response_id AND session_token = _session_token
  )
$$;

-- ============================================================
-- 5. RLS POLICIES
-- ============================================================

-- ---- Profiles ----
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (user_id = auth.uid());

-- ---- User roles ----
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (user_id = auth.uid());

-- ---- Workspaces ----
DROP POLICY IF EXISTS "Members can view workspace" ON public.workspaces;
DROP POLICY IF EXISTS "Authenticated can create workspace" ON public.workspaces;
DROP POLICY IF EXISTS "Owner/admin can update workspace" ON public.workspaces;
DROP POLICY IF EXISTS "Owner/admin can delete workspace" ON public.workspaces;
CREATE POLICY "Members can view workspace" ON public.workspaces FOR SELECT TO authenticated USING (public.is_workspace_member(id));
CREATE POLICY "Authenticated can create workspace" ON public.workspaces FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner/admin can update workspace" ON public.workspaces FOR UPDATE TO authenticated USING (public.can_manage_workspace(id));
CREATE POLICY "Owner/admin can delete workspace" ON public.workspaces FOR DELETE TO authenticated USING (public.can_manage_workspace(id));

-- ---- Workspace members ----
DROP POLICY IF EXISTS "Members can view members" ON public.workspace_members;
DROP POLICY IF EXISTS "Owner/admin can add members" ON public.workspace_members;
DROP POLICY IF EXISTS "Owner/admin can update members" ON public.workspace_members;
DROP POLICY IF EXISTS "Owner/admin or self can remove" ON public.workspace_members;
CREATE POLICY "Members can view members" ON public.workspace_members FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Owner/admin can add members" ON public.workspace_members FOR INSERT TO authenticated WITH CHECK (public.can_manage_workspace(workspace_id));
CREATE POLICY "Owner/admin can update members" ON public.workspace_members FOR UPDATE TO authenticated USING (public.can_manage_workspace(workspace_id));
CREATE POLICY "Owner/admin or self can remove" ON public.workspace_members FOR DELETE TO authenticated USING (public.can_manage_workspace(workspace_id) OR user_id = auth.uid());

-- ---- Forms ----
DROP POLICY IF EXISTS "Members can view forms" ON public.forms;
DROP POLICY IF EXISTS "Members can view deleted forms" ON public.forms;
DROP POLICY IF EXISTS "Editor+ can create forms" ON public.forms;
DROP POLICY IF EXISTS "Editor+ can update forms" ON public.forms;
DROP POLICY IF EXISTS "Owner/admin can delete forms" ON public.forms;
DROP POLICY IF EXISTS "Anyone can view published forms" ON public.forms;
CREATE POLICY "Members can view forms" ON public.forms FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id) AND deleted_at IS NULL);
CREATE POLICY "Members can view deleted forms" ON public.forms FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id) AND deleted_at IS NOT NULL);
CREATE POLICY "Editor+ can create forms" ON public.forms FOR INSERT TO authenticated WITH CHECK (public.can_edit_in_workspace(workspace_id));
CREATE POLICY "Editor+ can update forms" ON public.forms FOR UPDATE TO authenticated USING (public.can_edit_in_workspace(workspace_id));
CREATE POLICY "Owner/admin can delete forms" ON public.forms FOR DELETE TO authenticated USING (public.can_manage_workspace(workspace_id));
CREATE POLICY "Anyone can view published forms" ON public.forms FOR SELECT TO anon USING (status = 'published');

-- ---- Form versions ----
DROP POLICY IF EXISTS "Members can view versions" ON public.form_versions;
DROP POLICY IF EXISTS "Editor+ can create versions" ON public.form_versions;
DROP POLICY IF EXISTS "Editor+ can update versions" ON public.form_versions;
DROP POLICY IF EXISTS "Owner/admin can delete versions" ON public.form_versions;
DROP POLICY IF EXISTS "Anyone can view published form versions" ON public.form_versions;
CREATE POLICY "Members can view versions" ON public.form_versions FOR SELECT TO authenticated USING (public.is_workspace_member(public.get_form_workspace(form_id)));
CREATE POLICY "Editor+ can create versions" ON public.form_versions FOR INSERT TO authenticated WITH CHECK (public.can_edit_in_workspace(public.get_form_workspace(form_id)));
CREATE POLICY "Editor+ can update versions" ON public.form_versions FOR UPDATE TO authenticated USING (public.can_edit_in_workspace(public.get_form_workspace(form_id)));
CREATE POLICY "Owner/admin can delete versions" ON public.form_versions FOR DELETE TO authenticated USING (public.can_manage_workspace(public.get_form_workspace(form_id)));
CREATE POLICY "Anyone can view published form versions" ON public.form_versions FOR SELECT TO anon USING (
  EXISTS (SELECT 1 FROM public.forms WHERE id = form_id AND status = 'published' AND published_version_id = form_versions.id)
);

-- ---- Responses ----
DROP POLICY IF EXISTS "Anyone can create response" ON public.responses;
DROP POLICY IF EXISTS "Members can view responses" ON public.responses;
DROP POLICY IF EXISTS "Anyone can update own response" ON public.responses;
DROP POLICY IF EXISTS "Anyone can update in_progress response" ON public.responses;
DROP POLICY IF EXISTS "Owner can update in_progress response" ON public.responses;
CREATE POLICY "Anyone can create response" ON public.responses FOR INSERT TO anon, authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.forms WHERE id = form_id AND status = 'published'));
CREATE POLICY "Members can view responses" ON public.responses FOR SELECT TO authenticated USING (public.is_workspace_member((SELECT workspace_id FROM public.forms WHERE id = form_id)));
CREATE POLICY "Owner can update in_progress response" ON public.responses FOR UPDATE TO anon, authenticated
  USING (status = 'in_progress') WITH CHECK (status = 'in_progress');

-- ---- Response answers ----
DROP POLICY IF EXISTS "Anyone can create answer" ON public.response_answers;
DROP POLICY IF EXISTS "Members can view answers" ON public.response_answers;
CREATE POLICY "Anyone can create answer" ON public.response_answers FOR INSERT TO anon, authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.responses WHERE id = response_id AND status = 'in_progress'));
CREATE POLICY "Members can view answers" ON public.response_answers FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.responses r
    JOIN public.forms f ON f.id = r.form_id
    WHERE r.id = response_id AND public.is_workspace_member(f.workspace_id)
  )
);

-- ---- Webhooks ----
DROP POLICY IF EXISTS "Owner/admin can manage webhooks" ON public.webhooks;
CREATE POLICY "Owner/admin can manage webhooks" ON public.webhooks FOR ALL TO authenticated USING (
  public.can_manage_workspace((SELECT workspace_id FROM public.forms WHERE id = form_id))
);

-- ---- Integrations ----
DROP POLICY IF EXISTS "Owner/admin can manage integrations" ON public.integrations;
CREATE POLICY "Owner/admin can manage integrations" ON public.integrations FOR ALL TO authenticated USING (
  public.can_manage_workspace((SELECT workspace_id FROM public.forms WHERE id = form_id))
);

-- ---- Google Service Accounts ----
-- NOTE: encrypted_key column is revoked from authenticated role (column-level security).
-- Only service_role (edge functions) can read it. Frontend sees id, workspace_id, name, client_email.
REVOKE SELECT (encrypted_key) ON public.google_service_accounts FROM authenticated;
DROP POLICY IF EXISTS "Allow all for service accounts" ON public.google_service_accounts;
DROP POLICY IF EXISTS "Members can view service accounts" ON public.google_service_accounts;
DROP POLICY IF EXISTS "Owner/admin can insert service accounts" ON public.google_service_accounts;
DROP POLICY IF EXISTS "Owner/admin can update service accounts" ON public.google_service_accounts;
DROP POLICY IF EXISTS "Owner/admin can delete service accounts" ON public.google_service_accounts;
CREATE POLICY "Members can view service accounts" ON public.google_service_accounts FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Owner/admin can insert service accounts" ON public.google_service_accounts FOR INSERT TO authenticated WITH CHECK (public.can_manage_workspace(workspace_id));
CREATE POLICY "Owner/admin can update service accounts" ON public.google_service_accounts FOR UPDATE TO authenticated USING (public.can_manage_workspace(workspace_id));
CREATE POLICY "Owner/admin can delete service accounts" ON public.google_service_accounts FOR DELETE TO authenticated USING (public.can_manage_workspace(workspace_id));

-- ============================================================
-- 6. TRIGGERS
-- ============================================================

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-add owner as workspace member
CREATE OR REPLACE FUNCTION public.handle_new_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_workspace_created ON public.workspaces;
CREATE TRIGGER on_workspace_created
  AFTER INSERT ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_workspace();

-- Update forms.updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_forms_updated_at ON public.forms;
CREATE TRIGGER update_forms_updated_at
  BEFORE UPDATE ON public.forms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 7. STORAGE (form-assets bucket)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('form-assets', 'form-assets', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read form-assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload form-assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update form-assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete form-assets" ON storage.objects;
DROP POLICY IF EXISTS "Owner can delete own form-assets" ON storage.objects;
DROP POLICY IF EXISTS "Form assets are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload form assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete form assets" ON storage.objects;

CREATE POLICY "Public read form-assets" ON storage.objects FOR SELECT USING (bucket_id = 'form-assets');
CREATE POLICY "Authenticated upload form-assets" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'form-assets');
CREATE POLICY "Authenticated update form-assets" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'form-assets');
CREATE POLICY "Owner can delete own form-assets" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'form-assets' AND (select auth.uid()) = owner);

-- ============================================================
-- FIM - Schema completo do TecForms
-- ============================================================
