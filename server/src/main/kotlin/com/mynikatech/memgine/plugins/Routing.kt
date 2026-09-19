package com.mynikatech.memgine.plugins

import com.mynikatech.memgine.component.asset.BrandingAssetService
import com.mynikatech.memgine.component.benefit.BenefitService
import com.mynikatech.memgine.component.benefit.benefitRoutes
import com.mynikatech.memgine.component.membership.MembershipProductService
import com.mynikatech.memgine.component.membership.membershipProductRoutes
import com.mynikatech.memgine.component.offer.OfferService
import com.mynikatech.memgine.component.offer.offerRoutes
import com.mynikatech.memgine.component.subscription.SubscriptionService
import com.mynikatech.memgine.component.subscription.SubscriptionSql
import com.mynikatech.memgine.component.subscription.subscriptionRoutes
import com.mynikatech.memgine.component.redemption.RedemptionService
import com.mynikatech.memgine.component.redemption.RedemptionSql
import com.mynikatech.memgine.component.redemption.redemptionRoutes
import com.mynikatech.memgine.component.customer.CustomerService
import com.mynikatech.memgine.component.customer.CustomerSql
import com.mynikatech.memgine.component.customer.customerRoutes
import com.mynikatech.memgine.component.customer.customerSelfServiceRoutes
import com.mynikatech.memgine.component.counter.CounterService
import com.mynikatech.memgine.component.counter.counterRoutes
import com.mynikatech.memgine.component.notificationconfiguration.NotificationConfigurationService
import com.mynikatech.memgine.component.notificationconfiguration.notificationConfigurationRoutes
import com.mynikatech.memgine.component.integrationconfiguration.IntegrationConfigurationService
import com.mynikatech.memgine.component.integrationconfiguration.integrationConfigurationRoutes
import com.mynikatech.memgine.component.asset.brandingAssetRoutes
import com.mynikatech.memgine.component.customerexperience.customerExperienceReleaseRoutes
import com.mynikatech.memgine.component.customerexperience.CustomerExperienceReleaseService
import com.mynikatech.memgine.component.customerexperience.CustomerExperienceReleaseSql
import com.mynikatech.memgine.component.entitystatus.EntityStatusService
import com.mynikatech.memgine.component.entitystatus.entityStatusRoutes
import com.mynikatech.memgine.component.organization.OrganizationService
import com.mynikatech.memgine.component.organization.OrganizationSql
import com.mynikatech.memgine.component.organization.organizationRoutes
import com.mynikatech.memgine.component.organizationuser.OrganizationUserService
import com.mynikatech.memgine.component.organizationuser.OrganizationUserSql
import com.mynikatech.memgine.component.organizationuser.organizationUserRoutes
import com.mynikatech.memgine.component.organizationmaintenance.OrganizationMaintenanceService
import com.mynikatech.memgine.component.organizationmaintenance.OrganizationMaintenanceSql
import com.mynikatech.memgine.component.organizationmaintenance.organizationMaintenanceRoutes
import com.mynikatech.memgine.component.role.RbacService
import com.mynikatech.memgine.component.role.RbacSql
import com.mynikatech.memgine.component.role.rbacRoutes
import com.mynikatech.memgine.component.referencedata.ReferenceDataService
import com.mynikatech.memgine.component.referencedata.referenceDataRoutes
import com.mynikatech.memgine.component.staff.StaffService
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
    brandingAssetService: BrandingAssetService,
    customerDevIdentityEnabled: Boolean
) {
    val organizationService =
        OrganizationService(
            database.jdbi.onDemand(OrganizationSql::class.java)
        )

    val organizationUserService =
        OrganizationUserService(
            database.jdbi.onDemand(OrganizationUserSql::class.java)
        )
    val rbacService = RbacService(database.jdbi.onDemand(RbacSql::class.java))
    val organizationMaintenanceService =
        OrganizationMaintenanceService(
            database.jdbi.onDemand(OrganizationMaintenanceSql::class.java)
        )

    val storeService =
        StoreService(
            database.jdbi.onDemand(StoreSql::class.java)
        )

    val staffService =
        StaffService(
            database.jdbi
        )
    val benefitService = BenefitService(database.jdbi)
    val membershipProductService = MembershipProductService(database.jdbi)
    val offerService = OfferService(database.jdbi)
    val subscriptionService = SubscriptionService(database.jdbi.onDemand(SubscriptionSql::class.java))
    val redemptionService = RedemptionService(database.jdbi.onDemand(RedemptionSql::class.java))
    val customerService = CustomerService(database.jdbi.onDemand(CustomerSql::class.java),
        membershipProductService, benefitService, storeService, customerDevIdentityEnabled)
    val counterService = CounterService(database.jdbi)
    val notificationConfigurationService = NotificationConfigurationService(database.jdbi)
    val integrationConfigurationService = IntegrationConfigurationService(database.jdbi)
    val customerExperienceReleaseService =
    CustomerExperienceReleaseService(database.jdbi.onDemand(CustomerExperienceReleaseSql::class.java)
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
            rbacRoutes(rbacService, customerDevIdentityEnabled)
            organizationRoutes(organizationService)
            organizationUserRoutes(organizationUserService)
            organizationMaintenanceRoutes(organizationMaintenanceService)

            // Batch 2A
            storeRoutes(storeService)
            brandingAssetRoutes(brandingAssetService)

            // Batch 2B
            staffRoutes(staffService)
            benefitRoutes(benefitService)
            membershipProductRoutes(membershipProductService)
            offerRoutes(offerService)
            subscriptionRoutes(subscriptionService)
            redemptionRoutes(redemptionService)
            customerRoutes(customerService)
            customerSelfServiceRoutes(customerService)
            counterRoutes(counterService)
            notificationConfigurationRoutes(notificationConfigurationService)
            integrationConfigurationRoutes(integrationConfigurationService)
            customerExperienceReleaseRoutes(
                customerExperienceReleaseService
            )
            referenceDataRoutes(referenceDataService)
            entityStatusRoutes(entityStatusService)
        }
    }
}
