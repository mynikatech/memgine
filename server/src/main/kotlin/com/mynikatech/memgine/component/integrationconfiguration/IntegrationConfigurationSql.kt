package com.mynikatech.memgine.component.integrationconfiguration

import com.mynikatech.memgine.net.dto.IntegrationConfigurationDto
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.customizer.BindBean
import org.jdbi.v3.sqlobject.statement.SqlQuery

data class IntegrationConfigurationSqlParams(
    val organizationId: String, val id: String, val integrationName: String,
    val integrationTypeId: String, val provider: String,
    val integrationStatusId: String, val versionNo: Int,
    val actorUserId: String, val create: Boolean
)

interface IntegrationConfigurationSql {
    @SqlQuery("SELECT can_administer_organization(:organizationId, :actorUserId)")
    fun canAdminister(@Bind("organizationId") organizationId: String,
                      @Bind("actorUserId") actorUserId: String): Boolean

    @SqlQuery("SELECT * FROM get_organization_integration_configurations(:organizationId, :actorUserId)")
    fun list(@Bind("organizationId") organizationId: String,
             @Bind("actorUserId") actorUserId: String): List<IntegrationConfigurationDto>

    @SqlQuery("""SELECT save_organization_integration_configuration(
        :organizationId, :id, :integrationName, :integrationTypeId,
        :provider, :integrationStatusId, :versionNo, :actorUserId, :create)""")
    fun save(@BindBean params: IntegrationConfigurationSqlParams): Boolean

    @SqlQuery("SELECT delete_organization_integration_configuration(:organizationId, :id, :versionNo, :actorUserId)")
    fun delete(@Bind("organizationId") organizationId: String,
               @Bind("id") id: String, @Bind("versionNo") versionNo: Int,
               @Bind("actorUserId") actorUserId: String): Boolean
}
