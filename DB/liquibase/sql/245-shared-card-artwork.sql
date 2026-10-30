-- W2-C: Allow optional shared card artwork in existing JSONB decoration configuration.
CREATE OR REPLACE FUNCTION "${schemaName}".branding_v2_validate_decoration(p_decoration jsonb)
RETURNS void LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE v_name text;
BEGIN
 IF p_decoration IS NULL OR p_decoration = 'null'::jsonb THEN RETURN; END IF;
 IF jsonb_typeof(p_decoration) <> 'object' THEN
   RAISE EXCEPTION 'Theme decoration must be an object' USING ERRCODE='22023';
 END IF;
 FOR v_name IN SELECT jsonb_object_keys(p_decoration) LOOP
   IF v_name NOT IN ('style','intensity','cardTreatment','headerTreatment','pattern','borderStyle','cardBackgroundImageUrl') THEN
     RAISE EXCEPTION 'Unsupported theme decoration field %', v_name USING ERRCODE='22023';
   END IF;
   IF v_name = 'cardBackgroundImageUrl' THEN
     IF jsonb_typeof(p_decoration -> v_name) NOT IN ('string','null')
        OR (jsonb_typeof(p_decoration -> v_name) = 'string' AND NULLIF(btrim(p_decoration ->> v_name),'') IS NULL) THEN
       RAISE EXCEPTION 'Card artwork URL must be a nonblank string or JSON null' USING ERRCODE='22023';
     END IF;
   ELSIF jsonb_typeof(p_decoration -> v_name) <> 'string' THEN
     RAISE EXCEPTION 'Theme decoration % must be a string', v_name USING ERRCODE='22023';
   END IF;
 END LOOP;
 IF p_decoration ? 'style' AND p_decoration->>'style' NOT IN ('NONE','CORNERS','PATTERN','CONFETTI','BORDER') THEN
   RAISE EXCEPTION 'Invalid decoration style' USING ERRCODE='22023'; END IF;
 IF p_decoration ? 'intensity' AND p_decoration->>'intensity' NOT IN ('SUBTLE','BALANCED','FESTIVE') THEN
   RAISE EXCEPTION 'Invalid decoration intensity' USING ERRCODE='22023'; END IF;
 IF p_decoration ? 'cardTreatment' AND p_decoration->>'cardTreatment' NOT IN ('SOLID','DECORATIVE','IMAGE_OVERLAY') THEN
   RAISE EXCEPTION 'Invalid decoration card treatment' USING ERRCODE='22023'; END IF;
 IF p_decoration ? 'headerTreatment' AND p_decoration->>'headerTreatment' NOT IN ('SOLID','DECORATIVE','IMAGE') THEN
   RAISE EXCEPTION 'Invalid decoration header treatment' USING ERRCODE='22023'; END IF;
 IF p_decoration ? 'pattern' AND p_decoration->>'pattern' NOT IN ('NONE','DOTS','SPARKLES','DIAMONDS') THEN
   RAISE EXCEPTION 'Invalid decoration pattern' USING ERRCODE='22023'; END IF;
 IF p_decoration ? 'borderStyle' AND p_decoration->>'borderStyle' NOT IN ('NONE','SOLID','ELEGANT') THEN
   RAISE EXCEPTION 'Invalid decoration border style' USING ERRCODE='22023'; END IF;
END;
$function$;
