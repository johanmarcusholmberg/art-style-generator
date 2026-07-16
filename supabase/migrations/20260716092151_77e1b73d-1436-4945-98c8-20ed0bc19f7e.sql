
ALTER TABLE public._archive_generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._archive_generation_job_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._archive_generation_jobs FROM anon, authenticated;
REVOKE ALL ON public._archive_generation_job_items FROM anon, authenticated;
GRANT ALL ON public._archive_generation_jobs TO service_role;
GRANT ALL ON public._archive_generation_job_items TO service_role;
