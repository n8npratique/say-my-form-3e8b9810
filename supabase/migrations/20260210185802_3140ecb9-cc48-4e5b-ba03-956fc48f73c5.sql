
-- Create storage bucket for form background images and welcome screen images
INSERT INTO storage.buckets (id, name, public) VALUES ('form-assets', 'form-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to view form assets (public bucket)
CREATE POLICY "Form assets are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'form-assets');

-- Allow authenticated users to upload form assets
CREATE POLICY "Authenticated users can upload form assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'form-assets' AND auth.role() = 'authenticated');

-- Allow authenticated users to delete their uploads
CREATE POLICY "Authenticated users can delete form assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'form-assets' AND auth.role() = 'authenticated');
