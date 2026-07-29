-- 1. Collection ownership immutability
CREATE OR REPLACE FUNCTION public.prevent_collection_profile_id_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.profile_id IS DISTINCT FROM OLD.profile_id THEN
    RAISE EXCEPTION 'collection_profile_id_is_immutable';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_collection_profile_id_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_collections_profile_id_immutable ON public.collections;
CREATE TRIGGER trg_collections_profile_id_immutable
BEFORE UPDATE OF profile_id ON public.collections
FOR EACH ROW EXECUTE FUNCTION public.prevent_collection_profile_id_change();

-- 2. Storage writes restricted to the admin
DROP POLICY IF EXISTS "Authenticated can upload generated images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update generated images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete generated images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload print exports" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update print exports" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete print exports" ON storage.objects;

CREATE POLICY "Admin can upload generated images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'generated-images' AND public.is_current_user_admin());
CREATE POLICY "Admin can update generated images" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'generated-images' AND public.is_current_user_admin())
  WITH CHECK (bucket_id = 'generated-images' AND public.is_current_user_admin());
CREATE POLICY "Admin can delete generated images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'generated-images' AND public.is_current_user_admin());

CREATE POLICY "Admin can upload print exports" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'print-exports' AND public.is_current_user_admin());
CREATE POLICY "Admin can update print exports" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'print-exports' AND public.is_current_user_admin())
  WITH CHECK (bucket_id = 'print-exports' AND public.is_current_user_admin());
CREATE POLICY "Admin can delete print exports" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'print-exports' AND public.is_current_user_admin());

-- 3. Related tables follow the single-admin model
DROP POLICY IF EXISTS "Operator can view collection_images" ON public.collection_images;
DROP POLICY IF EXISTS "Operator can insert collection_images" ON public.collection_images;
DROP POLICY IF EXISTS "Operator can delete collection_images" ON public.collection_images;
CREATE POLICY "Admin can view collection_images" ON public.collection_images FOR SELECT TO authenticated USING (public.is_current_user_admin());
CREATE POLICY "Admin can insert collection_images" ON public.collection_images FOR INSERT TO authenticated WITH CHECK (public.is_current_user_admin());
CREATE POLICY "Admin can delete collection_images" ON public.collection_images FOR DELETE TO authenticated USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "Operator can view images" ON public.generated_images;
DROP POLICY IF EXISTS "Operator can insert images" ON public.generated_images;
DROP POLICY IF EXISTS "Operator can update images" ON public.generated_images;
DROP POLICY IF EXISTS "Operator can delete images" ON public.generated_images;
CREATE POLICY "Admin can view images" ON public.generated_images FOR SELECT TO authenticated USING (public.is_current_user_admin());
CREATE POLICY "Admin can insert images" ON public.generated_images FOR INSERT TO authenticated WITH CHECK (public.is_current_user_admin());
CREATE POLICY "Admin can update images" ON public.generated_images FOR UPDATE TO authenticated USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());
CREATE POLICY "Admin can delete images" ON public.generated_images FOR DELETE TO authenticated USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "Operator can view image assets" ON public.generated_image_assets;
DROP POLICY IF EXISTS "Operator can insert image assets" ON public.generated_image_assets;
DROP POLICY IF EXISTS "Operator can update image assets" ON public.generated_image_assets;
DROP POLICY IF EXISTS "Operator can delete image assets" ON public.generated_image_assets;
CREATE POLICY "Admin can view image assets" ON public.generated_image_assets FOR SELECT TO authenticated USING (public.is_current_user_admin());
CREATE POLICY "Admin can insert image assets" ON public.generated_image_assets FOR INSERT TO authenticated WITH CHECK (public.is_current_user_admin());
CREATE POLICY "Admin can update image assets" ON public.generated_image_assets FOR UPDATE TO authenticated USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());
CREATE POLICY "Admin can delete image assets" ON public.generated_image_assets FOR DELETE TO authenticated USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "Owners can view their jobs" ON public.generation_jobs;
DROP POLICY IF EXISTS "Owners can view their job items" ON public.generation_job_items;
