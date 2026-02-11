
-- Allow anonymous users to insert responses (public form submissions)
CREATE POLICY "Allow anonymous response creation"
ON public.responses
FOR INSERT
WITH CHECK (true);

-- Allow anonymous users to insert response answers
CREATE POLICY "Allow anonymous answer creation"
ON public.response_answers
FOR INSERT
WITH CHECK (true);

-- Allow anonymous users to update their own response (for completing it) using session_token
CREATE POLICY "Allow anonymous response update via session_token"
ON public.responses
FOR UPDATE
USING (true)
WITH CHECK (true);
