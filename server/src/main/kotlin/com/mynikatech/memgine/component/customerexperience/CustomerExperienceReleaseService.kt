package com.mynikatech.memgine.component.customerexperience

import com.mynikatech.memgine.net.dto.CustomerExperienceReleaseDto
import kotlinx.serialization.json.Json

class CustomerExperienceReleaseService(
    private val sql: CustomerExperienceReleaseSql,
    private val json: Json = Json { ignoreUnknownKeys = true }
) {

    fun getPublished(
        organizationId: String
    ): CustomerExperienceReleaseDto? {
        return sql.getPublished(organizationId)?.toDto()
    }

    fun publish(
        organizationId: String,
        snapshotJson: String,
        publishedBy: String
    ): CustomerExperienceReleaseDto {
        return sql.publish(
            organizationId = organizationId,
            snapshotJson = snapshotJson,
            publishedBy = publishedBy
        ).toDto()
    }

    private fun CustomerExperienceReleaseRow.toDto() =
        CustomerExperienceReleaseDto(
            id = id,
            organizationId = organizationId,
            releaseNumber = releaseNumber,
            releaseStatus = releaseStatus,
            snapshot = json.parseToJsonElement(snapshotJson),
            publishedAt = publishedAt,
            publishedBy = publishedBy,
            createdAt = createdAt,
            createdBy = createdBy,
            versionNo = versionNo
        )
}