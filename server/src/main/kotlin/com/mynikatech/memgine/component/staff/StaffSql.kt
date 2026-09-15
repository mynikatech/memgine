package com.mynikatech.memgine.component.staff
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery
interface StaffSql { @SqlQuery("SELECT CAST(get_organization_staff(:organizationId) AS text)") fun getAll(@Bind("organizationId") organizationId:String):String; @SqlQuery("SELECT CAST(upsert_staff(:organizationId,CAST(:payload AS jsonb),:actorUserId) AS text)") fun upsert(@Bind("organizationId") organizationId:String,@Bind("payload") payload:String,@Bind("actorUserId") actorUserId:String):String }
