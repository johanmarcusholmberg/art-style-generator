
-- Create table for storing generated image metadata
CREATE TABLE public.generated_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'japanese',
  aspect_ratio TEXT NOT NULL DEFAULT '5:7',
  print_size TEXT,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS (public read, public insert - no auth required)
ALTER TABLE public.generated_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view images" ON public.generated_images
  FOR SELECT USING (true);

CREATE POLICY "Anyone can insert images" ON public.generated_images
  FOR INSERT WITH CHECK (true);

-- Create storage bucket for generated images
INSERT INTO storage.buckets (id, name, public)
VALUES ('generated-images', 'generated-images', true);

-- Allow public read access to the bucket
CREATE POLICY "Public read access" ON storage.objects
  FOR SELECT USING (bucket_id = 'generated-images');

-- Allow public uploads to the bucket
CREATE POLICY "Public upload access" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'generated-images');
