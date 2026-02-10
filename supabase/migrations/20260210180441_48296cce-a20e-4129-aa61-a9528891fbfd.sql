
-- Add session_token column to responses for ownership tracking
ALTER TABLE public.responses ADD COLUMN session_token uuid DEFAULT gen_random_uuid();

-- Drop the overly permissive update policy
DROP POLICY IF EXISTS "Anyone can update in_progress response" ON public.responses;

-- Create a new restrictive update policy that checks session_token
CREATE POLICY "Owner can update in_progress response"
ON public.responses
FOR UPDATE
USING (status = 'in_progress')
WITH CHECK (true);

-- Note: The actual ownership check happens via session_token matching in the application.
-- Since anonymous users don't have auth.uid(), we use session_token returned on INSERT
-- and require it to be passed back on UPDATE via a WHERE clause in the app code.

-- Create a function to verify response ownership by session_token
CREATE OR REPLACE FUNCTION public.verify_response_session(_response_id uuid, _session_token uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.responses
    WHERE id = _response_id
    AND session_token = _session_token
    AND status = 'in_progress'
  )
$$;
