-- Create form-assets bucket for end screen images and other form assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('form-assets', 'form-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access (forms are public)
CREATE POLICY "Public read form-assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'form-assets');

-- Authenticated users can upload
CREATE POLICY "Authenticated upload form-assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'form-assets' AND auth.role() = 'authenticated');

-- Authenticated users can update their uploads
CREATE POLICY "Authenticated update form-assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'form-assets' AND auth.role() = 'authenticated');

-- Authenticated users can delete their uploads
CREATE POLICY "Authenticated delete form-assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'form-assets' AND auth.role() = 'authenticated');