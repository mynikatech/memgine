package com.mynikatech.memgine.component.organization

import com.mynikatech.memgine.net.dto.CreateOrganizationResponseDto
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.kotlin.RegisterKotlinMapper
import org.jdbi.v3.sqlobject.statement.SqlQuery

@RegisterKotlinMapper(CreateOrganizationResponseDto::class)
interface OrganizationSql {

    @SqlQuery(
        """
        SELECT
            organization_id AS "organizationId",
            organization_details_id AS "organizationDetailsId",
            organization_branding_id AS "organizationBrandingId"
        FROM create_organization(
            CAST(:organizationJson AS jsonb),
            CAST(:detailsJson AS jsonb),
            CAST(:brandingJson AS jsonb),
            :actorUserId
        )
        """
    )
    fun createOrganization(
        @Bind("organizationJson") organizationJson: String,
        @Bind("detailsJson") detailsJson: String,
        @Bind("brandingJson") brandingJson: String,
        @Bind("actorUserId") actorUserId: String
    ): CreateOrganizationResponseDto

    @SqlQuery(
        """
        SELECT update_organization(
            :organizationId,
            CAST(:organizationJson AS jsonb),
            CAST(:detailsJson AS jsonb),
            CAST(:brandingJson AS jsonb),
            :actorUserId
        )
        """
    )
    fun updateOrganization(
        @Bind("organizationId") organizationId: String,
        @Bind("organizationJson") organizationJson: String?,
        @Bind("detailsJson") detailsJson: String?,
        @Bind("brandingJson") brandingJson: String?,
        @Bind("actorUserId") actorUserId: String
    ): Boolean
    
    @SqlQuery(
        """
        SELECT set_organization_lifecycle_status(
            :organizationId,
            :statusCode,
            :actorUserId
        )
        """
    )
    fun setOrganizationLifecycleStatus(
        @Bind("organizationId") organizationId: String,
        @Bind("statusCode") statusCode: String,
        @Bind("actorUserId") actorUserId: String
    ): String
    
    @SqlQuery("SELECT get_organization(:organizationId)::text")
        fun getOrganization(
            @Bind("organizationId") organizationId: String
        ): String?

        @SqlQuery("SELECT get_organizations()::text")
        fun getOrganizations(): String

        @SqlQuery("SELECT get_organization_details(:organizationId)::text")
        fun getOrganizationDetails(
            @Bind("organizationId") organizationId: String
        ): String?

        @SqlQuery("SELECT get_organization_branding(:organizationId)::text")
        fun getOrganizationBranding(
            @Bind("organizationId") organizationId: String
        ): String?

        @SqlQuery("SELECT get_organization_aggregate(:organizationId)::text")
        fun getOrganizationAggregate(
            @Bind("organizationId") organizationId: String
        ): String?
}