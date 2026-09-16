-- One-time DEV migration from the preserved AsyncStorage export used during Batch 1/2.
-- Idempotent: DB functions upsert by source IDs; rows whose organization/dependency is absent are skipped.
SET search_path TO memginedev, public;
DO $$ DECLARE v jsonb; BEGIN
IF EXISTS(SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a') THEN
  PERFORM memginedev.upsert_store('org-1788708324971-hcia1i0a','{"id":"store-1788763175550","storeCode":"1788708324971-HCIA1I0A-STORE-001","name":"Toronto Mall","storeTypeId":"store-type-branch","phoneNumber":{"countryId":"country-ca","callingCode":"+1","number":"4341414124"},"emailAddress":null,"addressLine1":"ererqr","addressLine2":null,"city":"Toronto","state":"ON","postalCode":"rqrqr3434","country":"CA","timezone":"America/Toronto","storeStatusId":"status-active","openingDate":null,"closingDate":null}'::jsonb,'user-system');
END IF;
IF EXISTS(SELECT 1 FROM memginedev.organization WHERE organization_id='org-20260915-vawpee5r') THEN
  PERFORM memginedev.upsert_store('org-20260915-vawpee5r','{"id":"store-1789504866802","storeCode":"ORG-TORONTO-STORE-001","name":"Toronto Mall","storeTypeId":"store-type-branch","phoneNumber":{"countryId":"country-ca","callingCode":"+1","number":"4341414124"},"emailAddress":"test@test1.com","addressLine1":"tfdssddd","addressLine2":null,"city":"Toronto","state":"ON","postalCode":"A12 B13","country":"CA","timezone":"America/Toronto","storeStatusId":"status-active","openingDate":null,"closingDate":null}'::jsonb,'user-system');
END IF;
IF EXISTS(SELECT 1 FROM memginedev.organization WHERE organization_id='org-glow') THEN
  PERFORM memginedev.upsert_store('org-glow','{"id":"store-1789025209574","storeCode":"GLOW-STORE-001","name":"West Side Mall Store","storeTypeId":"store-type-branch","phoneNumber":{"countryId":"country-ca","callingCode":"+1","number":"4324242342"},"emailAddress":null,"addressLine1":"West Side Mall Road","addressLine2":null,"city":"Toronto","state":"ON","postalCode":"31313132","country":"CA","timezone":"America/Toronto","storeStatusId":"status-active","openingDate":null,"closingDate":null}'::jsonb,'user-system');
END IF;
IF EXISTS(SELECT 1 FROM memginedev.organization WHERE organization_id='org-glow') THEN
  IF COALESCE('','')<>'' AND NOT EXISTS(SELECT 1 FROM memginedev.product WHERE product_id='') THEN
    v := '{"id":"benefit-1789025752938","benefitCode":"GLOW-BENEFIT-001","benefitName":"Monthly Signature Facial","description":null,"benefitTypeId":"benefit-type-free-item","productId":null,"valueAmount":null,"valuePercentage":null,"quantity":null,"unitOfMeasureId":null,"benefitStatusId":"status-active","effectiveDate":"2026-09-10","expiryDate":null}'::jsonb - 'productId';
  ELSE v := '{"id":"benefit-1789025752938","benefitCode":"GLOW-BENEFIT-001","benefitName":"Monthly Signature Facial","description":null,"benefitTypeId":"benefit-type-free-item","productId":null,"valueAmount":null,"valuePercentage":null,"quantity":null,"unitOfMeasureId":null,"benefitStatusId":"status-active","effectiveDate":"2026-09-10","expiryDate":null}'::jsonb; END IF;
  PERFORM memginedev.upsert_benefit('org-glow',v,'user-system');
END IF;
IF EXISTS(SELECT 1 FROM memginedev.organization WHERE organization_id='org-glow') THEN
  IF COALESCE('','')<>'' AND NOT EXISTS(SELECT 1 FROM memginedev.product WHERE product_id='') THEN
    v := '{"id":"benefit-1789025817232","benefitCode":"GLOW-BENEFIT-002","benefitName":"15% off all products","description":null,"benefitTypeId":"benefit-type-percentage","productId":null,"valueAmount":null,"valuePercentage":null,"quantity":null,"unitOfMeasureId":null,"benefitStatusId":"status-active","effectiveDate":"2026-09-10","expiryDate":null}'::jsonb - 'productId';
  ELSE v := '{"id":"benefit-1789025817232","benefitCode":"GLOW-BENEFIT-002","benefitName":"15% off all products","description":null,"benefitTypeId":"benefit-type-percentage","productId":null,"valueAmount":null,"valuePercentage":null,"quantity":null,"unitOfMeasureId":null,"benefitStatusId":"status-active","effectiveDate":"2026-09-10","expiryDate":null}'::jsonb; END IF;
  PERFORM memginedev.upsert_benefit('org-glow',v,'user-system');
END IF;
IF EXISTS(SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a') THEN
  IF COALESCE('product-org-1788708324971-hcia1i0a-001','')<>'' AND NOT EXISTS(SELECT 1 FROM memginedev.product WHERE product_id='product-org-1788708324971-hcia1i0a-001') THEN
    v := '{"id":"benefit-1788766124617","benefitCode":"BENEFIT-001","benefitName":"Free filter Coffee","description":null,"benefitTypeId":"benefit-type-free-item","productId":"product-org-1788708324971-hcia1i0a-001","valueAmount":null,"valuePercentage":null,"quantity":null,"unitOfMeasureId":null,"benefitStatusId":"status-active","effectiveDate":"2026-09-07","expiryDate":null}'::jsonb - 'productId';
  ELSE v := '{"id":"benefit-1788766124617","benefitCode":"BENEFIT-001","benefitName":"Free filter Coffee","description":null,"benefitTypeId":"benefit-type-free-item","productId":"product-org-1788708324971-hcia1i0a-001","valueAmount":null,"valuePercentage":null,"quantity":null,"unitOfMeasureId":null,"benefitStatusId":"status-active","effectiveDate":"2026-09-07","expiryDate":null}'::jsonb; END IF;
  PERFORM memginedev.upsert_benefit('org-1788708324971-hcia1i0a',v,'user-system');
END IF;
IF EXISTS(SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a') THEN
  IF COALESCE('product-org-1788708324971-hcia1i0a-003','')<>'' AND NOT EXISTS(SELECT 1 FROM memginedev.product WHERE product_id='product-org-1788708324971-hcia1i0a-003') THEN
    v := '{"id":"benefit-1788766539093","benefitCode":"1788708324971-HCIA1I0A-BENEFIT-001","benefitName":"cake discount","description":null,"benefitTypeId":"benefit-type-percentage","productId":"product-org-1788708324971-hcia1i0a-003","valueAmount":null,"valuePercentage":null,"quantity":null,"unitOfMeasureId":null,"benefitStatusId":"status-active","effectiveDate":"2026-09-07","expiryDate":null}'::jsonb - 'productId';
  ELSE v := '{"id":"benefit-1788766539093","benefitCode":"1788708324971-HCIA1I0A-BENEFIT-001","benefitName":"cake discount","description":null,"benefitTypeId":"benefit-type-percentage","productId":"product-org-1788708324971-hcia1i0a-003","valueAmount":null,"valuePercentage":null,"quantity":null,"unitOfMeasureId":null,"benefitStatusId":"status-active","effectiveDate":"2026-09-07","expiryDate":null}'::jsonb; END IF;
  PERFORM memginedev.upsert_benefit('org-1788708324971-hcia1i0a',v,'user-system');
END IF;
IF EXISTS(SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a') THEN
  PERFORM memginedev.upsert_membership_product('org-1788708324971-hcia1i0a','{"id":"membership-product-1788769068771","membershipProductCode":"MEMBERSHIP-001","membershipProductName":"ARTISAN PASS","displayName":"ARTISAN PASS","productCategoryId":"product-category-membership","productTypeId":"product-type-individual","description":null,"productStatusId":"status-active","effectiveDate":"2026-09-07","expiryDate":null,"tier":null,"tierSequence":null}'::jsonb,'user-system');
  PERFORM memginedev.replace_membership_product_benefits('membership-product-1788769068771','["benefit-1788766124617","benefit-1788766539093"]'::jsonb,'user-system');
END IF;
IF EXISTS(SELECT 1 FROM memginedev.membership_product WHERE membership_product_id='membership-product-1788769068771') THEN
 INSERT INTO memginedev.subscription_plan(subscription_plan_id,membership_product_id,subscription_plan_code,subscription_plan_name,
 description,subscription_period,subscription_period_unit,price,currency_id,subscription_plan_status_id,effective_date,expiry_date,
 created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 VALUES('membership-plan-1788769068771','membership-product-1788769068771','PLAN-178876906877','SILVER',
 NULL,1,'YEAR',79.99,
 'currency-cad','status-active',
 '2026-09-07'::date,NULL,now(),'user-system',now(),'user-system',false,1)
 ON CONFLICT(subscription_plan_id) DO NOTHING;
END IF;
IF EXISTS(SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a') THEN
  PERFORM memginedev.upsert_membership_product('org-1788708324971-hcia1i0a','{"id":"membership-product-1788770000083","membershipProductCode":"1788708324971-HCIA1I0A-MEMBERSHIP-001","membershipProductName":"ARTISAN PASS","displayName":null,"productCategoryId":"product-category-membership","productTypeId":"product-type-individual","description":null,"productStatusId":"status-active","effectiveDate":"2026-09-07","expiryDate":null,"tier":null,"tierSequence":null}'::jsonb,'user-system');
  PERFORM memginedev.replace_membership_product_benefits('membership-product-1788770000083','["benefit-1788766124617","benefit-1788766539093"]'::jsonb,'user-system');
END IF;
IF EXISTS(SELECT 1 FROM memginedev.membership_product WHERE membership_product_id='membership-product-1788770000083') THEN
 INSERT INTO memginedev.subscription_plan(subscription_plan_id,membership_product_id,subscription_plan_code,subscription_plan_name,
 description,subscription_period,subscription_period_unit,price,currency_id,subscription_plan_status_id,effective_date,expiry_date,
 created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 VALUES('membership-plan-1788770000084','membership-product-1788770000083','1788708324971-HCIA1I0A-MEMBERSHIP-001-PLAN-001','GOLD',
 NULL,1,'YEAR',89.99,
 'currency-cad','status-active',
 '2026-09-07'::date,NULL,now(),'user-system',now(),'user-system',false,1)
 ON CONFLICT(subscription_plan_id) DO NOTHING;
END IF;
IF EXISTS(SELECT 1 FROM memginedev.organization WHERE organization_id='org-glow') THEN
  PERFORM memginedev.upsert_membership_product('org-glow','{"id":"membership-product-1789025847660","membershipProductCode":"GLOW-MEMBERSHIP-001","membershipProductName":"RADIANCE","displayName":"RADIANCE","productCategoryId":"product-category-membership","productTypeId":"product-type-individual","description":null,"productStatusId":"status-active","effectiveDate":"2026-09-10","expiryDate":null,"tier":null,"tierSequence":null}'::jsonb,'user-system');
  PERFORM memginedev.replace_membership_product_benefits('membership-product-1789025847660','["benefit-1789025752938","benefit-1789025817232"]'::jsonb,'user-system');
END IF;
IF EXISTS(SELECT 1 FROM memginedev.membership_product WHERE membership_product_id='membership-product-1789025847660') THEN
 INSERT INTO memginedev.subscription_plan(subscription_plan_id,membership_product_id,subscription_plan_code,subscription_plan_name,
 description,subscription_period,subscription_period_unit,price,currency_id,subscription_plan_status_id,effective_date,expiry_date,
 created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 VALUES('membership-plan-1789025847660','membership-product-1789025847660','GLOW-MEMBERSHIP-001-PLAN-001','SILVER',
 NULL,1,'MONTH',19.99,
 'currency-cad','status-active',
 '2026-09-10'::date,NULL,now(),'user-system',now(),'user-system',false,1)
 ON CONFLICT(subscription_plan_id) DO NOTHING;
END IF;
IF EXISTS(SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a') THEN PERFORM memginedev.upsert_notification_configuration('org-1788708324971-hcia1i0a','{"id":"notification-config-org-1788708324971-hcia1i0a","organizationId":"org-1788708324971-hcia1i0a","configurationName":"Default Notifications","emailEnabled":true,"smsEnabled":true,"whatsappEnabled":true,"pushEnabled":true,"inAppEnabled":true,"notificationStatusId":"status-active","createdAt":"2026-09-08T18:21:15.659Z","createdBy":"user-system","updatedAt":"2026-09-08T18:21:15.659Z","updatedBy":"user-system","isDeleted":false,"versionNo":1}'::jsonb,'user-system'); END IF;
IF EXISTS(SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a') THEN PERFORM memginedev.upsert_integration_configuration('org-1788708324971-hcia1i0a','{"id":"integration-1788943373704","organizationId":"org-1788708324971-hcia1i0a","integrationName":"test","integrationTypeId":"integration-type-pos","provider":"POS","integrationStatusId":"status-active","createdAt":"2026-09-09T08:43:07.895Z","createdBy":"user-system","updatedAt":"2026-09-09T08:43:07.895Z","updatedBy":"user-system","isDeleted":false,"versionNo":1}'::jsonb,'user-system'); END IF;


IF EXISTS(SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a') THEN
 INSERT INTO memginedev."user"(user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 SELECT 'user-1788765439762','USR-000001','Sunil',NULL,
 'Agarwal','Sunil Agarwal',NULL,'+17184014141',
 NULL,
 COALESCE((SELECT status_id FROM memginedev.status WHERE status_id='status-inactive'),
          (SELECT status_id FROM memginedev.status WHERE upper(status_code)='ACTIVE' LIMIT 1)),
 now(),'user-system',now(),'user-system',false,1
 WHERE NOT EXISTS(SELECT 1 FROM memginedev."user" WHERE user_id='user-1788765439762');

 INSERT INTO memginedev.organization_user(organization_user_id,organization_id,user_id,organization_user_type_id,
 organization_user_status_id,joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 VALUES('org-user-1788765439774','org-1788708324971-hcia1i0a','user-1788765439762','org-user-type-employee',
 'status-active','2026-09-07'::date,
 now(),'user-system',now(),'user-system',false,1)
 ON CONFLICT(organization_user_id) DO NOTHING;
END IF;

IF EXISTS(SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a') THEN
 INSERT INTO memginedev."user"(user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 SELECT 'user-1788765439762','USR-000001','Sunil',NULL,
 'Agarwal','Sunil Agarwal',NULL,'+17184014141',
 NULL,
 COALESCE((SELECT status_id FROM memginedev.status WHERE status_id='status-inactive'),
          (SELECT status_id FROM memginedev.status WHERE upper(status_code)='ACTIVE' LIMIT 1)),
 now(),'user-system',now(),'user-system',false,1
 WHERE NOT EXISTS(SELECT 1 FROM memginedev."user" WHERE user_id='user-1788765439762');

 INSERT INTO memginedev.organization_user(organization_user_id,organization_id,user_id,organization_user_type_id,
 organization_user_status_id,joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 VALUES('org-user-mtsn813v-la0ik','org-1788708324971-hcia1i0a','user-1788765439762','org-user-type-customer',
 'status-active','2026-09-08'::date,
 now(),'user-system',now(),'user-system',false,1)
 ON CONFLICT(organization_user_id) DO NOTHING;
END IF;

IF EXISTS(SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a') THEN
 INSERT INTO memginedev."user"(user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 SELECT 'user-mtsoynym-3v36gi','USR-000002','John',NULL,
 'Smith','John Smith',NULL,'+12434465475',
 NULL,
 COALESCE((SELECT status_id FROM memginedev.status WHERE status_id='user-status-active'),
          (SELECT status_id FROM memginedev.status WHERE upper(status_code)='ACTIVE' LIMIT 1)),
 now(),'user-system',now(),'user-system',false,1
 WHERE NOT EXISTS(SELECT 1 FROM memginedev."user" WHERE user_id='user-mtsoynym-3v36gi');

 INSERT INTO memginedev.organization_user(organization_user_id,organization_id,user_id,organization_user_type_id,
 organization_user_status_id,joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 VALUES('org-user-mtsoynym-3n6t32','org-1788708324971-hcia1i0a','user-mtsoynym-3v36gi','org-user-type-customer',
 'status-active','2026-09-08'::date,
 now(),'user-system',now(),'user-system',false,1)
 ON CONFLICT(organization_user_id) DO NOTHING;
END IF;

IF EXISTS(SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a') THEN
 INSERT INTO memginedev."user"(user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 SELECT 'user-mtsp1pdp-2j6jgh','USR-000003','test',NULL,
 'User','test User','test1@gmail.com','+13425254364',
 NULL,
 COALESCE((SELECT status_id FROM memginedev.status WHERE status_id='user-status-active'),
          (SELECT status_id FROM memginedev.status WHERE upper(status_code)='ACTIVE' LIMIT 1)),
 now(),'user-system',now(),'user-system',false,1
 WHERE NOT EXISTS(SELECT 1 FROM memginedev."user" WHERE user_id='user-mtsp1pdp-2j6jgh');

 INSERT INTO memginedev.organization_user(organization_user_id,organization_id,user_id,organization_user_type_id,
 organization_user_status_id,joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 VALUES('org-user-mtsp1pdq-b9q35n','org-1788708324971-hcia1i0a','user-mtsp1pdp-2j6jgh','org-user-type-customer',
 'status-active','2026-09-08'::date,
 now(),'user-system',now(),'user-system',false,1)
 ON CONFLICT(organization_user_id) DO NOTHING;
END IF;

IF EXISTS(SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a') THEN
 INSERT INTO memginedev."user"(user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 SELECT 'user-mtsul0vl-zn5yhf','USR-000004','fafafa',NULL,
 'afafaf','fafafa afafaf','fafa@sfsfs.com','+13324341414',
 NULL,
 COALESCE((SELECT status_id FROM memginedev.status WHERE status_id='user-status-active'),
          (SELECT status_id FROM memginedev.status WHERE upper(status_code)='ACTIVE' LIMIT 1)),
 now(),'user-system',now(),'user-system',false,1
 WHERE NOT EXISTS(SELECT 1 FROM memginedev."user" WHERE user_id='user-mtsul0vl-zn5yhf');

 INSERT INTO memginedev.organization_user(organization_user_id,organization_id,user_id,organization_user_type_id,
 organization_user_status_id,joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 VALUES('1788708324971-HCIA1I0A-CUSTOMER-001','org-1788708324971-hcia1i0a','user-mtsul0vl-zn5yhf','org-user-type-customer',
 'status-active','2026-09-08'::date,
 now(),'user-system',now(),'user-system',false,1)
 ON CONFLICT(organization_user_id) DO NOTHING;
END IF;

IF EXISTS(SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a') THEN
 INSERT INTO memginedev."user"(user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 SELECT 'user-mttyzrri-6rj70c','USR-000005','Kapil',NULL,
 'Shah','Kapil Shah',NULL,'13487389410',
 NULL,
 COALESCE((SELECT status_id FROM memginedev.status WHERE status_id='status-active'),
          (SELECT status_id FROM memginedev.status WHERE upper(status_code)='ACTIVE' LIMIT 1)),
 now(),'user-system',now(),'user-system',false,1
 WHERE NOT EXISTS(SELECT 1 FROM memginedev."user" WHERE user_id='user-mttyzrri-6rj70c');

 INSERT INTO memginedev.organization_user(organization_user_id,organization_id,user_id,organization_user_type_id,
 organization_user_status_id,joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 VALUES('1788708324971-HCIA1I0A-CUSTOMER-004','org-1788708324971-hcia1i0a','user-mttyzrri-6rj70c','org-user-type-customer',
 'status-active','2026-09-09'::date,
 now(),'user-system',now(),'user-system',false,1)
 ON CONFLICT(organization_user_id) DO NOTHING;
END IF;

IF EXISTS(SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a') THEN
 INSERT INTO memginedev."user"(user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 SELECT 'user-mttz1yd5-yh42rw','USR-000006','kapil',NULL,
 'ahah','kapil ahah',NULL,'12342343252',
 NULL,
 COALESCE((SELECT status_id FROM memginedev.status WHERE status_id='status-active'),
          (SELECT status_id FROM memginedev.status WHERE upper(status_code)='ACTIVE' LIMIT 1)),
 now(),'user-system',now(),'user-system',false,1
 WHERE NOT EXISTS(SELECT 1 FROM memginedev."user" WHERE user_id='user-mttz1yd5-yh42rw');

 INSERT INTO memginedev.organization_user(organization_user_id,organization_id,user_id,organization_user_type_id,
 organization_user_status_id,joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 VALUES('1788708324971-HCIA1I0A-CUSTOMER-005','org-1788708324971-hcia1i0a','user-mttz1yd5-yh42rw','org-user-type-customer',
 'status-active','2026-09-09'::date,
 now(),'user-system',now(),'user-system',false,1)
 ON CONFLICT(organization_user_id) DO NOTHING;
END IF;

IF EXISTS(SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a') THEN
 INSERT INTO memginedev."user"(user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 SELECT 'user-mttzrhcy-a2vvuc','USR-000007','taylor',NULL,
 'swift','taylor swift','test1@test.com','+12389493048',
 NULL,
 COALESCE((SELECT status_id FROM memginedev.status WHERE status_id='status-active'),
          (SELECT status_id FROM memginedev.status WHERE upper(status_code)='ACTIVE' LIMIT 1)),
 now(),'user-system',now(),'user-system',false,1
 WHERE NOT EXISTS(SELECT 1 FROM memginedev."user" WHERE user_id='user-mttzrhcy-a2vvuc');

 INSERT INTO memginedev.organization_user(organization_user_id,organization_id,user_id,organization_user_type_id,
 organization_user_status_id,joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 VALUES('1788708324971-HCIA1I0A-CUSTOMER-006','org-1788708324971-hcia1i0a','user-mttzrhcy-a2vvuc','org-user-type-customer',
 'status-active','2026-09-09'::date,
 now(),'user-system',now(),'user-system',false,1)
 ON CONFLICT(organization_user_id) DO NOTHING;
END IF;

IF EXISTS(SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a') THEN
 INSERT INTO memginedev."user"(user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 SELECT 'user-mttzt03i-atdile','USR-000008','prem',NULL,
 'ranjan','prem ranjan',NULL,'12840923843',
 NULL,
 COALESCE((SELECT status_id FROM memginedev.status WHERE status_id='status-active'),
          (SELECT status_id FROM memginedev.status WHERE upper(status_code)='ACTIVE' LIMIT 1)),
 now(),'user-system',now(),'user-system',false,1
 WHERE NOT EXISTS(SELECT 1 FROM memginedev."user" WHERE user_id='user-mttzt03i-atdile');

 INSERT INTO memginedev.organization_user(organization_user_id,organization_id,user_id,organization_user_type_id,
 organization_user_status_id,joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 VALUES('1788708324971-HCIA1I0A-CUSTOMER-007','org-1788708324971-hcia1i0a','user-mttzt03i-atdile','org-user-type-customer',
 'status-active','2026-09-09'::date,
 now(),'user-system',now(),'user-system',false,1)
 ON CONFLICT(organization_user_id) DO NOTHING;
END IF;

IF EXISTS(SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a') THEN
 INSERT INTO memginedev."user"(user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 SELECT 'user-mtu04o5e-vt05v4','USR-000009','rqwerqw',NULL,
 'qrqrq','rqwerqw qrqrq',NULL,'14324324532',
 NULL,
 COALESCE((SELECT status_id FROM memginedev.status WHERE status_id='status-active'),
          (SELECT status_id FROM memginedev.status WHERE upper(status_code)='ACTIVE' LIMIT 1)),
 now(),'user-system',now(),'user-system',false,1
 WHERE NOT EXISTS(SELECT 1 FROM memginedev."user" WHERE user_id='user-mtu04o5e-vt05v4');

 INSERT INTO memginedev.organization_user(organization_user_id,organization_id,user_id,organization_user_type_id,
 organization_user_status_id,joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 VALUES('1788708324971-HCIA1I0A-CUSTOMER-008','org-1788708324971-hcia1i0a','user-mtu04o5e-vt05v4','org-user-type-customer',
 'status-active','2026-09-09'::date,
 now(),'user-system',now(),'user-system',false,1)
 ON CONFLICT(organization_user_id) DO NOTHING;
END IF;

IF EXISTS(SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a') THEN
 INSERT INTO memginedev."user"(user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 SELECT 'user-mtu0bg1o-ukp7w1','USR-000010','dad',NULL,
 'dasdsad','dad dasdsad',NULL,'12312413414',
 NULL,
 COALESCE((SELECT status_id FROM memginedev.status WHERE status_id='status-active'),
          (SELECT status_id FROM memginedev.status WHERE upper(status_code)='ACTIVE' LIMIT 1)),
 now(),'user-system',now(),'user-system',false,1
 WHERE NOT EXISTS(SELECT 1 FROM memginedev."user" WHERE user_id='user-mtu0bg1o-ukp7w1');

 INSERT INTO memginedev.organization_user(organization_user_id,organization_id,user_id,organization_user_type_id,
 organization_user_status_id,joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 VALUES('1788708324971-HCIA1I0A-CUSTOMER-009','org-1788708324971-hcia1i0a','user-mtu0bg1o-ukp7w1','org-user-type-customer',
 'status-active','2026-09-09'::date,
 now(),'user-system',now(),'user-system',false,1)
 ON CONFLICT(organization_user_id) DO NOTHING;
END IF;

IF EXISTS(SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a') THEN
 INSERT INTO memginedev."user"(user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 SELECT 'user-mtu0kdtu-hm1gwd','USR-000011','Suhas',NULL,
 'Jha','Suhas Jha',NULL,'+15252352523',
 NULL,
 COALESCE((SELECT status_id FROM memginedev.status WHERE status_id='status-active'),
          (SELECT status_id FROM memginedev.status WHERE upper(status_code)='ACTIVE' LIMIT 1)),
 now(),'user-system',now(),'user-system',false,1
 WHERE NOT EXISTS(SELECT 1 FROM memginedev."user" WHERE user_id='user-mtu0kdtu-hm1gwd');

 INSERT INTO memginedev.organization_user(organization_user_id,organization_id,user_id,organization_user_type_id,
 organization_user_status_id,joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 VALUES('1788708324971-HCIA1I0A-CUSTOMER-010','org-1788708324971-hcia1i0a','user-mtu0kdtu-hm1gwd','org-user-type-customer',
 'status-active','2026-09-09'::date,
 now(),'user-system',now(),'user-system',false,1)
 ON CONFLICT(organization_user_id) DO NOTHING;
END IF;

IF EXISTS(SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a') THEN
 INSERT INTO memginedev."user"(user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 SELECT 'user-mtu1381t-dzmjpu','USR-000012','fgfhakd',NULL,
 'afafafa','fgfhakd afafafa',NULL,'+14324343243',
 NULL,
 COALESCE((SELECT status_id FROM memginedev.status WHERE status_id='status-active'),
          (SELECT status_id FROM memginedev.status WHERE upper(status_code)='ACTIVE' LIMIT 1)),
 now(),'user-system',now(),'user-system',false,1
 WHERE NOT EXISTS(SELECT 1 FROM memginedev."user" WHERE user_id='user-mtu1381t-dzmjpu');

 INSERT INTO memginedev.organization_user(organization_user_id,organization_id,user_id,organization_user_type_id,
 organization_user_status_id,joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 VALUES('1788708324971-HCIA1I0A-CUSTOMER-011','org-1788708324971-hcia1i0a','user-mtu1381t-dzmjpu','org-user-type-customer',
 'status-active','2026-09-09'::date,
 now(),'user-system',now(),'user-system',false,1)
 ON CONFLICT(organization_user_id) DO NOTHING;
END IF;

IF EXISTS(SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a') THEN
 INSERT INTO memginedev."user"(user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 SELECT 'user-mtu2b5o2-56bwd8','USR-000013','ererqr',NULL,
 'rqrqr','ererqr rqrqr',NULL,'+14534567899',
 NULL,
 COALESCE((SELECT status_id FROM memginedev.status WHERE status_id='status-active'),
          (SELECT status_id FROM memginedev.status WHERE upper(status_code)='ACTIVE' LIMIT 1)),
 now(),'user-system',now(),'user-system',false,1
 WHERE NOT EXISTS(SELECT 1 FROM memginedev."user" WHERE user_id='user-mtu2b5o2-56bwd8');

 INSERT INTO memginedev.organization_user(organization_user_id,organization_id,user_id,organization_user_type_id,
 organization_user_status_id,joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 VALUES('1788708324971-HCIA1I0A-CUSTOMER-012','org-1788708324971-hcia1i0a','user-mtu2b5o2-56bwd8','org-user-type-customer',
 'status-active','2026-09-09'::date,
 now(),'user-system',now(),'user-system',false,1)
 ON CONFLICT(organization_user_id) DO NOTHING;
END IF;

IF EXISTS(SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a') THEN
 INSERT INTO memginedev."user"(user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 SELECT 'user-mtwrkefl-9mfs1d','USR-000016','Gopi',NULL,
 'Suresh','Gopi Suresh',NULL,'13432432432',
 NULL,
 COALESCE((SELECT status_id FROM memginedev.status WHERE status_id='status-active'),
          (SELECT status_id FROM memginedev.status WHERE upper(status_code)='ACTIVE' LIMIT 1)),
 now(),'user-system',now(),'user-system',false,1
 WHERE NOT EXISTS(SELECT 1 FROM memginedev."user" WHERE user_id='user-mtwrkefl-9mfs1d');

 INSERT INTO memginedev.organization_user(organization_user_id,organization_id,user_id,organization_user_type_id,
 organization_user_status_id,joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 VALUES('1788708324971-HCIA1I0A-CUSTOMER-013','org-1788708324971-hcia1i0a','user-mtwrkefl-9mfs1d','org-user-type-customer',
 'status-active','2026-09-11'::date,
 now(),'user-system',now(),'user-system',false,1)
 ON CONFLICT(organization_user_id) DO NOTHING;
END IF;

IF EXISTS(SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a') THEN
 INSERT INTO memginedev."user"(user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 SELECT 'user-mtwwetxe-jr18vq','USR-000017','jiansh',NULL,
 'shah','jiansh shah',NULL,'13487239048',
 NULL,
 COALESCE((SELECT status_id FROM memginedev.status WHERE status_id='status-active'),
          (SELECT status_id FROM memginedev.status WHERE upper(status_code)='ACTIVE' LIMIT 1)),
 now(),'user-system',now(),'user-system',false,1
 WHERE NOT EXISTS(SELECT 1 FROM memginedev."user" WHERE user_id='user-mtwwetxe-jr18vq');

 INSERT INTO memginedev.organization_user(organization_user_id,organization_id,user_id,organization_user_type_id,
 organization_user_status_id,joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 VALUES('1788708324971-HCIA1I0A-CUSTOMER-014','org-1788708324971-hcia1i0a','user-mtwwetxe-jr18vq','org-user-type-customer',
 'status-active','2026-09-11'::date,
 now(),'user-system',now(),'user-system',false,1)
 ON CONFLICT(organization_user_id) DO NOTHING;
END IF;

IF EXISTS(SELECT 1 FROM memginedev.organization WHERE organization_id='org-glow') THEN
 INSERT INTO memginedev."user"(user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 SELECT 'user-mtv7gmzz-j7xf33','USR-000014','Jacob',NULL,
 'Martin','Jacob Martin',NULL,'+13543563545',
 NULL,
 COALESCE((SELECT status_id FROM memginedev.status WHERE status_id='status-active'),
          (SELECT status_id FROM memginedev.status WHERE upper(status_code)='ACTIVE' LIMIT 1)),
 now(),'user-system',now(),'user-system',false,1
 WHERE NOT EXISTS(SELECT 1 FROM memginedev."user" WHERE user_id='user-mtv7gmzz-j7xf33');

 INSERT INTO memginedev.organization_user(organization_user_id,organization_id,user_id,organization_user_type_id,
 organization_user_status_id,joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 VALUES('GLOW-EMPLOYEE-001','org-glow','user-mtv7gmzz-j7xf33','org-user-type-employee',
 'status-active','2026-09-10'::date,
 now(),'user-system',now(),'user-system',false,1)
 ON CONFLICT(organization_user_id) DO NOTHING;
END IF;

IF EXISTS(SELECT 1 FROM memginedev.organization WHERE organization_id='org-glow') THEN
 INSERT INTO memginedev."user"(user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 SELECT 'user-mtv7i7sn-e852zf','USR-000015','Mary',NULL,
 'Kom','Mary Kom',NULL,'+15544332211',
 NULL,
 COALESCE((SELECT status_id FROM memginedev.status WHERE status_id='status-active'),
          (SELECT status_id FROM memginedev.status WHERE upper(status_code)='ACTIVE' LIMIT 1)),
 now(),'user-system',now(),'user-system',false,1
 WHERE NOT EXISTS(SELECT 1 FROM memginedev."user" WHERE user_id='user-mtv7i7sn-e852zf');

 INSERT INTO memginedev.organization_user(organization_user_id,organization_id,user_id,organization_user_type_id,
 organization_user_status_id,joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 VALUES('GLOW-CUSTOMER-001','org-glow','user-mtv7i7sn-e852zf','org-user-type-customer',
 'status-active','2026-09-10'::date,
 now(),'user-system',now(),'user-system',false,1)
 ON CONFLICT(organization_user_id) DO NOTHING;
END IF;

IF EXISTS(SELECT 1 FROM memginedev.organization WHERE organization_id='org-glow') THEN
 INSERT INTO memginedev."user"(user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 SELECT 'user-mtsoynym-3v36gi','USR-000002','John',NULL,
 'Smith','John Smith',NULL,'+12434465475',
 NULL,
 COALESCE((SELECT status_id FROM memginedev.status WHERE status_id='user-status-active'),
          (SELECT status_id FROM memginedev.status WHERE upper(status_code)='ACTIVE' LIMIT 1)),
 now(),'user-system',now(),'user-system',false,1
 WHERE NOT EXISTS(SELECT 1 FROM memginedev."user" WHERE user_id='user-mtsoynym-3v36gi');

 INSERT INTO memginedev.organization_user(organization_user_id,organization_id,user_id,organization_user_type_id,
 organization_user_status_id,joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 VALUES('GLOW-CUSTOMER-002','org-glow','user-mtsoynym-3v36gi','org-user-type-customer',
 'status-active','2026-09-10'::date,
 now(),'user-system',now(),'user-system',false,1)
 ON CONFLICT(organization_user_id) DO NOTHING;
END IF;
IF EXISTS(SELECT 1 FROM memginedev.organization_user WHERE organization_user_id='org-user-1788765439774') THEN
 INSERT INTO memginedev.staff(staff_id,organization_user_id,staff_code,organization_id,role_id,designation,store_id,
 joining_date,relieving_date,staff_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 VALUES('staff-1788765416533','org-user-1788765439774','1788708324971-HCIA1I0A-1788708324971-HCI','org-1788708324971-hcia1i0a',
 (SELECT role_id FROM memginedev.role WHERE upper(role_code)=upper('STAFF') LIMIT 1),
 'manager','store-1788763175550','2026-09-07'::date,
 NULL::date,'status-active',now(),'user-system',now(),'user-system',false,1)
 ON CONFLICT(staff_id) DO NOTHING;
END IF;
IF EXISTS(SELECT 1 FROM memginedev.organization_user WHERE organization_user_id='GLOW-EMPLOYEE-001') THEN
 INSERT INTO memginedev.staff(staff_id,organization_user_id,staff_code,organization_id,role_id,designation,store_id,
 joining_date,relieving_date,staff_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no)
 VALUES('staff-1789025263374','GLOW-EMPLOYEE-001','GLOW-GLOW-STORE-001-STAFF-001','org-glow',
 (SELECT role_id FROM memginedev.role WHERE upper(role_code)=upper('STAFF') LIMIT 1),
 NULL,'store-1789025209574','2026-09-10'::date,
 NULL::date,'status-active',now(),'user-system',now(),'user-system',false,1)
 ON CONFLICT(staff_id) DO NOTHING;
END IF;
END $$;
