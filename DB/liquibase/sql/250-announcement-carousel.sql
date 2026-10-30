-- Stage 2B: one announcement configuration in the existing branding draft/release model.
ALTER TABLE "${schemaName}".organization_branding
    ADD COLUMN announcement_configuration jsonb NOT NULL
        DEFAULT '{"displayMode":"SINGLE","rotationIntervalSeconds":5,"items":[]}'::jsonb;

-- Preserve the previously configured single message, including disabled drafts.
UPDATE "${schemaName}".organization_branding b
SET announcement_configuration = jsonb_build_object(
    'displayMode', 'SINGLE',
    'rotationIntervalSeconds', 5,
    'items', CASE WHEN b.announcement_message IS NOT NULL OR b.announcement_enabled THEN
        jsonb_build_array(jsonb_build_object(
            'id', 'legacy-' || b.organization_branding_id,
            'enabled', b.announcement_enabled,
            'message', COALESCE(b.announcement_message, ''),
            'style', b.announcement_style,
            'backgroundColor', b.announcement_background_color,
            'textColor', b.announcement_text_color,
            'linkUrl', b.announcement_link_url,
            'startsAt', b.announcement_starts_at,
            'endsAt', b.announcement_ends_at,
            'displayOrder', 0
        )) ELSE '[]'::jsonb END
);

CREATE FUNCTION "${schemaName}".branding_validate_announcement_configuration(p_config jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_item jsonb;
    v_id text;
    v_start timestamptz;
    v_end timestamptz;
    v_ids text[] := ARRAY[]::text[];
    v_color text;
    v_timestamp text;
BEGIN
    IF p_config IS NULL OR jsonb_typeof(p_config) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'Announcement configuration must be an object' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_config -> 'displayMode') IS DISTINCT FROM 'string'
       OR p_config ->> 'displayMode' IS NULL
       OR p_config ->> 'displayMode' NOT IN ('SINGLE', 'CAROUSEL')
       OR jsonb_typeof(p_config -> 'rotationIntervalSeconds') IS DISTINCT FROM 'number'
       OR (p_config ->> 'rotationIntervalSeconds') !~ '^[0-9]{1,2}$'
       OR jsonb_typeof(p_config -> 'items') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Invalid announcement configuration structure' USING ERRCODE = '22023';
    END IF;
    IF (p_config ->> 'rotationIntervalSeconds')::integer NOT BETWEEN 3 AND 60 THEN
        RAISE EXCEPTION 'Announcement rotation interval must be 3 to 60 seconds' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(p_config -> 'items') > 20 THEN
        RAISE EXCEPTION 'Announcement configuration supports at most 20 items' USING ERRCODE = '22023';
    END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_config -> 'items') LOOP
        IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
            RAISE EXCEPTION 'Announcement item must be an object' USING ERRCODE = '22023';
        END IF;
        IF jsonb_typeof(v_item -> 'id') IS DISTINCT FROM 'string'
           OR NULLIF(btrim(v_item ->> 'id'), '') IS NULL
           OR jsonb_typeof(v_item -> 'enabled') IS DISTINCT FROM 'boolean'
           OR jsonb_typeof(v_item -> 'message') IS DISTINCT FROM 'string'
           OR jsonb_typeof(v_item -> 'style') IS DISTINCT FROM 'string'
           OR v_item ->> 'style' NOT IN ('STATIC','FADE','SLIDE','TICKER','TYPEWRITER','REVEAL','PULSE')
           OR jsonb_typeof(v_item -> 'displayOrder') IS DISTINCT FROM 'number'
           OR (v_item ->> 'displayOrder') !~ '^[0-9]{1,2}$' THEN
            RAISE EXCEPTION 'Invalid announcement item' USING ERRCODE = '22023';
        END IF;
        IF (v_item ->> 'displayOrder')::integer NOT BETWEEN 0 AND 19 THEN
            RAISE EXCEPTION 'Announcement display order is invalid' USING ERRCODE = '22023';
        END IF;
        v_id := btrim(v_item ->> 'id');
        IF v_id = ANY(v_ids) THEN
            RAISE EXCEPTION 'Duplicate announcement item ID' USING ERRCODE = '22023';
        END IF;
        v_ids := array_append(v_ids, v_id);
        IF (v_item ->> 'enabled')::boolean AND NULLIF(btrim(v_item ->> 'message'), '') IS NULL THEN
            RAISE EXCEPTION 'Enabled announcement requires a message' USING ERRCODE = '22023';
        END IF;
        FOREACH v_color IN ARRAY ARRAY[v_item ->> 'backgroundColor', v_item ->> 'textColor'] LOOP
            IF v_color IS NOT NULL AND v_color !~ '^#[0-9A-Fa-f]{6}$' THEN
                RAISE EXCEPTION 'Announcement colours must use #RRGGBB' USING ERRCODE = '22023';
            END IF;
        END LOOP;
        IF v_item ? 'linkUrl' AND jsonb_typeof(v_item -> 'linkUrl') <> 'null'
           AND (jsonb_typeof(v_item -> 'linkUrl') <> 'string'
                OR v_item ->> 'linkUrl' !~ '^https://[^[:space:]]+$') THEN
            RAISE EXCEPTION 'Announcement link must use HTTPS' USING ERRCODE = '22023';
        END IF;
        v_start := NULL;
        v_end := NULL;
        FOREACH v_timestamp IN ARRAY ARRAY['startsAt','endsAt'] LOOP
            IF v_item ? v_timestamp AND jsonb_typeof(v_item -> v_timestamp) <> 'null' THEN
                IF jsonb_typeof(v_item -> v_timestamp) <> 'string'
                   OR NULLIF(btrim(v_item ->> v_timestamp), '') IS NULL THEN
                    RAISE EXCEPTION 'Announcement timestamp is invalid' USING ERRCODE = '22023';
                END IF;
                BEGIN
                    IF v_timestamp = 'startsAt' THEN
                        v_start := (v_item ->> v_timestamp)::timestamptz;
                    ELSE
                        v_end := (v_item ->> v_timestamp)::timestamptz;
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                    RAISE EXCEPTION 'Announcement timestamp is invalid' USING ERRCODE = '22023';
                END;
            END IF;
        END LOOP;
        IF v_start IS NOT NULL AND v_end IS NOT NULL AND v_end <= v_start THEN
            RAISE EXCEPTION 'Announcement end must follow start' USING ERRCODE = '22023';
        END IF;
    END LOOP;
    RETURN true;
