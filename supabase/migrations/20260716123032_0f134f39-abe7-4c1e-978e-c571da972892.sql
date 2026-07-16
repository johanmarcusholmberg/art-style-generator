-- SECURITY DEFINER helper — returns the recovery cron secret from Vault.
-- Callable ONLY by service_role (edge functions using SUPABASE_SERVICE_ROLE_KEY).
CREATE OR REPLACE FUNCTION public.get_recovery_job_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets
   WHERE name = 'recovery_job_secret_cron' LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_recovery_job_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_recovery_job_secret() TO service_role;