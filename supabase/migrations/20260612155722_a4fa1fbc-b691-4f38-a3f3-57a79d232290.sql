
-- 1) Default new generations into the review queue
ALTER TABLE public.generated_images
  ALTER COLUMN admin_status SET DEFAULT 'needs_review'::asset_admin_status;

-- 2) Keep admin_status, is_rejected, is_archived consistent in both directions.
--    BEFORE UPDATE trigger fires on any write touching either side and reconciles them.
CREATE OR REPLACE FUNCTION public.sync_generated_image_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  status_changed boolean := NEW.admin_status IS DISTINCT FROM OLD.admin_status;
  rejected_changed boolean := NEW.is_rejected IS DISTINCT FROM OLD.is_rejected;
  archived_changed boolean := NEW.is_archived IS DISTINCT FROM OLD.is_archived;
BEGIN
  -- admin_status is the source of truth when it changes.
  IF status_changed THEN
    NEW.is_rejected := (NEW.admin_status = 'rejected');
    NEW.is_archived := (NEW.admin_status = 'archived');
    RETURN NEW;
  END IF;

  -- Otherwise, flag changes propagate to admin_status.
  IF rejected_changed THEN
    IF NEW.is_rejected THEN
      NEW.admin_status := 'rejected';
      NEW.is_archived := false;
    ELSIF NEW.admin_status = 'rejected' THEN
      NEW.admin_status := 'needs_review';
    END IF;
  END IF;

  IF archived_changed THEN
    IF NEW.is_archived THEN
      NEW.admin_status := 'archived';
      NEW.is_rejected := false;
    ELSIF NEW.admin_status = 'archived' THEN
      NEW.admin_status := 'needs_review';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_generated_image_status_trg ON public.generated_images;
CREATE TRIGGER sync_generated_image_status_trg
BEFORE UPDATE ON public.generated_images
FOR EACH ROW
EXECUTE FUNCTION public.sync_generated_image_status();
