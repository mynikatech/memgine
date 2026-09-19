package com.mynikatech.memgine.net.dto

import kotlinx.serialization.Serializable

@Serializable data class RbacAssignOrganizationRoleRequest(
    val userId: String, val roleCode: String, val effectiveFrom: String? = null,
    val effectiveTo: String? = null, val reason: String? = null
)
@Serializable data class RbacAssignPlatformRoleRequest(
    val userId: String, val effectiveFrom: String? = null, val effectiveTo: String? = null,
    val reason: String? = null
)
@Serializable data class RbacRevokeRoleRequest(val reason: String? = null)
@Serializable data class RbacRoleDto(val roleId: String, val roleCode: String, val roleName: String, val description: String?)
@Serializable data class RbacCapabilityDto(val capabilityCode: String, val capabilityName: String, val description: String?)
@Serializable data class RbacAssignmentDto(val assignmentId: String, val organizationId: String?, val roleCode: String,
    val assignmentStatusId: String, val effectiveFrom: String, val effectiveTo: String?, val assignmentReason: String?)
@Serializable data class RbacEffectiveRoleDto(val roleId: String, val roleCode: String, val organizationId: String?)
@Serializable data class RbacEffectiveCapabilityDto(val capabilityCode: String, val organizationId: String?)
@Serializable data class RbacAssignmentResultDto(val assignmentId: String)
@Serializable data class RbacRevocationResultDto(val revoked: Boolean)
@Serializable data class RbacCheckResultDto(val allowed: Boolean)
