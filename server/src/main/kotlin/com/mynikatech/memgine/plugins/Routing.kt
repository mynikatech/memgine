package com.mynikatech.memgine.plugins

import com.mynikatech.memgine.component.asset.BrandingAssetService
import com.mynikatech.memgine.component.asset.brandingAssetRoutes
import com.mynikatech.memgine.component.entitystatus.EntityStatusService
import com.mynikatech.memgine.component.entitystatus.entityStatusRoutes
import com.mynikatech.memgine.component.organization.OrganizationService
import com.mynikatech.memgine.component.organization.OrganizationSql
import com.mynikatech.memgine.component.organization.organizationRoutes
import com.mynikatech.memgine.component.organizationuser.OrganizationUserService
import com.mynikatech.memgine.component.organizationuser.OrganizationUserSql
import com.mynikatech.memgine.component.organizationuser.organizationUserRoutes
import com.mynikatech.memgine.component.referencedata.ReferenceDataService
import com.mynikatech.memgine.component.referencedata.referenceDataRoutes
import com.mynikatech.memgine.component.staff.StaffService
import com.mynikatech.memgine.component.staff.StaffSql
import com.mynikatech.memgine.component.staff.staffRoutes
import com.mynikatech.memgine.component.store.StoreService
import com.mynikatech.memgine.component.store.StoreSql
import com.mynikatech.memgine.component.store.storeRoutes
import com.mynikatech.memgine.database.DatabaseContext
import com.mynikatech.memgine.model.common.ApiResponse
import io.ktor.server.application.Application
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.response.respond
import io.ktor.server.routing.get
import io.ktor.server.routing.route
import io.ktor.server.routing.routing

fun Application.configureRouting(
    database: DatabaseContext,
    referenceDataService: ReferenceDataService,
    entityStatusService: EntityStatusService,
    brandingAssetService: BrandingAssetService
) {
    val organizationService =
        OrganizationService(
            database.jdbi.onDemand(OrganizationSql::class.java)
        )

    val organizationUserService =
        OrganizationUserService(
            database.jdbi.onDemand(OrganizationUserSql::class.java)
        )

    val storeService =
        StoreService(
            database.jdbi.onDemand(StoreSql::class.java)
        )

    val staffService =
        StaffService(
            database.jdbi.onDemand(StaffSql::class.java)
        )

    routing {
        get("/health") {
            call.respond(
                ApiResponse.success(
                    mapOf("status" to "UP"),
                    call.callId
                )
            )
        }

        route("/api/v1") {
            organizationRoutes(organizationService)
            organizationUserRoutes(organizationUserService)

            // Batch 2A
            storeRoutes(storeService)
            brandingAssetRoutes(brandingAssetService)

            // Batch 2B
            staffRoutes(staffService)

            referenceDataRoutes(referenceDataService)
            entityStatusRoutes(entityStatusService)
        }
    }
}