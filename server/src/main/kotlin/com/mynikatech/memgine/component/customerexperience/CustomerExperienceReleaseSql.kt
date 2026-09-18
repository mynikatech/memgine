package com.mynikatech.memgine.component.customerexperience

import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery

interface CustomerExperienceReleaseSql {

    @SqlQuery(
        """
        SELECT *
        FROM get_published_customer_experience_release(:organizationId)
        """
    )
    @RegisterBeanMapper(CustomerExperienceReleaseRow::class)
    fun getPublished(
        @Bind("organizationId") organizationId: String
    ): CustomerExperienceReleaseRow?

    @SqlQuery(
        """
        SELECT *
        FROM publish_customer_experience_release(
            :organizationId,
            CAST(:snapshotJson AS jsonb),
            :publishedBy
        )
        """
    )
    @RegisterBeanMapper(CustomerExperienceReleaseRow::class)
    fun publish(
        @Bind("organizationId") organizationId: String,
        @Bind("snapshotJson") snapshotJson: String,
        @Bind("publishedBy") publishedBy: String
    ): CustomerExperienceReleaseRow
}

data class CustomerExperienceReleaseRow(
    var id: String = "",
    var organizationId: String = "",
    var releaseNumber: Int = 0,
    var releaseStatus: String = "",
    var snapshotJson: String = "{}",
    var publishedAt: String = "",
    var publishedBy: String = "",
    var createdAt: String = "",
    var createdBy: String = "",
    var versionNo: Int = 1
)