package com.mynikatech.memgine.component.organizationmaintenance

import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery

data class OrganizationAdministrativeUserRow(
    var assignmentId: String = "",
    var organizationUserId: String = "",
    var organizationId: String = "",
    var userId: String = "",
    var firstName: String = "",
    var lastName: String? = null,
    var displayName: String = "",
    var primaryEmail: String? = null,
    var primaryPhone: String = "",
    var roleCode: String = "",
    var assignmentStatusId: String = "",
    var effectiveFrom: String = "",
    var effectiveTo: String? = null
)
data class ExistingOrganizationUserLookupRow(
    var userId: String = "",
    var firstName: String = "",
    var lastName: String? = null,
    var displayName: String = "",
    var primaryEmail: String? = null,
    var primaryPhone: String = "",
    var associationOrganizationId: String? = null,
    var associationOrganizationName: String? = null,
    var associationRoleCode: String? = null
)

interface OrganizationMaintenanceSql {
    @SqlQuery("SELECT * FROM platform_list_organization_administrative_users(:organizationId, :actorUserId)")
    @RegisterBeanMapper(OrganizationAdministrativeUserRow::class)
    fun list(
        @Bind("organizationId") organizationId: String,
        @Bind("actorUserId") actorUserId: String
    ): List<OrganizationAdministrativeUserRow>

    @SqlQuery(
        """SELECT * FROM platform_save_organization_administrative_user(
            :organizationId, :userId, :firstName, :lastName, :primaryEmail,
            :primaryPhone, :roleCode, CAST(:effectiveFrom AS timestamp),
            CAST(:effectiveTo AS timestamp), :actorUserId
        )"""
    )
    @RegisterBeanMapper(OrganizationAdministrativeUserRow::class)
    fun save(
        @Bind("organizationId") organizationId: String,
        @Bind("userId") userId: String?,
        @Bind("firstName") firstName: String,
        @Bind("lastName") lastName: String?,
        @Bind("primaryEmail") primaryEmail: String?,
        @Bind("primaryPhone") primaryPhone: String,
        @Bind("roleCode") roleCode: String,
        @Bind("effectiveFrom") effectiveFrom: String?,
        @Bind("effectiveTo") effectiveTo: String?,
        @Bind("actorUserId") actorUserId: String
    ): OrganizationAdministrativeUserRow
    
    @SqlQuery(
        """SELECT * FROM platform_find_organization_user_by_phone(
            :organizationId, :phone, :actorUserId
        )"""
    )
    @RegisterBeanMapper(ExistingOrganizationUserLookupRow::class)
    fun findByPhone(
        @Bind("organizationId") organizationId: String,
        @Bind("phone") phone: String,
        @Bind("actorUserId") actorUserId: String
    ): List<ExistingOrganizationUserLookupRow>
}
