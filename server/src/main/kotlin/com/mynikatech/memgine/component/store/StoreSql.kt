package com.mynikatech.memgine.component.store
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery
interface StoreSql { @SqlQuery("SELECT CAST(get_organization_stores(:organizationId) AS text)") fun getAll(@Bind("organizationId") organizationId:String):String; @SqlQuery("SELECT CAST(upsert_store(:organizationId,CAST(:payload AS jsonb),:actorUserId) AS text)") fun upsert(@Bind("organizationId") organizationId:String,@Bind("payload") payload:String,@Bind("actorUserId") actorUserId:String):String }