END;
$function$;

ALTER TABLE "${schemaName}".organization_branding
    ADD CONSTRAINT ck_organization_branding_announcement_configuration
    CHECK ("${schemaName}".branding_validate_announcement_configuration(announcement_configuration));

CREATE OR REPLACE FUNCTION "${schemaName}".branding_v2_validate_complete_branding(
    p_branding jsonb
)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_start timestamptz;
    v_end timestamptz;
    v_value text;
    v_theme jsonb;
BEGIN
    IF p_branding IS NULL OR jsonb_typeof(p_branding) <> 'object' THEN
        RAISE EXCEPTION 'Branding must be an object' USING ERRCODE = '22023';
    END IF;

    v_theme := jsonb_build_object(
        'primaryColor', p_branding -> 'primaryColor',
        'secondaryColor', p_branding -> 'secondaryColor',
        'accentColor', p_branding -> 'accentColor',
        'backgroundColor', p_branding -> 'backgroundColor',
        'textColor', p_branding -> 'textColor'
    );

    IF p_branding ? 'backgroundImageUrl' THEN
        v_theme := v_theme || jsonb_build_object(
            'backgroundImageUrl', p_branding -> 'backgroundImageUrl'
        );
    END IF;

    PERFORM branding_v2_validate_theme(v_theme);

    IF NOT (p_branding ? 'announcementEnabled')
       OR jsonb_typeof(p_branding -> 'announcementEnabled') <> 'boolean' THEN
        RAISE EXCEPTION 'Branding requires a boolean announcementEnabled value'
            USING ERRCODE = '22023';
    END IF;

    IF NOT (p_branding ? 'announcementStyle')
       OR jsonb_typeof(p_branding -> 'announcementStyle') <> 'string'
       OR upper(btrim(p_branding ->> 'announcementStyle'))
          NOT IN ('STATIC', 'FADE', 'SLIDE', 'TICKER', 'TYPEWRITER', 'REVEAL', 'PULSE') THEN
        RAISE EXCEPTION 'Branding announcementStyle is invalid'
            USING ERRCODE = '22023';
    END IF;

    IF COALESCE((p_branding ->> 'announcementEnabled')::boolean, false)
       AND (
           jsonb_typeof(p_branding -> 'announcementMessage') <> 'string'
           OR NULLIF(btrim(p_branding ->> 'announcementMessage'), '') IS NULL
       ) THEN
        RAISE EXCEPTION 'An enabled announcement requires a nonblank message'
            USING ERRCODE = '22023';
    END IF;

    FOREACH v_value IN ARRAY ARRAY[
        CASE WHEN p_branding ? 'announcementBackgroundColor'
            THEN p_branding ->> 'announcementBackgroundColor' END,
        CASE WHEN p_branding ? 'announcementTextColor'
            THEN p_branding ->> 'announcementTextColor' END
    ] LOOP
        IF v_value IS NOT NULL AND btrim(v_value) = '' THEN
            RAISE EXCEPTION 'Announcement colour overrides cannot be blank'
                USING ERRCODE = '22023';
        END IF;
        IF v_value IS NOT NULL AND btrim(v_value) !~ '^#[0-9A-Fa-f]{6}$' THEN
            RAISE EXCEPTION 'Announcement colour overrides must use #RRGGBB'
                USING ERRCODE = '22023';
        END IF;
    END LOOP;

    IF p_branding ? 'backgroundImageUrl'
       AND jsonb_typeof(p_branding -> 'backgroundImageUrl') <> 'null' THEN
        IF jsonb_typeof(p_branding -> 'backgroundImageUrl') <> 'string'
           OR NULLIF(btrim(p_branding ->> 'backgroundImageUrl'), '') IS NULL THEN
            RAISE EXCEPTION 'backgroundImageUrl must be a nonblank string when supplied'
                USING ERRCODE = '22023';
        END IF;
    END IF;

    IF p_branding ? 'announcementLinkUrl'
       AND jsonb_typeof(p_branding -> 'announcementLinkUrl') <> 'null' THEN
        IF jsonb_typeof(p_branding -> 'announcementLinkUrl') <> 'string'
           OR btrim(p_branding ->> 'announcementLinkUrl') !~ '^https://[^[:space:]]+$' THEN
            RAISE EXCEPTION 'Announcement link must use HTTPS'
                USING ERRCODE = '22023';
        END IF;
    END IF;

    IF p_branding ? 'announcementStartsAt'
       AND jsonb_typeof(p_branding -> 'announcementStartsAt') <> 'null' THEN
        IF jsonb_typeof(p_branding -> 'announcementStartsAt') <> 'string'
           OR NULLIF(btrim(p_branding ->> 'announcementStartsAt'), '') IS NULL THEN
            RAISE EXCEPTION 'announcementStartsAt must be a nonblank timestamptz when supplied'
                USING ERRCODE = '22023';
        END IF;
        BEGIN
            v_start := (p_branding ->> 'announcementStartsAt')::timestamptz;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'announcementStartsAt is invalid' USING ERRCODE = '22023';
        END;
    END IF;

    IF p_branding ? 'announcementEndsAt'
       AND jsonb_typeof(p_branding -> 'announcementEndsAt') <> 'null' THEN
        IF jsonb_typeof(p_branding -> 'announcementEndsAt') <> 'string'
           OR NULLIF(btrim(p_branding ->> 'announcementEndsAt'), '') IS NULL THEN
            RAISE EXCEPTION 'announcementEndsAt must be a nonblank timestamptz when supplied'
                USING ERRCODE = '22023';
        END IF;
        BEGIN
            v_end := (p_branding ->> 'announcementEndsAt')::timestamptz;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'announcementEndsAt is invalid' USING ERRCODE = '22023';
        END;
    END IF;

    IF v_start IS NOT NULL AND v_end IS NOT NULL AND v_end <= v_start THEN
        RAISE EXCEPTION 'Announcement end must be after announcement start'
            USING ERRCODE = '22023';
    END IF;
    IF p_branding ? 'announcementConfiguration' THEN
        PERFORM branding_validate_announcement_configuration(p_branding -> 'announcementConfiguration');
    END IF;
