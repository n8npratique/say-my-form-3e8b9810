-- ============================================================
-- Fix: google_service_accounts table + RLS policies
-- This table was created by Lovable but without proper RLS policies,
-- causing INSERT/DELETE operations to silently fail from the client.
-- ============================================================

-- Create table if it doesn't exist (it likely already exists from Lovable)
CREATE TABLE IF NOT EXISTS public.google_service_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.google_service_accounts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (to avoid conflicts)
DROP POLICY IF EXISTS "Members can view service accounts" ON public.google_service_accounts;
DROP POLICY IF EXISTS "Owner/admin can insert service accounts" ON public.google_service_accounts;
DROP POLICY IF EXISTS "Owner/admin can update service accounts" ON public.google_service_accounts;
DROP POLICY IF EXISTS "Owner/admin can delete service accounts" ON public.google_service_accounts;

-- Workspace members can VIEW service accounts
CREATE POLICY "Members can view service accounts"
ON public.google_service_accounts
FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id));

-- Owner/admin can INSERT service accounts
CREATE POLICY "Owner/admin can insert service accounts"
ON public.google_service_accounts
FOR INSERT TO authenticated
WITH CHECK (public.can_manage_workspace(workspace_id));

-- Owner/admin can UPDATE service accounts
CREATE POLICY "Owner/admin can update service accounts"
ON public.google_service_accounts
FOR UPDATE TO authenticated
USING (public.can_manage_workspace(workspace_id));

-- Owner/admin can DELETE service accounts
CREATE POLICY "Owner/admin can delete service accounts"
ON public.google_service_accounts
FOR DELETE TO authenticated
USING (public.can_manage_workspace(workspace_id));

-- Also ensure integrations table has last_synced_at column
ALTER TABLE public.integrations ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
ALTER TABLE public.integrations ADD COLUMN IF NOT EXISTS service_account_id UUID REFERENCES public.google_service_accounts(id);
