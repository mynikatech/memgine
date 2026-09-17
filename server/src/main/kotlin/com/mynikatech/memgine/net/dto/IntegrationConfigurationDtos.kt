package com.mynikatech.memgine.net.dto

import kotlinx.serialization.Serializable

@Serializable
data class IntegrationConfigurationDto(
    val id: String, val organizationId: String, val integrationName: String,
    val integrationTypeId: String, val provider: String,
    val integrationStatusId: String, val createdAt: String,
    val createdBy: String, val updatedAt: String? = null,
    val updatedBy: String? = null, val isDeleted: Boolean, val versionNo: Int
)

@Serializable
data class IntegrationConfigurationWriteDto(
    val id: String, val integrationName: String, val integrationTypeId: String,
    val provider: String, val integrationStatusId: String, val versionNo: Int
)

@Serializable
data class DeleteIntegrationConfigurationDto(val id: String, val deleted: Boolean)
