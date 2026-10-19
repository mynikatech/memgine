-- Migration 183: DB-driven options for case resolution. No financial execution changes.
CREATE TABLE "${schemaName}".refund_resolution_options (
 option_code varchar(64) NOT NULL,
 option_type varchar(24) NOT NULL CHECK (option_type IN ('ISSUE','ACTION','REFUND_REASON')),
 display_name varchar(120) NOT NULL,
 description varchar(500),
 scope varchar(16) NOT NULL CHECK (scope IN ('BOTH','SUPPORT','PAYMENT')),
 display_order integer NOT NULL,
 is_active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(option_type,option_code,scope)
);
INSERT INTO "${schemaName}".refund_resolution_options (option_type,option_code,display_name,description,scope,display_order) VALUES
('ACTION','CONTINUE','Continue investigation','Reply, document findings or continue working the case','BOTH',10),
('ACTION','REFUND','Refund customer','Create a full or partial refund against a verified payment','BOTH',20),
('ACTION','RESOLVE','Resolve without refund','Record an administrative resolution','BOTH',30),
('ACTION','RECOVER','Recover membership or redemption','Verify payment and recover fulfillment','PAYMENT',15),
('ISSUE','DUPLICATE_PAYMENT','Duplicate payment',null,'PAYMENT',10),
('ISSUE','CAPTURED_NOT_FULFILLED','Payment captured, membership or redemption missing',null,'PAYMENT',20),
('ISSUE','INCORRECT_AMOUNT','Incorrect amount charged',null,'PAYMENT',30),
('ISSUE','PAYMENT_INTERRUPTED','Payment or activation interrupted',null,'PAYMENT',40),
('ISSUE','PAYMENT_FAILED','Payment failed or not captured',null,'PAYMENT',50),
('ISSUE','CUSTOMER_REPORTED','Customer reported a payment problem',null,'PAYMENT',60),
('ISSUE','OTHER','Other payment concern',null,'PAYMENT',70),
('REFUND_REASON','DUPLICATE_PAYMENT','Duplicate payment',null,'BOTH',10),
('REFUND_REASON','CAPTURED_NOT_FULFILLED','Captured but not fulfilled',null,'BOTH',20),
('REFUND_REASON','INCORRECT_AMOUNT','Incorrect amount',null,'BOTH',30),
('REFUND_REASON','MEMBERSHIP_CANCELLATION','Membership cancellation',null,'BOTH',40),
('REFUND_REASON','GOODWILL','Goodwill',null,'BOTH',50),
('REFUND_REASON','OTHER_APPROVED','Other approved reason',null,'BOTH',60);

CREATE OR REPLACE FUNCTION "${schemaName}".refund_resolution_reference_options(p_org varchar,p_actor varchar,p_scope varchar)
RETURNS TABLE("code" varchar,"type" varchar,"name" varchar,"description" varchar,"displayOrder" integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
BEGIN
 IF NOT (rbac_has_capability(p_actor,p_org,'ORG_ADMIN_ACCESS') OR rbac_has_capability(p_actor,p_org,'BUSINESS_OWNER_ACCESS')) THEN
  RAISE EXCEPTION 'Refund resolution reference data access denied' USING ERRCODE='42501';
 END IF;
 IF p_scope NOT IN ('PAYMENT','SUPPORT') THEN RAISE EXCEPTION 'Invalid resolution scope' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT o.option_code,o.option_type,o.display_name,o.description,o.display_order
 FROM refund_resolution_options o WHERE o.is_active AND o.scope IN ('BOTH',p_scope)
 ORDER BY o.option_type,o.display_order,o.option_code;
END;$f$;
REVOKE ALL ON TABLE "${schemaName}".refund_resolution_options FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".refund_resolution_reference_options(varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".refund_resolution_reference_options(varchar,varchar,varchar) TO "${appRole}";
