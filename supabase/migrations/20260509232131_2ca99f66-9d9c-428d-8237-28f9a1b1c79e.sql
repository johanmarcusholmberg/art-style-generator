
-- 1) asset_folders
CREATE TABLE public.asset_folders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE public.asset_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY asset_folders_select_admin ON public.asset_folders
  FOR SELECT TO authenticated USING (is_current_user_admin());
CREATE POLICY asset_folders_insert_admin ON public.asset_folders
  FOR INSERT TO authenticated WITH CHECK (is_current_user_admin());
CREATE POLICY asset_folders_update_admin ON public.asset_folders
  FOR UPDATE TO authenticated USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());
CREATE POLICY asset_folders_delete_admin ON public.asset_folders
  FOR DELETE TO authenticated USING (is_current_user_admin());

CREATE TRIGGER touch_asset_folders_updated_at
  BEFORE UPDATE ON public.asset_folders
  FOR EACH ROW EXECUTE FUNCTION public.touch_profiles_updated_at();

-- 2) folder reference on generated_images
ALTER TABLE public.generated_images
  ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES public.asset_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_generated_images_folder_id
  ON public.generated_images(folder_id);

-- 3) asset_cost_events
CREATE TABLE public.asset_cost_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  generated_image_id uuid NOT NULL,
  event_type text NOT NULL,
  provider text,
  model text,
  mode text,
  estimated_cost numeric,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'succeeded',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_asset_cost_events_image_id ON public.asset_cost_events(generated_image_id, created_at DESC);

ALTER TABLE public.asset_cost_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY asset_cost_events_select_admin ON public.asset_cost_events
  FOR SELECT TO authenticated USING (is_current_user_admin());
CREATE POLICY asset_cost_events_insert_admin ON public.asset_cost_events
  FOR INSERT TO authenticated WITH CHECK (is_current_user_admin());
CREATE POLICY asset_cost_events_delete_admin ON public.asset_cost_events
  FOR DELETE TO authenticated USING (is_current_user_admin());