END;
$function$;


CREATE OR REPLACE FUNCTION "${schemaName}".save_organization_branding_draft(
    p_organization_id varchar, p_branding jsonb, p_actor_user_id varchar
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE v_version integer; v_theme_code varchar(64); v_decoration jsonb;
BEGIN
 IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
  RAISE EXCEPTION 'Organization administration is not permitted' USING ERRCODE = '42501';
 END IF;
 IF p_branding IS NULL OR (p_branding ->> 'organizationId') IS DISTINCT FROM p_organization_id THEN
  RAISE EXCEPTION 'Organization branding organizationId does not match organization_id' USING ERRCODE = '22023';
 END IF;
 PERFORM branding_v2_validate_complete_branding(p_branding);
 v_version := NULLIF(p_branding ->> 'versionNo','')::integer;
 IF v_version IS NULL OR v_version < 1 THEN
  RAISE EXCEPTION 'Organization branding version is required' USING ERRCODE='22023';
 END IF;
 v_theme_code := NULLIF(lower(btrim(p_branding ->> 'platformThemeCode')), '');
 IF v_theme_code IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM "${schemaName}".platform_branding_themes
   WHERE theme_code = v_theme_code AND publication_status='PUBLISHED' AND is_active
 ) THEN
  RAISE EXCEPTION 'Selected platform branding theme is unavailable' USING ERRCODE='22023';
 END IF;
 v_decoration := NULLIF(p_branding -> 'decoration', 'null'::jsonb);
 PERFORM branding_v2_validate_decoration(v_decoration);
 IF v_decoration IS NOT NULL AND jsonb_typeof(v_decoration) <> 'object' THEN
  RAISE EXCEPTION 'Decoration must be an object' USING ERRCODE='22023';
 END IF;
 UPDATE "${schemaName}".organization_branding SET
   primary_color=p_branding->>'primaryColor', secondary_color=p_branding->>'secondaryColor',
   accent_color=p_branding->>'accentColor', background_color=p_branding->>'backgroundColor',
   text_color=p_branding->>'textColor',
   background_image_url=NULLIF(btrim(p_branding->>'backgroundImageUrl'),''),
   announcement_enabled=(p_branding->>'announcementEnabled')::boolean,
   announcement_message=NULLIF(btrim(p_branding->>'announcementMessage'),''),
   announcement_style=upper(btrim(p_branding->>'announcementStyle')),
   announcement_background_color=NULLIF(btrim(p_branding->>'announcementBackgroundColor'),''),
   announcement_text_color=NULLIF(btrim(p_branding->>'announcementTextColor'),''),
   announcement_link_url=NULLIF(btrim(p_branding->>'announcementLinkUrl'),''),
   announcement_starts_at=NULLIF(btrim(p_branding->>'announcementStartsAt'),'')::timestamptz,
   announcement_ends_at=NULLIF(btrim(p_branding->>'announcementEndsAt'),'')::timestamptz,
   announcement_configuration=COALESCE(p_branding->'announcementConfiguration',announcement_configuration),
   platform_branding_theme_code=v_theme_code,
   decoration_config=v_decoration,
   branding_draft_saved_at=CURRENT_TIMESTAMP,
   updated_at=CURRENT_TIMESTAMP,updated_by=p_actor_user_id,version_no=version_no+1
 WHERE organization_id=p_organization_id
   AND organization_branding_id=p_branding->>'id'
   AND version_no=v_version AND NOT is_deleted;
 IF NOT FOUND THEN RAISE EXCEPTION 'Organization branding changed or was not found' USING ERRCODE='40001'; END IF;
 RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_branding(p_organization_id varchar(64))
