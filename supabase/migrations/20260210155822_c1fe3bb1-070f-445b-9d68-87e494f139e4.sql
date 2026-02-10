
-- Add soft delete column to forms
ALTER TABLE public.forms ADD COLUMN deleted_at timestamp with time zone DEFAULT NULL;

-- Update RLS: members can only see non-deleted forms
DROP POLICY IF EXISTS "Members can view forms" ON public.forms;
CREATE POLICY "Members can view forms"
ON public.forms
FOR SELECT
USING (is_workspace_member(workspace_id) AND deleted_at IS NULL);

-- Allow members to also see deleted forms for trash view
CREATE POLICY "Members can view deleted forms"
ON public.forms
FOR SELECT
USING (is_workspace_member(workspace_id) AND deleted_at IS NOT NULL);
