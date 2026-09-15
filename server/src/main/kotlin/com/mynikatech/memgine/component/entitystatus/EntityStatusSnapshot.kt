package com.mynikatech.memgine.component.entitystatus

import kotlinx.serialization.Serializable

@Serializable
data class StatusDto(
    val id: String,
    val statusCode: String,
    val statusName: String,
    val description: String? = null,
    val displayOrder: Int,
    val isActive: Boolean
)

@Serializable
data class EntityTypeDto(
    val id: String,
    val entityTypeCode: String,
    val entityTypeName: String,
    val description: String? = null,
    val displayOrder: Int,
    val isActive: Boolean
)

@Serializable
data class EntityStatusDto(
    val id: String,
    val entityTypeId: String,
    val statusId: String,
    val displayOrder: Int,
    val isActive: Boolean,
    val systemManaged: Boolean
)

@Serializable
data class EntityStatusSnapshot(
    val statuses: List<StatusDto> = emptyList(),
    val entityTypes: List<EntityTypeDto> = emptyList(),
    val entityStatuses: List<EntityStatusDto> = emptyList()
)