
CREATE OR REPLACE FUNCTION public.update_generation_job_aggregate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total int; v_completed int; v_failed int; v_status text;
  v_current_status text;
BEGIN
  SELECT status INTO v_current_status FROM public.generation_jobs WHERE id = NEW.job_id;

  -- Never resurrect a cancelled job.
  IF v_current_status = 'cancelled' THEN
    UPDATE public.generation_jobs
    SET completed_images = (
          SELECT count(*) FILTER (WHERE status='completed')
          FROM public.generation_job_items WHERE job_id = NEW.job_id
        ),
        failed_images = (
          SELECT count(*) FILTER (WHERE status='failed')
          FROM public.generation_job_items WHERE job_id = NEW.job_id
        ),
        updated_at = now()
    WHERE id = NEW.job_id;
    RETURN NEW;
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE status='completed'),
         count(*) FILTER (WHERE status='failed')
    INTO v_total, v_completed, v_failed
    FROM public.generation_job_items WHERE job_id = NEW.job_id;

  IF v_completed + v_failed >= v_total THEN
    -- All items terminal: completed if any succeeded, else failed.
    IF v_completed = 0 THEN
      v_status := 'failed';
    ELSE
      v_status := 'completed';
    END IF;
  ELSIF v_completed + v_failed > 0 THEN
    -- Some terminal, some outstanding.
    v_status := 'processing';
  ELSE
    v_status := 'queued';
  END IF;

  UPDATE public.generation_jobs
  SET completed_images = v_completed,
      failed_images = v_failed,
      status = v_status,
      updated_at = now()
  WHERE id = NEW.job_id;

  RETURN NEW;
END;
$function$;
