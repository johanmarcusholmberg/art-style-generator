-- Security hardening integration checks — Turn 2c.3 sub-turn D
--
-- Usage (psql, superuser/service connection):
--   psql -v admin_auth_uid="'<auth.users id of the admin>'" -f supabase/tests/security-hardening-2c3d.sql
--
-- Every statement is read-only or wrapped in a transaction that is rolled
-- back at the end, so running this script changes no persistent data.
-- Rollback: the final ROLLBACK undoes all writes performed in section C.

\set ON_ERROR_STOP off

-- ---------------------------------------------------------------------
-- A. Structural checks
-- ---------------------------------------------------------------------
-- Expect: t
SELECT attnotnull AS collections_profile_id_not_null
  FROM pg_attribute
 WHERE attrelid = 'public.collections'::regclass AND attname = 'profile_id';

-- Expect: exactly 4 policies, all scoped to {authenticated}, none mentioning
-- "profile_id IS NULL" in a permissive branch.
SELECT polname, polcmd, polroles::regrole[],
       pg_get_expr(polqual, polrelid)      AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS check_expr
  FROM pg_policy WHERE polrelid = 'public.collections'::regclass ORDER BY polcmd;

-- Expect: all f
SELECT has_table_privilege('anon','public.collections','SELECT') AS anon_select,
       has_table_privilege('anon','public.collections','INSERT') AS anon_insert,
       has_table_privilege('anon','public.collections','UPDATE') AS anon_update,
       has_table_privilege('anon','public.collections','DELETE') AS anon_delete;

-- Expect: all f (anonymous RPC execution revoked)
SELECT has_function_privilege('anon','public.create_matching_collection_regeneration(uuid)','EXECUTE')          AS anon_regen,
       has_function_privilege('anon','public.claim_generation_ratio_finalization(uuid,integer)','EXECUTE')      AS anon_claim,
       has_function_privilege('anon','public.retry_generation_ratio_finalization(uuid)','EXECUTE')              AS anon_retry,
       has_function_privilege('anon','public.report_current_generation_safety_state(integer)','EXECUTE')        AS anon_audit;

-- Expect: report_current_generation_safety_state is STABLE + SECURITY DEFINER
-- with an explicit search_path, and contains no write statements.
SELECT provolatile = 's' AS is_stable, prosecdef AS is_definer, proconfig
  FROM pg_proc WHERE proname = 'report_current_generation_safety_state';

-- Storage: public read only; every write policy scoped to {authenticated}
SELECT polname, polcmd, polroles::regrole[]
  FROM pg_policy WHERE polrelid = 'storage.objects'::regclass ORDER BY polcmd, polname;

-- ---------------------------------------------------------------------
-- B. Anonymous role checks (all statements below must FAIL / return 0 rows)
-- ---------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE anon;
SELECT count(*) AS anon_visible_collections FROM public.collections;                       -- expect: permission denied
INSERT INTO public.collections (name, profile_id) VALUES ('anon', NULL);                   -- expect: permission denied
UPDATE public.collections SET name = 'x';                                                  -- expect: permission denied
DELETE FROM public.collections;                                                            -- expect: permission denied
SELECT public.report_current_generation_safety_state(1);                                   -- expect: permission denied
SELECT public.create_matching_collection_regeneration('00000000-0000-0000-0000-000000000000'); -- expect: permission denied
ROLLBACK;

-- ---------------------------------------------------------------------
-- C. Authenticated admin checks (rolled back)
-- ---------------------------------------------------------------------
BEGIN;
SELECT set_config('request.jwt.claims',
                  json_build_object('sub', :admin_auth_uid, 'role', 'authenticated')::text,
                  true);
SET LOCAL ROLE authenticated;

SELECT public.is_current_user_admin() AS is_admin;                    -- expect: t
SELECT public.current_profile_id()   AS profile_id;                   -- expect: non-null

-- Admin sees every collection (no profile filtering)
SELECT count(*) AS visible FROM public.collections;

-- Insert with the current profile succeeds
INSERT INTO public.collections (name, profile_id)
VALUES ('sec-test', public.current_profile_id()) RETURNING id, profile_id;

-- Insert with NULL profile fails (NOT NULL + WITH CHECK)
INSERT INTO public.collections (name, profile_id) VALUES ('sec-null', NULL);

-- Insert with another profile fails (WITH CHECK)
INSERT INTO public.collections (name, profile_id)
VALUES ('sec-other', '00000000-0000-0000-0000-000000000001');

-- Updating profile_id to NULL fails
UPDATE public.collections SET profile_id = NULL WHERE name = 'sec-test';

-- Ordinary update preserves the existing non-null owner
UPDATE public.collections SET name = 'sec-test-renamed' WHERE name = 'sec-test'
RETURNING id, name, profile_id;

-- Admin can delete
DELETE FROM public.collections WHERE name = 'sec-test-renamed' RETURNING id;

-- Read-only audit runs for the admin
SELECT category, count(*) FROM public.report_current_generation_safety_state(100) GROUP BY 1;

ROLLBACK;