RETURNS jsonb LANGUAGE sql STABLE AS $function$
 SELECT jsonb_build_object(
  'id', b.organization_branding_id, 'organizationId', b.organization_id,
  'brandingName', b.branding_name, 'themeTemplateId',b.theme_template_id,
  'brandingStatusId',b.branding_status_id,'logoUrl',b.logo_url,
  'darkThemeLogoUrl',b.dark_theme_logo_url,'faviconUrl',b.favicon_url,
  'splashScreenImageUrl',b.splash_screen_image_url,
  'primaryColor',b.primary_color,'secondaryColor',b.secondary_color,
  'accentColor',b.accent_color,'backgroundColor',b.background_color,
  'textColor',b.text_color,'backgroundImageUrl',b.background_image_url,
  'platformThemeCode',b.platform_branding_theme_code,
  'decoration',b.decoration_config,
  'announcementConfiguration',b.announcement_configuration,
  'announcementEnabled',b.announcement_enabled,
  'announcementMessage',b.announcement_message,'announcementStyle',b.announcement_style,
  'announcementBackgroundColor',b.announcement_background_color,
  'announcementTextColor',b.announcement_text_color,
  'announcementLinkUrl',b.announcement_link_url,
  'announcementStartsAt',b.announcement_starts_at,
  'announcementEndsAt',b.announcement_ends_at,
  'tagline',b.tagline,'heroImageUrl',b.hero_image_url,
  'createdAt',b.created_at,'createdBy',b.created_by,
  'updatedAt',b.updated_at,'updatedBy',b.updated_by,
  'draftSavedAt',b.branding_draft_saved_at,
  'isDeleted',b.is_deleted,'versionNo',b.version_no)
 FROM "${schemaName}".organization_branding b
 WHERE b.organization_id=p_organization_id AND NOT b.is_deleted;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".save_organization_branding_draft(varchar,jsonb,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".save_organization_branding_draft(varchar,jsonb,varchar) TO "${appRole}";

