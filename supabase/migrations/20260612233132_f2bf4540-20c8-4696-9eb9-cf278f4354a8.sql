
CREATE TABLE public.prompt_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  mode TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  source_image_id UUID REFERENCES public.generated_images(id) ON DELETE SET NULL,
  generation_job_id UUID REFERENCES public.generation_jobs(id) ON DELETE SET NULL,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  usage_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deduplicate same prompt+mode per creator (case-sensitive; trimmed at app layer).
CREATE UNIQUE INDEX prompt_history_profile_prompt_mode_key
  ON public.prompt_history (profile_id, mode, prompt);

CREATE INDEX prompt_history_profile_recent_idx
  ON public.prompt_history (profile_id, last_used_at DESC);

CREATE INDEX prompt_history_profile_mode_idx
  ON public.prompt_history (profile_id, mode);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prompt_history TO authenticated;
GRANT ALL ON public.prompt_history TO service_role;

ALTER TABLE public.prompt_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can read their prompt history"
  ON public.prompt_history FOR SELECT TO authenticated
  USING (profile_id = public.current_profile_id());

CREATE POLICY "Owners can insert their prompt history"
  ON public.prompt_history FOR INSERT TO authenticated
  WITH CHECK (profile_id = public.current_profile_id());

CREATE POLICY "Owners can update their prompt history"
  ON public.prompt_history FOR UPDATE TO authenticated
  USING (profile_id = public.current_profile_id())
  WITH CHECK (profile_id = public.current_profile_id());

CREATE POLICY "Owners can delete their prompt history"
  ON public.prompt_history FOR DELETE TO authenticated
  USING (profile_id = public.current_profile_id());
