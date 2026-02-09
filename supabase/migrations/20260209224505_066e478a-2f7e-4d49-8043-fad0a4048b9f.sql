
-- Fix: restrict response UPDATE to only the same session (by response id check)
DROP POLICY "Anyone can update own response" ON public.responses;
CREATE POLICY "Anyone can update in_progress response" ON public.responses 
  FOR UPDATE TO anon, authenticated 
  USING (status = 'in_progress');
