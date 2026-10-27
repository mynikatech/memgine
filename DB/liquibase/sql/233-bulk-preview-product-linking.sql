-- W233: Atomic bulk resolution of NEW catalog preview rows against existing canonical Products.
-- Uses the W232 validated single-row function. No Products, mappings or snapshots are changed here.
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_bulk_resolve_catalog_sync_preview_rows(
    p_organization_id varchar,
    p_preview_id varchar,
    p_selections jsonb,
    p_actor_user_id varchar
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_preview commerce_catalog_sync_previews%ROWTYPE;
    v_item jsonb;
    v_number integer;
    v_product varchar(64);
    v_version integer;
    v_count integer := 0;
    v_total integer;
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization administration is not permitted' USING ERRCODE='42501';
    END IF;
    IF p_selections IS NULL OR jsonb_typeof(p_selections) <> 'array' THEN
        RAISE EXCEPTION 'Bulk selection must be an array' USING ERRCODE='22023';
    END IF;
    v_total := jsonb_array_length(p_selections);
    IF v_total < 1 OR v_total > 500 THEN
        RAISE EXCEPTION 'Bulk selection must contain 1 to 500 rows' USING ERRCODE='22023';
    END IF;
    SELECT * INTO v_preview FROM commerce_catalog_sync_previews
      WHERE catalog_sync_preview_id=p_preview_id AND organization_id=p_organization_id
      FOR UPDATE;
    IF NOT FOUND OR v_preview.status <> 'READY' OR v_preview.expires_at <= CURRENT_TIMESTAMP THEN
        RAISE EXCEPTION 'Catalog preview is unavailable; regenerate it' USING ERRCODE='40001';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_selections) item
      WHERE jsonb_typeof(item) <> 'object'
         OR (item->>'rowNumber') !~ '^[0-9]+$'
         OR length(coalesce(item->>'productId','')) NOT BETWEEN 1 AND 64
         OR (item->>'expectedVersion') !~ '^[0-9]+$'
    ) THEN
        RAISE EXCEPTION 'Invalid bulk Product selection' USING ERRCODE='22023';
    END IF;
    IF (SELECT count(DISTINCT item->>'rowNumber') FROM jsonb_array_elements(p_selections) item) <> v_total THEN
        RAISE EXCEPTION 'Duplicate preview row in bulk selection' USING ERRCODE='22023';
    END IF;
    -- Every call is in this PostgreSQL function's transaction: any failure rolls back all selections.
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_selections) LOOP
        v_number := (v_item->>'rowNumber')::integer;
        v_product := v_item->>'productId';
        v_version := (v_item->>'expectedVersion')::integer;
        IF NOT EXISTS (
           SELECT 1 FROM commerce_catalog_sync_preview_rows r
           WHERE r.catalog_sync_preview_id=p_preview_id AND r.row_number=v_number
             AND r.proposed_action='NEW' AND r.eligible_for_apply AND r.active
        ) THEN
           RAISE EXCEPTION 'Bulk selection includes a row that is not eligible for linking' USING ERRCODE='40001';
        END IF;
        IF NOT commerce_resolve_catalog_sync_preview_row(
          p_organization_id,p_preview_id,v_number,v_product,v_version,p_actor_user_id
        ) THEN
           RAISE EXCEPTION 'Bulk selection failed' USING ERRCODE='40001';
        END IF;
        v_count := v_count + 1;
    END LOOP;
    RETURN jsonb_build_object('resolvedCount',v_count);
END;
$function$;
REVOKE ALL ON FUNCTION "${schemaName}".commerce_bulk_resolve_catalog_sync_preview_rows(varchar,varchar,jsonb,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_bulk_resolve_catalog_sync_preview_rows(varchar,varchar,jsonb,varchar) TO "${appRole}";
