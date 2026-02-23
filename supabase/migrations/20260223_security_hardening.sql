-- ============================================================
-- Security Hardening Migration — 2026-02-23
-- Fixes: column-level access, RLS WITH CHECK, storage delete
-- ============================================================

-- 1A. Google Private Keys — Restrict column access
-- Only service_role (edge functions) can read encrypted_key.
-- Frontend authenticated users can still SELECT other columns.
REVOKE SELECT (encrypted_key) ON public.google_service_accounts FROM authenticated;

-- 1B. Responses UPDATE — Validate status stays in_progress
-- Old policy had WITH CHECK (true), allowing status to be set to anything.
DROP POLICY IF EXISTS "Anyone can update own response" ON public.responses;
DROP POLICY IF EXISTS "Anyone can update in_progress response" ON public.responses;
DROP POLICY IF EXISTS "Owner can update in_progress response" ON public.responses;
CREATE POLICY "Owner can update in_progress response"
ON public.responses FOR UPDATE TO anon, authenticated
USING (status = 'in_progress')
WITH CHECK (status = 'in_progress');

-- 1C. Response Answers — Restrict INSERT to in_progress responses only
-- Old policy had WITH CHECK (true), allowing answers for any response.
DROP POLICY IF EXISTS "Anyone can create answer" ON public.response_answers;
CREATE POLICY "Anyone can create answer"
ON public.response_answers FOR INSERT TO anon, authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.responses WHERE id = response_id AND status = 'in_progress')
);
-- Note: No UPDATE/DELETE policies = denied by default (RLS enabled).

-- 1D. Responses INSERT — Only allow for published forms
-- Old policy had WITH CHECK (true), allowing responses for any form.
DROP POLICY IF EXISTS "Anyone can create response" ON public.responses;
CREATE POLICY "Anyone can create response"
ON public.responses FOR INSERT TO anon, authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.forms WHERE id = form_id AND status = 'published')
);

-- 1E. Storage — Restrict delete to file owner only
-- Old policy allowed any authenticated user to delete any file.
DROP POLICY IF EXISTS "Authenticated delete form-assets" ON storage.objects;
CREATE POLICY "Owner can delete own form-assets"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'form-assets' AND (select auth.uid()) = owner);
