package com.mynikatech.memgine.net.dto

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

@Serializable
data class PublishCustomerExperienceReleaseRequest(
    val snapshot: JsonElement,
    val publishedBy: String,
)

@Serializable
data class CustomerExperienceReleaseDto(
    val id: String,
    val organizationId: String,
    val releaseNumber: Int,
    val releaseStatus: String,
    val snapshot: JsonElement,
    val publishedAt: String,
    val publishedBy: String,
    val createdAt: String,
    val createdBy: String,
    val versionNo: Int,
)

@Serializable
data class PublishedCustomerExperienceReleaseResponse(
    val release: CustomerExperienceReleaseDto?,
)