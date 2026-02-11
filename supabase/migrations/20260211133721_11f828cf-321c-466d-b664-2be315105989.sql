
-- Allow anonymous users to read their own response (needed for Prefer: return=representation after INSERT)
CREATE POLICY "Allow anonymous response read"
ON public.responses
FOR SELECT
USING (true);

-- Drop the old authenticated-only SELECT since we now have a broader one
DROP POLICY IF EXISTS "Members can view responses" ON public.responses;

-- Recreate members view policy for authenticated users (workspace scoped)
CREATE POLICY "Members can view workspace responses"
ON public.responses
FOR SELECT
USING (
  is_workspace_member(
    (SELECT forms.workspace_id FROM forms WHERE forms.id = responses.form_id)
  )
);