-- Discovery reads only the published release snapshot, never the mutable draft.
CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_discoverable_organization(
    p_organization_id varchar
)
RETURNS TABLE ("organizationId" varchar, "detailJson" text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
WITH candidate AS (
    SELECT o.organization_id, cer.snapshot_data
      FROM "${schemaName}".organization o
      JOIN "${schemaName}".entity_status oes
        ON oes.entity_status_id = o.organization_status_id
      JOIN "${schemaName}".statuses os ON os.status_id = oes.status_id
      JOIN "${schemaName}".customer_experience_release cer
        ON cer.customer_experience_release_id = o.published_customer_experience_release_id
       AND cer.is_deleted = false
      JOIN "${schemaName}".entity_status ces
        ON ces.entity_status_id = cer.release_status_id
      JOIN "${schemaName}".statuses cs ON cs.status_id = ces.status_id
     WHERE o.organization_id = p_organization_id
       AND o.is_deleted = false
       AND os.status_code = 'ACTIVE'
       AND cs.status_code = 'PUBLISHED'
),
eligible_products AS (
    SELECT c.organization_id, c.snapshot_data, product
      FROM candidate c
      CROSS JOIN LATERAL jsonb_array_elements(
          COALESCE(c.snapshot_data -> 'membershipProducts', '[]'::jsonb)
      ) product
      JOIN "${schemaName}".statuses mps
        ON mps.status_id = product ->> 'productStatusId'
     WHERE mps.status_code = 'ACTIVE'
       AND COALESCE(NULLIF(product ->> 'effectiveDate', '')::date, CURRENT_DATE) <= CURRENT_DATE
       AND COALESCE(NULLIF(product ->> 'expiryDate', '')::date, CURRENT_DATE) >= CURRENT_DATE
       AND EXISTS (
           SELECT 1
             FROM jsonb_array_elements(COALESCE(product -> 'plans', '[]'::jsonb)) plan
             JOIN "${schemaName}".statuses sps
               ON sps.status_id = plan ->> 'subscriptionPlanStatusId'
            WHERE sps.status_code = 'ACTIVE'
              AND COALESCE(NULLIF(plan ->> 'effectiveDate', '')::date, CURRENT_DATE) <= CURRENT_DATE
              AND COALESCE(NULLIF(plan ->> 'expiryDate', '')::date, CURRENT_DATE) >= CURRENT_DATE
       )
)
SELECT c.organization_id,
       jsonb_build_object(
           'organization', jsonb_build_object(
               'id', c.snapshot_data #> '{organization,id}',
               'name', c.snapshot_data #> '{organization,name}',
               'displayName', c.snapshot_data #> '{organization,displayName}',
               'website', c.snapshot_data #> '{organization,website}',
               'primaryEmail', c.snapshot_data #> '{organization,primaryEmail}',
               'primaryPhone', c.snapshot_data #> '{organization,primaryPhone}'
           ),
           'publishedExperience', jsonb_build_object(
               'configuration', jsonb_build_object(
                   'templateId', c.snapshot_data #> '{configuration,templateId}',
                   'identity', c.snapshot_data #> '{configuration,identity}',
                   'branding', c.snapshot_data #> '{configuration,branding}',
                   'customerExperience', c.snapshot_data #> '{configuration,customerExperience}',
                   'localization', c.snapshot_data #> '{configuration,localization}'
               ),
               'template', jsonb_build_object(
                   'id', c.snapshot_data #> '{template,id}',
                   'sections', c.snapshot_data #> '{template,sections}',
                   'supportedCardStyles', c.snapshot_data #> '{template,supportedCardStyles}'
               ),
               'definition', c.snapshot_data #> '{customerExperience,experienceDefinition}',
               'organizationBranding', jsonb_build_object(
                   'logoUrl', c.snapshot_data #> '{organizationBranding,logoUrl}',
                   'darkThemeLogoUrl', c.snapshot_data #> '{organizationBranding,darkThemeLogoUrl}',
                   'faviconUrl', c.snapshot_data #> '{organizationBranding,faviconUrl}',
                   'splashScreenImageUrl', c.snapshot_data #> '{organizationBranding,splashScreenImageUrl}',
                   'tagline', c.snapshot_data #> '{organizationBranding,tagline}',
                   'heroImageUrl', c.snapshot_data #> '{organizationBranding,heroImageUrl}',
                   'primaryColor', c.snapshot_data #> '{organizationBranding,primaryColor}',
                   'secondaryColor', c.snapshot_data #> '{organizationBranding,secondaryColor}',
                   'accentColor', c.snapshot_data #> '{organizationBranding,accentColor}',
                   'backgroundColor', c.snapshot_data #> '{organizationBranding,backgroundColor}',
                   'textColor', c.snapshot_data #> '{organizationBranding,textColor}',
                    'announcementEnabled', c.snapshot_data #> '{organizationBranding,announcementEnabled}',
                    'announcementMessage', c.snapshot_data #> '{organizationBranding,announcementMessage}',
                    'announcementStyle', c.snapshot_data #> '{organizationBranding,announcementStyle}',
                    'announcementBackgroundColor', c.snapshot_data #> '{organizationBranding,announcementBackgroundColor}',
                    'announcementTextColor', c.snapshot_data #> '{organizationBranding,announcementTextColor}',
                    'announcementLinkUrl', c.snapshot_data #> '{organizationBranding,announcementLinkUrl}',
                    'announcementStartsAt', c.snapshot_data #> '{organizationBranding,announcementStartsAt}',
                    'announcementEndsAt', c.snapshot_data #> '{organizationBranding,announcementEndsAt}',
                    'announcementConfiguration', c.snapshot_data #> '{organizationBranding,announcementConfiguration}'
               ),
               'organizationDetails', jsonb_build_object(
                   'aboutOrganization', c.snapshot_data #> '{organizationDetails,aboutOrganization}',
                   'supportEmail', c.snapshot_data #> '{organizationDetails,supportEmail}',
                   'supportPhone', c.snapshot_data #> '{organizationDetails,supportPhone}'
               )
           ),
           'membershipProducts', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                   'id', product -> 'id',
                   'membershipProductName', product -> 'membershipProductName',
                   'displayName', product -> 'displayName',
                   'tier', product -> 'tier',
                   'tierSequence', product -> 'tierSequence',
                   'description', product -> 'description',
                   'benefitIds', COALESCE(product -> 'benefitIds', '[]'::jsonb),
                   'plans', COALESCE((
                       SELECT jsonb_agg(jsonb_build_object(
                           'id', plan -> 'id',
                           'subscriptionPlanName', plan -> 'subscriptionPlanName',
                           'subscriptionPlanCode', plan -> 'subscriptionPlanCode',
                           'description', plan -> 'description',
                           'subscriptionPeriod', plan -> 'subscriptionPeriod',
                           'subscriptionPeriodUnit', plan -> 'subscriptionPeriodUnit',
                           'price', plan -> 'price'
                       ) ORDER BY plan ->> 'subscriptionPlanName')
                       FROM jsonb_array_elements(COALESCE(product -> 'plans', '[]'::jsonb)) plan
                       JOIN "${schemaName}".statuses sps
                         ON sps.status_id = plan ->> 'subscriptionPlanStatusId'
                      WHERE sps.status_code = 'ACTIVE'
                        AND COALESCE(NULLIF(plan ->> 'effectiveDate', '')::date, CURRENT_DATE) <= CURRENT_DATE
                        AND COALESCE(NULLIF(plan ->> 'expiryDate', '')::date, CURRENT_DATE) >= CURRENT_DATE
                   ), '[]'::jsonb)
               ) ORDER BY NULLIF(product ->> 'tierSequence', '')::integer NULLS LAST,
                            product ->> 'membershipProductName')
                 FROM eligible_products ep
                WHERE ep.organization_id = c.organization_id
           ), '[]'::jsonb),
           'benefits', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                   'id', benefit -> 'id', 'benefitName', benefit -> 'benefitName',
                   'displayName', benefit -> 'displayName', 'description', benefit -> 'description',
                   'disclaimerText', benefit -> 'disclaimerText', 'benefitTypeId', benefit -> 'benefitTypeId',
                   'products', COALESCE(benefit -> 'products', '[]'::jsonb)
               ) ORDER BY benefit ->> 'benefitName')
                 FROM jsonb_array_elements(COALESCE(c.snapshot_data -> 'benefits', '[]'::jsonb)) benefit
           ), '[]'::jsonb),
           'benefitUsageRules', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                   'id', rule -> 'id', 'benefitId', rule -> 'benefitId',
                   'ruleName', rule -> 'ruleName', 'frequencyType', rule -> 'frequencyType',
                   'frequencyInterval', rule -> 'frequencyInterval', 'usageLimit', rule -> 'usageLimit',
                   'windowStartTime', rule -> 'windowStartTime', 'windowEndTime', rule -> 'windowEndTime',
                   'applicableDays', COALESCE(rule -> 'applicableDays', '[]'::jsonb), 'timeZone', rule -> 'timeZone'
               ) ORDER BY rule ->> 'ruleName')
                 FROM jsonb_array_elements(COALESCE(c.snapshot_data -> 'benefitUsageRules', '[]'::jsonb)) rule
           ), '[]'::jsonb),
           'offers', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                   'id', offer -> 'id', 'offerName', offer -> 'offerName',
                   'description', offer -> 'description', 'promotionImageUrl', offer -> 'promotionImageUrl',
                   'badgeText', offer -> 'badgeText', 'availabilityText', offer -> 'availabilityText',
                   'disclaimerText', offer -> 'disclaimerText', 'membershipProductId', offer -> 'membershipProductId',
                   'products', COALESCE(offer -> 'products', '[]'::jsonb),
                   'discountPercentage', offer -> 'discountPercentage', 'ctaLabel', offer -> 'ctaLabel'
               ) ORDER BY offer ->> 'offerName')
                 FROM jsonb_array_elements(COALESCE(c.snapshot_data -> 'offers', '[]'::jsonb)) offer
           ), '[]'::jsonb),
           'offerUsageRules', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                   'id', rule -> 'id', 'offerId', rule -> 'offerId',
                   'ruleName', rule -> 'ruleName', 'frequencyType', rule -> 'frequencyType',
                   'frequencyInterval', rule -> 'frequencyInterval', 'usageLimit', rule -> 'usageLimit',
                   'windowStartTime', rule -> 'windowStartTime', 'windowEndTime', rule -> 'windowEndTime',
                   'applicableDays', COALESCE(rule -> 'applicableDays', '[]'::jsonb), 'timeZone', rule -> 'timeZone'
               ) ORDER BY rule ->> 'ruleName')
                 FROM jsonb_array_elements(COALESCE(c.snapshot_data -> 'offerUsageRules', '[]'::jsonb)) rule
           ), '[]'::jsonb),
           'stores', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                   'id', store -> 'id', 'name', store -> 'name',
                   'address', jsonb_build_object(
                       'line1', store #> '{address,line1}',
                       'city', store #> '{address,city}'
                   )
               ) ORDER BY store ->> 'name')
                 FROM jsonb_array_elements(COALESCE(c.snapshot_data -> 'stores', '[]'::jsonb)) store
           ), '[]'::jsonb)
       )::text
  FROM candidate c
 WHERE EXISTS (
     SELECT 1 FROM eligible_products ep WHERE ep.organization_id = c.organization_id
 );
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".get_customer_discoverable_organization(varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_customer_discoverable_organization(varchar) TO "${appRole}";
