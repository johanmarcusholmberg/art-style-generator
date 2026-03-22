
-- Bucket for high-res print exports (separate from preview thumbnails)
INSERT INTO storage.buckets (id, name, public)
VALUES ('print-exports', 'print-exports', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read
CREATE POLICY "Anyone can view print exports"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'print-exports');

-- Allow public insert
CREATE POLICY "Anyone can upload print exports"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'print-exports');

-- Allow public delete
CREATE POLICY "Anyone can delete print exports"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'print-exports');

-- Add export storage path to generated_images
ALTER TABLE public.generated_images
  ADD COLUMN IF NOT EXISTS export_storage_path text;
