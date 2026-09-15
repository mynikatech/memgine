-- Memgine Platform Admin bootstrap
-- Rerunnable / idempotent: YES

INSERT INTO "${schemaName}"."role"
("role_id","role_code","role_name","description","role_status_id")
VALUES
('role-platform-admin','PLATFORM_ADMIN','Platform Admin','Memgine platform administrator.','entity-status-role-active')
ON CONFLICT ("role_code") DO UPDATE SET
"role_name"=EXCLUDED."role_name",
"description"=EXCLUDED."description",
"role_status_id"=EXCLUDED."role_status_id";

INSERT INTO "${schemaName}"."user"
("user_id","user_code","first_name","middle_name","last_name","display_name",
 "primary_email","primary_phone","preferred_language_id","user_status_id",
 "created_at","created_by","updated_at","updated_by","is_deleted","version_no")
VALUES
('user-platform-admin','PLATFORM-ADMIN','Platform',NULL,'Admin','Platform Admin',
 NULL,'+10000000000',NULL,'entity-status-user-active',
 CURRENT_TIMESTAMP,'user-platform-admin',CURRENT_TIMESTAMP,'user-platform-admin',FALSE,1)
ON CONFLICT ("user_code") DO UPDATE SET
"first_name"=EXCLUDED."first_name",
"middle_name"=EXCLUDED."middle_name",
"last_name"=EXCLUDED."last_name",
"display_name"=EXCLUDED."display_name",
"user_status_id"=EXCLUDED."user_status_id",
"updated_at"=CURRENT_TIMESTAMP,
"updated_by"=EXCLUDED."updated_by",
"is_deleted"=FALSE;

INSERT INTO "${schemaName}"."platform_user_role"
("platform_user_role_id","user_id","role_id","status_id",
 "created_at","created_by","updated_at","updated_by","is_deleted","version_no")
SELECT
'platform-user-role-platform-admin',
u."user_id",
r."role_id",
'entity-status-platfrm-user-role-active',
CURRENT_TIMESTAMP,u."user_id",CURRENT_TIMESTAMP,u."user_id",FALSE,1
FROM "${schemaName}"."user" u
JOIN "${schemaName}"."role" r ON r."role_code"='PLATFORM_ADMIN'
WHERE u."user_code"='PLATFORM-ADMIN'
ON CONFLICT ("platform_user_role_id") DO UPDATE SET
"user_id"=EXCLUDED."user_id",
"role_id"=EXCLUDED."role_id",
"status_id"=EXCLUDED."status_id",
"updated_at"=CURRENT_TIMESTAMP,
"updated_by"=EXCLUDED."updated_by",
"is_deleted"=FALSE;
