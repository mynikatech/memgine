ALTER TABLE "${schemaName}"."user" ADD COLUMN IF NOT EXISTS otp_delivery_mode varchar(10) NOT NULL DEFAULT 'DEFAULT';
DO $block$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_user_otp_delivery_mode') THEN
    ALTER TABLE "${schemaName}"."user" ADD CONSTRAINT ck_user_otp_delivery_mode CHECK (otp_delivery_mode IN ('DEFAULT', 'MOCK', 'LIVE'));
  END IF;
END $block$;
CREATE OR REPLACE FUNCTION "${schemaName}".otp_user_delivery_mode(p_user_id varchar) RETURNS varchar LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $function$
  SELECT COALESCE((SELECT otp_delivery_mode FROM "${schemaName}"."user" WHERE user_id = p_user_id AND NOT is_deleted), 'DEFAULT');
$function$;
CREATE OR REPLACE FUNCTION "${schemaName}".organization_access_set_otp_delivery_mode(p_organization_id varchar, p_organization_user_id varchar, p_mode varchar, p_actor_user_id varchar) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
DECLARE v_user_id varchar;
BEGIN
  IF NOT "${schemaName}".rbac_has_capability(p_actor_user_id, p_organization_id, 'ORG_ADMIN_ACCESS') THEN RAISE EXCEPTION 'Organization access administration is not permitted' USING ERRCODE = '42501'; END IF;
  IF p_mode NOT IN ('DEFAULT', 'MOCK', 'LIVE') THEN RAISE EXCEPTION 'Invalid OTP delivery mode' USING ERRCODE = '22023'; END IF;
  SELECT user_id INTO v_user_id FROM "${schemaName}".organization_user WHERE organization_user_id = p_organization_user_id AND organization_id = p_organization_id AND NOT is_deleted;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Organization user not found' USING ERRCODE = 'P0002'; END IF;
  UPDATE "${schemaName}"."user" SET otp_delivery_mode = p_mode, updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id, version_no = version_no + 1 WHERE user_id = v_user_id AND NOT is_deleted;
  RETURN TRUE;
END $function$;
REVOKE ALL ON FUNCTION "${schemaName}".otp_user_delivery_mode(varchar),
  "${schemaName}".organization_access_set_otp_delivery_mode(varchar, varchar, varchar, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".otp_user_delivery_mode(varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".organization_access_set_otp_delivery_mode(varchar, varchar, varchar, varchar) TO "${appRole}";
