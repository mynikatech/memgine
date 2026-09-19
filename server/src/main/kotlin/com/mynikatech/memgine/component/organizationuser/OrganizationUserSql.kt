package com.mynikatech.memgine.component.organizationuser
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery
interface OrganizationUserSql {
 @SqlQuery("SELECT CAST(get_organization_users(:organizationId) AS text)") fun getAll(@Bind("organizationId") organizationId:String):String
 @SqlQuery("SELECT CAST(upsert_organization_user_with_base_role(:organizationId,CAST(:payload AS jsonb),:actorUserId) AS text)") fun upsert(@Bind("organizationId") organizationId:String,@Bind("payload") payload:String,@Bind("actorUserId") actorUserId:String):String
}
