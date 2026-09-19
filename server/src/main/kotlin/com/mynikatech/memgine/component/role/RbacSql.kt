package com.mynikatech.memgine.component.role

import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery

data class RoleRow(var roleId: String = "", var roleCode: String = "", var roleName: String = "", var description: String? = null)
data class CapabilityRow(var capabilityCode: String = "", var capabilityName: String = "", var description: String? = null)
data class EffectiveRoleRow(var roleId: String = "", var roleCode: String = "", var organizationId: String? = null)
data class EffectiveCapabilityRow(var capabilityCode: String = "", var organizationId: String? = null)
data class RoleAssignmentRow(
    var assignmentId: String = "", var organizationId: String? = null, var roleCode: String = "",
    var assignmentStatusId: String = "", var effectiveFrom: String = "", var effectiveTo: String? = null,
    var assignmentReason: String? = null
)

interface RbacSql {
    @SqlQuery("SELECT * FROM rbac_roles()") @RegisterBeanMapper(RoleRow::class)
    fun roles(): List<RoleRow>

    @SqlQuery("SELECT * FROM rbac_capabilities()") @RegisterBeanMapper(CapabilityRow::class)
    fun capabilities(): List<CapabilityRow>

    @SqlQuery("SELECT * FROM rbac_user_assignments(:userId)") @RegisterBeanMapper(RoleAssignmentRow::class)
    fun assignments(@Bind("userId") userId: String): List<RoleAssignmentRow>

    @SqlQuery("SELECT * FROM rbac_effective_roles(:userId, :organizationId)") @RegisterBeanMapper(EffectiveRoleRow::class)
    fun effectiveRoles(@Bind("userId") userId: String, @Bind("organizationId") organizationId: String?): List<EffectiveRoleRow>

    @SqlQuery("SELECT * FROM rbac_effective_capabilities(:userId, :organizationId)") @RegisterBeanMapper(EffectiveCapabilityRow::class)
    fun effectiveCapabilities(@Bind("userId") userId: String, @Bind("organizationId") organizationId: String?): List<EffectiveCapabilityRow>

    @SqlQuery("SELECT rbac_has_capability(:userId, :organizationId, :capabilityCode)")
    fun hasCapability(@Bind("userId") userId: String, @Bind("organizationId") organizationId: String?, @Bind("capabilityCode") capabilityCode: String): Boolean

    @SqlQuery("SELECT rbac_assign_organization_role(:organizationId, :userId, :roleCode, CAST(:effectiveFrom AS timestamp), CAST(:effectiveTo AS timestamp), :reason, :actorUserId)")
    fun assignOrganizationRole(@Bind("organizationId") organizationId: String, @Bind("userId") userId: String,
        @Bind("roleCode") roleCode: String, @Bind("effectiveFrom") effectiveFrom: String?,
        @Bind("effectiveTo") effectiveTo: String?, @Bind("reason") reason: String?, @Bind("actorUserId") actorUserId: String): String

    @SqlQuery("SELECT rbac_revoke_organization_role(:organizationId, :assignmentId, :actorUserId)")
    fun revokeOrganizationRole(@Bind("organizationId") organizationId: String, @Bind("assignmentId") assignmentId: String,
        @Bind("actorUserId") actorUserId: String): Boolean

    @SqlQuery("SELECT rbac_assign_platform_role(:userId, CAST(:effectiveFrom AS timestamp), CAST(:effectiveTo AS timestamp), :reason, :actorUserId)")
    fun assignPlatformRole(@Bind("userId") userId: String, @Bind("effectiveFrom") effectiveFrom: String?,
        @Bind("effectiveTo") effectiveTo: String?, @Bind("reason") reason: String?, @Bind("actorUserId") actorUserId: String): String

    @SqlQuery("SELECT rbac_revoke_platform_role(:assignmentId, :actorUserId)")
    fun revokePlatformRole(@Bind("assignmentId") assignmentId: String, @Bind("actorUserId") actorUserId: String): Boolean
}
