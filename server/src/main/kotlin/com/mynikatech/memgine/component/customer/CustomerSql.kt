package com.mynikatech.memgine.component.customer

import com.mynikatech.memgine.net.dto.OrgAdminCustomerDto
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery

interface CustomerSql {
    @SqlQuery("SELECT can_administer_organization(:organizationId, :actorUserId)")
    fun canAdminister(@Bind("organizationId") organizationId: String,
                      @Bind("actorUserId") actorUserId: String): Boolean

    @SqlQuery("SELECT * FROM get_organization_customers_admin(:organizationId, :actorUserId)")
    fun list(@Bind("organizationId") organizationId: String,
             @Bind("actorUserId") actorUserId: String): List<OrgAdminCustomerDto>

    @SqlQuery("""SELECT create_organization_prospective_customer(
        :organizationId, :firstName, :middleName, :lastName, :displayName,
        :primaryEmail, :primaryPhone, :actorUserId)""")
    fun createProspect(@Bind("organizationId") organizationId: String,
                       @Bind("firstName") firstName: String,
                       @Bind("middleName") middleName: String?,
                       @Bind("lastName") lastName: String,
                       @Bind("displayName") displayName: String?,
                       @Bind("primaryEmail") primaryEmail: String?,
                       @Bind("primaryPhone") primaryPhone: String,
                       @Bind("actorUserId") actorUserId: String): String
}
