
-- Enum for workspace roles
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'editor', 'viewer');

-- Workspaces
CREATE TABLE public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- Workspace members
CREATE TABLE public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- User roles (app-level, separate from workspace roles)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Forms
CREATE TABLE public.forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_version_id UUID,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;

-- Form versions
CREATE TABLE public.form_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  schema JSONB NOT NULL DEFAULT '{"blocks":[],"logic":[],"loops":[]}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.form_versions ENABLE ROW LEVEL SECURITY;

-- Add FK for published_version_id after form_versions exists
ALTER TABLE public.forms 
  ADD CONSTRAINT forms_published_version_id_fkey 
  FOREIGN KEY (published_version_id) REFERENCES public.form_versions(id);

-- Responses
CREATE TABLE public.responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  form_version_id UUID NOT NULL REFERENCES public.form_versions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  meta JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;

-- Response answers
CREATE TABLE public.response_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id UUID NOT NULL REFERENCES public.responses(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  value JSONB,
  value_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.response_answers ENABLE ROW LEVEL SECURITY;

-- Webhooks
CREATE TABLE public.webhooks (
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
CREATE TABLE public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'google_sheets',
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

-- Profiles table for user info
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPER FUNCTIONS (SECURITY DEFINER to bypass RLS)
-- ============================================================

-- Check workspace membership
CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = auth.uid()
  )
$$;

-- Get user's role in workspace
CREATE OR REPLACE FUNCTION public.get_workspace_role(_workspace_id UUID)
RETURNS app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.workspace_members
  WHERE workspace_id = _workspace_id AND user_id = auth.uid()
  LIMIT 1
$$;

-- Check if user can manage workspace (owner/admin)
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

-- Check if user can edit forms in workspace (owner/admin/editor)
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

-- Get workspace_id from form_id
CREATE OR REPLACE FUNCTION public.get_form_workspace(_form_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT workspace_id FROM public.forms WHERE id = _form_id LIMIT 1
$$;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- Profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (user_id = auth.uid());

-- User roles
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (user_id = auth.uid());

-- Workspaces
CREATE POLICY "Members can view workspace" ON public.workspaces FOR SELECT TO authenticated USING (public.is_workspace_member(id));
CREATE POLICY "Authenticated can create workspace" ON public.workspaces FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner/admin can update workspace" ON public.workspaces FOR UPDATE TO authenticated USING (public.can_manage_workspace(id));
CREATE POLICY "Owner/admin can delete workspace" ON public.workspaces FOR DELETE TO authenticated USING (public.can_manage_workspace(id));

-- Workspace members
CREATE POLICY "Members can view members" ON public.workspace_members FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Owner/admin can add members" ON public.workspace_members FOR INSERT TO authenticated WITH CHECK (public.can_manage_workspace(workspace_id));
CREATE POLICY "Owner/admin can update members" ON public.workspace_members FOR UPDATE TO authenticated USING (public.can_manage_workspace(workspace_id));
CREATE POLICY "Owner/admin or self can remove" ON public.workspace_members FOR DELETE TO authenticated USING (public.can_manage_workspace(workspace_id) OR user_id = auth.uid());

-- Forms
CREATE POLICY "Members can view forms" ON public.forms FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Editor+ can create forms" ON public.forms FOR INSERT TO authenticated WITH CHECK (public.can_edit_in_workspace(workspace_id));
CREATE POLICY "Editor+ can update forms" ON public.forms FOR UPDATE TO authenticated USING (public.can_edit_in_workspace(workspace_id));
CREATE POLICY "Owner/admin can delete forms" ON public.forms FOR DELETE TO authenticated USING (public.can_manage_workspace(workspace_id));

-- Form versions
CREATE POLICY "Members can view versions" ON public.form_versions FOR SELECT TO authenticated USING (public.is_workspace_member(public.get_form_workspace(form_id)));
CREATE POLICY "Editor+ can create versions" ON public.form_versions FOR INSERT TO authenticated WITH CHECK (public.can_edit_in_workspace(public.get_form_workspace(form_id)));
CREATE POLICY "Editor+ can update versions" ON public.form_versions FOR UPDATE TO authenticated USING (public.can_edit_in_workspace(public.get_form_workspace(form_id)));
CREATE POLICY "Owner/admin can delete versions" ON public.form_versions FOR DELETE TO authenticated USING (public.can_manage_workspace(public.get_form_workspace(form_id)));

-- Responses: public insert, authenticated select
CREATE POLICY "Anyone can create response" ON public.responses FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Members can view responses" ON public.responses FOR SELECT TO authenticated USING (public.is_workspace_member((SELECT workspace_id FROM public.forms WHERE id = form_id)));
CREATE POLICY "Anyone can update own response" ON public.responses FOR UPDATE TO anon, authenticated USING (true);

-- Response answers: public insert, authenticated select
CREATE POLICY "Anyone can create answer" ON public.response_answers FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Members can view answers" ON public.response_answers FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.responses r 
    JOIN public.forms f ON f.id = r.form_id 
    WHERE r.id = response_id AND public.is_workspace_member(f.workspace_id)
  )
);

-- Webhooks
CREATE POLICY "Owner/admin can manage webhooks" ON public.webhooks FOR ALL TO authenticated USING (
  public.can_manage_workspace((SELECT workspace_id FROM public.forms WHERE id = form_id))
);

-- Integrations
CREATE POLICY "Owner/admin can manage integrations" ON public.integrations FOR ALL TO authenticated USING (
  public.can_manage_workspace((SELECT workspace_id FROM public.forms WHERE id = form_id))
);

-- Public access to published forms (for runner)
CREATE POLICY "Anyone can view published forms" ON public.forms FOR SELECT TO anon USING (status = 'published');
CREATE POLICY "Anyone can view published form versions" ON public.form_versions FOR SELECT TO anon USING (
  EXISTS (SELECT 1 FROM public.forms WHERE id = form_id AND status = 'published' AND published_version_id = form_versions.id)
);

-- ============================================================
-- TRIGGERS
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

CREATE TRIGGER update_forms_updated_at
  BEFORE UPDATE ON public.forms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
