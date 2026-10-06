-- Discovery reads only the published snapshot. The Product choices are frozen
-- in that release and do not expose live catalog or Commerce identifiers.
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
                   'accentColor', c.snapshot_data #> '{organizationBranding,accentColor}'
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
