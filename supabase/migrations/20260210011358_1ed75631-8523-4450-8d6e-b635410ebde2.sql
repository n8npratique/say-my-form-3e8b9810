
-- Create google_service_accounts table
CREATE TABLE public.google_service_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  client_email text NOT NULL,
  encrypted_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.google_service_accounts ENABLE ROW LEVEL SECURITY;

-- Only owner/admin can manage
CREATE POLICY "Owner/admin can manage service accounts"
ON public.google_service_accounts
FOR ALL
USING (can_manage_workspace(workspace_id))
WITH CHECK (can_manage_workspace(workspace_id));

-- Add service_account_id and last_synced_at to integrations
ALTER TABLE public.integrations
ADD COLUMN service_account_id uuid REFERENCES public.google_service_accounts(id) ON DELETE SET NULL,
ADD COLUMN last_synced_at timestamptz;
