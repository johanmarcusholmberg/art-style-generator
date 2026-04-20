-- Async upscale job tracking
CREATE TABLE public.upscale_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id uuid REFERENCES public.generated_images(id) ON DELETE CASCADE,
  mode text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  source_url text NOT NULL,
  output_url text,
  replicate_prediction_id text,
  error_message text,
  pipeline jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  started_at timestamp with time zone,
  finished_at timestamp with time zone
);

CREATE INDEX idx_upscale_jobs_image_id ON public.upscale_jobs(image_id);
CREATE INDEX idx_upscale_jobs_status ON public.upscale_jobs(status);
CREATE INDEX idx_upscale_jobs_prediction ON public.upscale_jobs(replicate_prediction_id);

ALTER TABLE public.upscale_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view upscale_jobs"
  ON public.upscale_jobs FOR SELECT USING (true);

CREATE POLICY "Anyone can insert upscale_jobs"
  ON public.upscale_jobs FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update upscale_jobs"
  ON public.upscale_jobs FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can delete upscale_jobs"
  ON public.upscale_jobs FOR DELETE USING (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_upscale_jobs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_upscale_jobs_updated_at
  BEFORE UPDATE ON public.upscale_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_upscale_jobs_updated_at();

-- Add to realtime publication so the frontend can subscribe.
ALTER PUBLICATION supabase_realtime ADD TABLE public.upscale_jobs;
ALTER TABLE public.upscale_jobs REPLICA IDENTITY FULL;