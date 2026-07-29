-- Security hardening integration checks — Turn 2c.3 (sub-turns D + closure)
--
-- Usage (psql, superuser/service connection):
--   psql -v admin_auth_uid="'<auth.users id of the admin>'" \
--        -f supabase/tests/security-hardening-2c3d.sql
--
-- Every assertion raises an exception on an unexpected result, so a failing
-- check aborts the script visibly instead of being silently documented.
-- All writes happen inside a transaction that is rolled back at the end.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------
-- A. Structural checks
-- ---------------------------------------------------------------------
DO $$
DECLARE v_bool boolean; v_int int;
BEGIN
  -- collections.profile_id is NOT NULL
  SELECT attnotnull INTO v_bool FROM pg_attribute
   WHERE attrelid = 'public.collections'::regclass AND attname = 'profile_id';
  IF NOT coalesce(v_bool, false) THEN
    RAISE EXCEPTION 'FAIL: collections.profile_id is nullable';
  END IF;

  -- ownership immutability trigger exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.collections'::regclass
       AND tgname = 'trg_collections_profile_id_immutable'
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'FAIL: ownership immutability trigger missing';
  END IF;

  -- exactly 4 collections policies, all scoped to authenticated only
  SELECT count(*) INTO v_int FROM pg_policy WHERE polrelid = 'public.collections'::regclass;
  IF v_int <> 4 THEN RAISE EXCEPTION 'FAIL: expected 4 collections policies, got %', v_int; END IF;

  SELECT count(*) INTO v_int FROM pg_policy
   WHERE polrelid = 'public.collections'::regclass
     AND polroles::regrole[] <> ARRAY['authenticated'::regrole];
  IF v_int <> 0 THEN RAISE EXCEPTION 'FAIL: % collections policies not scoped to authenticated', v_int; END IF;

  -- anon holds no table privileges on collections
  IF has_table_privilege('anon','public.collections','SELECT')
     OR has_table_privilege('anon','public.collections','INSERT')
     OR has_table_privilege('anon','public.collections','UPDATE')
     OR has_table_privilege('anon','public.collections','DELETE') THEN
    RAISE EXCEPTION 'FAIL: anon has privileges on public.collections';
  END IF;

  -- anon cannot execute Turn 2 RPCs
  IF has_function_privilege('anon','public.create_matching_collection_regeneration(uuid)','EXECUTE')
     OR has_function_privilege('anon','public.claim_generation_ratio_finalization(uuid,integer)','EXECUTE')
     OR has_function_privilege('anon','public.retry_generation_ratio_finalization(uuid)','EXECUTE')
     OR has_function_privilege('anon','public.report_current_generation_safety_state(integer)','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: anon can execute a protected Turn 2 RPC';
  END IF;

  -- authenticated CAN execute them
  IF NOT (has_function_privilege('authenticated','public.create_matching_collection_regeneration(uuid)','EXECUTE')
     AND has_function_privilege('authenticated','public.claim_generation_ratio_finalization(uuid,integer)','EXECUTE')
     AND has_function_privilege('authenticated','public.report_current_generation_safety_state(integer)','EXECUTE')) THEN
    RAISE EXCEPTION 'FAIL: authenticated lost execute on a Turn 2 RPC';
  END IF;

  -- audit RPC is stable + security definer
  SELECT (provolatile = 's' AND prosecdef) INTO v_bool FROM pg_proc
   WHERE proname = 'report_current_generation_safety_state';
  IF NOT coalesce(v_bool,false) THEN
    RAISE EXCEPTION 'FAIL: safety audit RPC is not STABLE SECURITY DEFINER';
  END IF;

  -- every storage write policy is authenticated-only and admin-gated
  SELECT count(*) INTO v_int FROM pg_policy
   WHERE polrelid = 'storage.objects'::regclass
     AND polcmd <> 'r'
     AND (polroles::regrole[] <> ARRAY['authenticated'::regrole]
          OR coalesce(pg_get_expr(polqual, polrelid),'') || coalesce(pg_get_expr(polwithcheck, polrelid),'')
             NOT LIKE '%is_current_user_admin()%');
  IF v_int <> 0 THEN RAISE EXCEPTION 'FAIL: % storage write policies are not admin-gated', v_int; END IF;

  -- related tables: no policy grants access to a non-admin authenticated user
  SELECT count(*) INTO v_int FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relname IN ('collection_images','generated_images','generated_image_assets')
     AND coalesce(pg_get_expr(p.polqual, p.polrelid),'') || coalesce(pg_get_expr(p.polwithcheck, p.polrelid),'')
         NOT LIKE '%is_current_user_admin()%';
  IF v_int <> 0 THEN RAISE EXCEPTION 'FAIL: % related-table policies are not admin-gated', v_int; END IF;

  RAISE NOTICE 'PASS: section A structural checks';
END $$;

-- ---------------------------------------------------------------------
-- Precondition: sections B and C need a connection that may assume the
-- anon / authenticated roles. A restricted connection fails loudly here
-- instead of silently "passing".
-- Equivalent live coverage for the anonymous cases (REST + Storage over
-- HTTP with the publishable key) lives in supabase/tests/anon-access-check.sh.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT (pg_has_role(current_user, 'anon', 'MEMBER')
          AND pg_has_role(current_user, 'authenticated', 'MEMBER')) THEN
    RAISE EXCEPTION
      'FAIL: connection role % cannot assume anon/authenticated; run sections B and C on a privileged (postgres/service) connection',
      current_user;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- B. Anonymous role checks — every statement must be denied
-- ---------------------------------------------------------------------
DO $$
DECLARE v_ok boolean;
BEGIN
  SET LOCAL ROLE anon;


  BEGIN PERFORM 1 FROM public.collections; RAISE EXCEPTION 'FAIL: anon can select collections';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  BEGIN
    EXECUTE $q$INSERT INTO public.collections (name, profile_id) VALUES ('anon', NULL)$q$;
    RAISE EXCEPTION 'FAIL: anon can insert collections';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  BEGIN
    EXECUTE $q$UPDATE public.collections SET name = 'x'$q$;
    RAISE EXCEPTION 'FAIL: anon can update collections';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  BEGIN
    EXECUTE $q$DELETE FROM public.collections$q$;
    RAISE EXCEPTION 'FAIL: anon can delete collections';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  BEGIN
    PERFORM public.report_current_generation_safety_state(1);
    RAISE EXCEPTION 'FAIL: anon can run the safety audit';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  BEGIN
    PERFORM public.create_matching_collection_regeneration('00000000-0000-0000-0000-000000000000');
    RAISE EXCEPTION 'FAIL: anon can call the regeneration RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  RESET ROLE;
  RAISE NOTICE 'PASS: section B anonymous denial checks';
END $$;

-- ---------------------------------------------------------------------
-- C. Authenticated admin checks (rolled back)
-- ---------------------------------------------------------------------
BEGIN;
SELECT set_config('request.jwt.claims',
                  json_build_object('sub', :admin_auth_uid, 'role', 'authenticated')::text,
                  true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_profile uuid; v_id uuid; v_visible int; v_owner uuid; v_name text; v_audit int;
BEGIN
  IF NOT public.is_current_user_admin() THEN RAISE EXCEPTION 'FAIL: caller is not admin'; END IF;
  v_profile := public.current_profile_id();
  IF v_profile IS NULL THEN RAISE EXCEPTION 'FAIL: current_profile_id() is null'; END IF;

  SELECT count(*) INTO v_visible FROM public.collections;
  RAISE NOTICE 'INFO: admin sees % collections', v_visible;

  -- insert with own profile succeeds
  INSERT INTO public.collections (name, profile_id) VALUES ('sec-test', v_profile)
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'FAIL: admin insert did not return an id'; END IF;

  -- insert with NULL profile fails
  BEGIN
    INSERT INTO public.collections (name, profile_id) VALUES ('sec-null', NULL);
    RAISE EXCEPTION 'FAIL: null-owner insert succeeded';
  EXCEPTION WHEN not_null_violation OR check_violation THEN NULL; END;

  -- insert with a foreign profile fails
  BEGIN
    INSERT INTO public.collections (name, profile_id)
    VALUES ('sec-other', '00000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'FAIL: foreign-owner insert succeeded';
  EXCEPTION WHEN check_violation OR foreign_key_violation OR insufficient_privilege THEN NULL; END;

  -- ownership change to NULL fails
  BEGIN
    UPDATE public.collections SET profile_id = NULL WHERE id = v_id;
    RAISE EXCEPTION 'FAIL: ownership could be set to null';
  EXCEPTION WHEN not_null_violation OR check_violation OR raise_exception THEN NULL; END;

  -- ownership change to another profile fails via the immutability trigger
  BEGIN
    UPDATE public.collections SET profile_id = '00000000-0000-0000-0000-000000000001' WHERE id = v_id;
    RAISE EXCEPTION 'FAIL: ownership could be transferred';
  EXCEPTION WHEN raise_exception OR check_violation OR foreign_key_violation THEN NULL; END;

  -- ordinary update preserves the owner
  UPDATE public.collections SET name = 'sec-test-renamed' WHERE id = v_id
  RETURNING profile_id, name INTO v_owner, v_name;
  IF v_owner IS DISTINCT FROM v_profile OR v_name <> 'sec-test-renamed' THEN
    RAISE EXCEPTION 'FAIL: ordinary update did not preserve owner/name';
  END IF;

  -- admin delete succeeds
  DELETE FROM public.collections WHERE id = v_id;
  IF EXISTS (SELECT 1 FROM public.collections WHERE id = v_id) THEN
    RAISE EXCEPTION 'FAIL: admin delete did not remove the row';
  END IF;

  -- read-only audit runs for the admin
  SELECT count(*) INTO v_audit FROM public.report_current_generation_safety_state(100);
  RAISE NOTICE 'INFO: safety audit returned % rows', v_audit;

  RAISE NOTICE 'PASS: section C authenticated admin checks';
END $$;

ROLLBACK;

-- ---------------------------------------------------------------------
-- D. Post-rollback cleanliness
-- ---------------------------------------------------------------------
DO $$
DECLARE v_int int;
BEGIN
  SELECT count(*) INTO v_int FROM public.collections WHERE name LIKE 'sec-test%' OR name LIKE 'sec-null%' OR name LIKE 'sec-other%';
  IF v_int <> 0 THEN RAISE EXCEPTION 'FAIL: % test collections leaked', v_int; END IF;
  SELECT count(*) INTO v_int FROM public.collections WHERE profile_id IS NULL;
  IF v_int <> 0 THEN RAISE EXCEPTION 'FAIL: % ownerless collections exist', v_int; END IF;
  RAISE NOTICE 'PASS: section D cleanliness checks';
END $$;
