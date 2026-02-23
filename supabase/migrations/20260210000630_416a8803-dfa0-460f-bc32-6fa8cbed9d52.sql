-- Drop the restrictive policy and recreate as permissive
DROP POLICY IF EXISTS "Anyone can update in_progress response" ON public.responses;

CREATE POLICY "Anyone can update in_progress response"
ON public.responses
FOR UPDATE
USING (status = 'in_progress'::text)
WITH CHECK (true);
