
-- Create generation_jobs table
CREATE TABLE public.generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt text NOT NULL,
  mode text NOT NULL DEFAULT 'freestyle',
  batch_size integer NOT NULL DEFAULT 1,
  total_images integer NOT NULL DEFAULT 1,
  completed_images integer NOT NULL DEFAULT 0,
  failed_images integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'queued',
  aspect_ratio text NOT NULL DEFAULT '5:7',
  print_size text,
  hd_enhance boolean NOT NULL DEFAULT true,
  white_frame boolean NOT NULL DEFAULT false,
  background_style text NOT NULL DEFAULT 'white',
  speed_mode text NOT NULL DEFAULT 'quality',
  job_type text NOT NULL DEFAULT 'batch',
  style_grid_styles text[] DEFAULT NULL,
  matrix_variables jsonb DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create generation_job_items table
CREATE TABLE public.generation_job_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.generation_jobs(id) ON DELETE CASCADE,
  prompt_variant text NOT NULL,
  style text,
  seed integer,
  status text NOT NULL DEFAULT 'queued',
  image_url text,
  storage_path text,
  gallery_image_id uuid REFERENCES public.generated_images(id) ON DELETE SET NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS policies for generation_jobs
ALTER TABLE public.generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view generation_jobs" ON public.generation_jobs FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert generation_jobs" ON public.generation_jobs FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update generation_jobs" ON public.generation_jobs FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete generation_jobs" ON public.generation_jobs FOR DELETE TO public USING (true);

-- RLS policies for generation_job_items
ALTER TABLE public.generation_job_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view generation_job_items" ON public.generation_job_items FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert generation_job_items" ON public.generation_job_items FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update generation_job_items" ON public.generation_job_items FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete generation_job_items" ON public.generation_job_items FOR DELETE TO public USING (true);

-- Enable realtime for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.generation_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.generation_job_items;
