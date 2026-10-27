-- W235. Extend partial sync to explicitly selected NEW + MATCHED rows.
-- All unselected preview rows are excluded from the current full Apply.
-- Reuses the CURRENT full apply function so mapping/snapshot identities, optimistic
-- versions, POS metadata, and idempotency remain owned by one implementation.
-- Transactional: no partial row/mapping/product writes survive an error.
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_partial_apply_catalog_sync_preview(
    p_organization_id varchar, p_preview_id varchar, p_idempotency_key varchar,
    p_row_numbers jsonb, p_actor_user_id varchar
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,"${schemaName}"
AS $function$
DECLARE
    v_preview commerce_catalog_sync_previews%ROWTYPE;
    v_count integer;
    v_result jsonb;
    v_prior jsonb;
    v_new_count integer;
BEGIN
    -- Uses the same authorization as the full apply function.
    PERFORM commerce_actor_organization_user(p_organization_id,p_actor_user_id);
    IF NULLIF(btrim(p_idempotency_key),'') IS NULL OR length(p_idempotency_key)>160 THEN
      RAISE EXCEPTION 'A valid idempotency key is required' USING ERRCODE='22023';
    END IF;
    SELECT * INTO v_preview FROM commerce_catalog_sync_previews
     WHERE catalog_sync_preview_id=p_preview_id AND organization_id=p_organization_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Preview not found' USING ERRCODE='23503'; END IF;
    IF v_preview.status='APPLIED' THEN
      IF v_preview.apply_idempotency_key=p_idempotency_key THEN RETURN v_preview.apply_result; END IF;
      RAISE EXCEPTION 'Preview was already applied' USING ERRCODE='23505';
    END IF;
    IF v_preview.status <> 'READY' OR v_preview.expires_at <= CURRENT_TIMESTAMP THEN
      RAISE EXCEPTION 'Preview is not ready or has expired; fetch a fresh preview' USING ERRCODE='40001';
    END IF;
    IF p_row_numbers IS NULL OR jsonb_typeof(p_row_numbers)<>'array' THEN
      RAISE EXCEPTION 'Selected rows must be an array' USING ERRCODE='22023';
    END IF;
    v_count:=jsonb_array_length(p_row_numbers);
    IF v_count<1 OR v_count>500 THEN
      RAISE EXCEPTION 'Select 1-500 rows' USING ERRCODE='22023';
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_row_numbers) e
       WHERE jsonb_typeof(e.value)<>'number' OR (e.value#>>'{}') !~ '^[1-9][0-9]*$'
          OR length(e.value#>>'{}')>9) THEN
      RAISE EXCEPTION 'Invalid selected row number' USING ERRCODE='22023';
    END IF;
    IF (SELECT count(DISTINCT e.value) FROM jsonb_array_elements(p_row_numbers) e)<>v_count THEN
      RAISE EXCEPTION 'Duplicate selected row number' USING ERRCODE='22023';
    END IF;
    -- Require each selected row to be an eligible, active, new external identity.
    -- NEW creates a canonical Product; MATCHED uses the reviewed canonical identity.
    IF (SELECT count(*) FROM commerce_catalog_sync_preview_rows r
        WHERE r.catalog_sync_preview_id=p_preview_id
          AND r.row_number IN (SELECT (e.value#>>'{}')::integer FROM jsonb_array_elements(p_row_numbers) e)
          AND r.proposed_action IN ('NEW','MATCHED') AND r.eligible_for_apply
          AND r.commerce_product_mapping_id IS NULL AND r.active
          AND ((r.proposed_action='NEW' AND r.canonical_product_id IS NULL)
            OR (r.proposed_action='MATCHED' AND r.canonical_product_id IS NOT NULL)))<>v_count THEN
      RAISE EXCEPTION 'Selected rows must be eligible NEW or newly MATCHED Products' USING ERRCODE='40001';
    END IF;
    SELECT count(*) INTO v_new_count FROM commerce_catalog_sync_preview_rows r
      WHERE r.catalog_sync_preview_id=p_preview_id AND r.proposed_action='NEW'
        AND r.row_number IN (SELECT (e.value#>>'{}')::integer FROM jsonb_array_elements(p_row_numbers) e);
    -- Capture *all* original flags before restricting this preview to this batch.
    SELECT COALESCE(jsonb_agg(jsonb_build_object('n',r.row_number,'eligible',r.eligible_for_apply)),'[]'::jsonb)
      INTO v_prior FROM commerce_catalog_sync_preview_rows r WHERE r.catalog_sync_preview_id=p_preview_id;
    -- No unselected NEW, MATCHED, UPDATE, UNCHANGED, or other row may be applied.
    UPDATE commerce_catalog_sync_preview_rows r SET eligible_for_apply=false
      WHERE r.catalog_sync_preview_id=p_preview_id
        AND r.row_number NOT IN (SELECT (e.value#>>'{}')::integer FROM jsonb_array_elements(p_row_numbers) e);
    -- IMPORTANT: current full apply may reject unrelated CONFLICT/INVALID rows.
    -- This deliberately errs closed rather than modifying their action semantics.
    v_result:=commerce_apply_catalog_sync_preview(p_organization_id,p_preview_id,p_idempotency_key,p_actor_user_id);
    IF COALESCE((v_result->>'createdCount')::integer,-1)<>v_new_count
        OR COALESCE((v_result->>'mappedCount')::integer,0)<>v_count THEN
      RAISE EXCEPTION 'Partial synchronization created or mapped an unexpected number of Products; rolled back' USING ERRCODE='40001';
    END IF;
    -- Restore original row eligibility for auditing the applied preview.
    UPDATE commerce_catalog_sync_preview_rows r
       SET eligible_for_apply=(j.value->>'eligible')::boolean
      FROM jsonb_array_elements(v_prior) j
      WHERE r.catalog_sync_preview_id=p_preview_id AND r.row_number=(j.value->>'n')::integer;
    RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION "${schemaName}".commerce_partial_apply_catalog_sync_preview(varchar,varchar,varchar,jsonb,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_partial_apply_catalog_sync_preview(varchar,varchar,varchar,jsonb,varchar) TO "${appRole}";
