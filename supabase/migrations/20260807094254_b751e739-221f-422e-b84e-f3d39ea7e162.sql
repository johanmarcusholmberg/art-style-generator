ALTER TABLE public.generation_job_items
  DROP CONSTRAINT IF EXISTS generation_job_items_ratio_enforcement_status_check;

ALTER TABLE public.generation_job_items
  ADD CONSTRAINT generation_job_items_ratio_enforcement_status_check
  CHECK (ratio_enforcement_status = ANY (ARRAY['not_required'::text, 'pending'::text, 'processing'::text, 'completed'::text, 'failed'::text]));