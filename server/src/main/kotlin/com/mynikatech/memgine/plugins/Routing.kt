package com.mynikatech.memgine.plugins

import com.mynikatech.memgine.component.asset.BrandingAssetService
import com.mynikatech.memgine.component.benefit.BenefitService
import com.mynikatech.memgine.component.benefit.benefitRoutes
import com.mynikatech.memgine.component.product.OrganizationProductService
import com.mynikatech.memgine.component.product.organizationProductRoutes
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
import com.mynikatech.memgine.component.payment.PaymentService
import com.mynikatech.memgine.component.payment.PoyntCollectPaymentProvider
import com.mynikatech.memgine.component.payment.paymentRoutes
import com.mynikatech.memgine.component.notificationconfiguration.NotificationConfigurationService
import com.mynikatech.memgine.component.notificationconfiguration.notificationConfigurationRoutes
import com.mynikatech.memgine.component.notification.NotificationService
import com.mynikatech.memgine.component.notification.NotificationSql
import com.mynikatech.memgine.component.notification.notificationRoutes
import com.mynikatech.memgine.component.notification.NotificationDispatchService
import com.mynikatech.memgine.component.notification.NotificationDispatchSql
import com.mynikatech.memgine.component.notification.SnsExternalNotificationPublisher
import com.mynikatech.memgine.component.notification.UnavailableExternalNotificationPublisher
import com.mynikatech.memgine.component.integrationconfiguration.IntegrationConfigurationService
import com.mynikatech.memgine.component.integrationconfiguration.integrationConfigurationRoutes
import com.mynikatech.memgine.component.commerce.CommerceService
import com.mynikatech.memgine.component.commerce.CounterCommercePaymentService
import com.mynikatech.memgine.component.commerce.CommerceSql
import com.mynikatech.memgine.component.commerce.commerceRoutes
import com.mynikatech.memgine.component.commerce.poyntPaymentBridgeCallbackRoutes
import com.mynikatech.memgine.component.commerce.CommerceProviderRegistry
import com.mynikatech.memgine.component.commerce.CommercePaymentProviderPolicy
import com.mynikatech.memgine.component.commerce.CommerceRemotePaymentConfiguration
import com.mynikatech.memgine.component.commerce.PlatformPoyntPaymentService
import com.mynikatech.memgine.component.commerce.PlatformPoyntPaymentSql
import com.mynikatech.memgine.component.commerce.PlatformPoyntTerminalBindingService
import com.mynikatech.memgine.component.commerce.PlatformPoyntTerminalBindingSql
import com.mynikatech.memgine.component.commerce.OrganizationPoyntTerminalBindingService
import com.mynikatech.memgine.component.commerce.OrganizationPoyntTerminalBindingSql
import com.mynikatech.memgine.component.commerce.PoyntTerminalBindingLookup
import com.mynikatech.memgine.component.commerce.SqlPoyntTerminalBindingResolver
import com.mynikatech.memgine.component.commerce.platformPoyntPaymentRoutes
import com.mynikatech.memgine.component.commerce.organizationPoyntPaymentSummaryRoutes
import com.mynikatech.memgine.component.commerce.provider.poynt.*
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
import com.mynikatech.memgine.component.organizationaccess.OrganizationAccessService
import com.mynikatech.memgine.component.organizationaccess.OrganizationAccessSql
import com.mynikatech.memgine.component.organizationaccess.organizationAccessRoutes
import com.mynikatech.memgine.component.organizationmaintenance.OrganizationMaintenanceService
import com.mynikatech.memgine.component.organizationmaintenance.OrganizationMaintenanceSql
import com.mynikatech.memgine.component.organizationmaintenance.organizationMaintenanceRoutes
import com.mynikatech.memgine.component.commerce.counterRedemptionCheckoutRoutes
import com.mynikatech.memgine.component.auth.AuthenticationService
import com.mynikatech.memgine.component.auth.AuthenticationSql
import com.mynikatech.memgine.component.auth.authenticationRoutes
import com.mynikatech.memgine.component.otp.*
import com.mynikatech.memgine.component.pos.PosAuthenticationService
import com.mynikatech.memgine.component.pos.PosAuthenticationSql
import com.mynikatech.memgine.component.pos.posAuthenticationRoutes
import com.mynikatech.memgine.component.poynt.PoyntTerminalService
import com.mynikatech.memgine.component.poynt.PoyntTerminalSql
import com.mynikatech.memgine.component.poynt.poyntTerminalRoutes
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
import com.mynikatech.memgine.config.AppConfig
import com.mynikatech.memgine.security.PhoneNormalizer
import com.mynikatech.memgine.security.installAuthenticationGate
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
    config: AppConfig
) {
    val customerDevIdentityEnabled = config.server.environment in setOf("local", "dev", "development")
    val phoneNormalizer = PhoneNormalizer()
    val mockOtpProvider = config.server.environment
        .takeIf { it in setOf("local", "dev", "development") }
        ?.let(::DevOtpProvider)
    val liveOtpProvider = config.otp.awsRegion.takeIf(String::isNotBlank)
        ?.let { AwsEndUserMessagingSmsProvider(config.otp) }
    val notificationService = NotificationService(database.jdbi.onDemand(NotificationSql::class.java))
    val notificationDispatchService = NotificationDispatchService(
        database.jdbi.onDemand(NotificationDispatchSql::class.java), notificationService,
        config.otp.notificationEventsTopicArn.takeIf { it.isNotBlank() }?.let(::SnsExternalNotificationPublisher)
            ?: UnavailableExternalNotificationPublisher()
    )
    val otpService = OtpService(database.jdbi.onDemand(OtpSql::class.java), phoneNormalizer,
        OtpProviderRouter(config.otp, mockOtpProvider, liveOtpProvider), config.otp, notificationDispatchService)
    val businessOtpService = BusinessOtpService(otpService, database.jdbi.onDemand(BusinessOtpSql::class.java))
    val authenticationService = AuthenticationService(
        database.jdbi.onDemand(AuthenticationSql::class.java), otpService,
        phoneNormalizer, config.authentication
    )
    val posAuthenticationService = PosAuthenticationService(
        database.jdbi.onDemand(PosAuthenticationSql::class.java), authenticationService, config.authentication
    )
    val poyntTerminalService = PoyntTerminalService(
        database.jdbi.onDemand(PoyntTerminalSql::class.java), posAuthenticationService
    )
    installAuthenticationGate(authenticationService, config.authentication)
    val organizationService =
        OrganizationService(
            database.jdbi.onDemand(OrganizationSql::class.java), phoneNormalizer
        )

    val organizationUserService =
        OrganizationUserService(
            database.jdbi.onDemand(OrganizationUserSql::class.java)
        )
    val organizationAccessService = OrganizationAccessService(
        database.jdbi.onDemand(OrganizationAccessSql::class.java),
        posAuthenticationService,
        config.server.environment
    )
    val rbacService = RbacService(database.jdbi.onDemand(RbacSql::class.java))
    val organizationMaintenanceService =
        OrganizationMaintenanceService(
            database.jdbi.onDemand(OrganizationMaintenanceSql::class.java), phoneNormalizer
        )

    val storeService =
        StoreService(
            database.jdbi.onDemand(StoreSql::class.java)
        )

    val staffService =
        StaffService(
            database.jdbi, phoneNormalizer
        )
    val benefitService = BenefitService(database.jdbi)
    val organizationProductService = OrganizationProductService(database.jdbi)
    val membershipProductService = MembershipProductService(database.jdbi)
    val offerService = OfferService(database.jdbi)
    val subscriptionService = SubscriptionService(database.jdbi.onDemand(SubscriptionSql::class.java))
    val redemptionService = RedemptionService(database.jdbi.onDemand(RedemptionSql::class.java))
    val notificationConfigurationService = NotificationConfigurationService(database.jdbi)
    val integrationConfigurationService = IntegrationConfigurationService(database.jdbi)
    val poyntCredentials = AwsSecretsManagerPoyntCredentialResolver(config.poynt.secretsRegion)
    val poyntTokens = PoyntTokenService(
        poyntCredentials,
        PoyntCloudTokenTransport(config.poynt.cloudBaseUrl, config.poynt.apiVersion),
        config.poynt.jwtAudience
    )
    val poyntCommerceSql = database.jdbi.onDemand(PoyntCommerceSql::class.java)
    val poyntHttpTransport = PoyntCloudHttpTransport(config.poynt.cloudBaseUrl, config.poynt.apiVersion)
    val collectTokens = PoyntTokenService(
        AwsSecretsManagerPoyntCredentialResolver(config.poynt.secretsRegion),
        PoyntCloudTokenTransport(config.poynt.collectBaseUrl, config.poynt.apiVersion),
        config.poynt.jwtAudience
    )
    val collectProvider = PoyntCollectPaymentProvider(
        config.poynt.collectBaseUrl,
        PoyntCloudHttpTransport(config.poynt.collectBaseUrl, config.poynt.apiVersion),
        collectTokens::token
    )
    val paymentService = PaymentService(database.jdbi, config.server.environment, config.payment,
        collectProvider = collectProvider, collectSdkUrl = config.poynt.collectSdkUrl)
    val customerService = CustomerService(database.jdbi.onDemand(CustomerSql::class.java),
        membershipProductService, benefitService, storeService, customerDevIdentityEnabled, businessOtpService, paymentService)
    val poyntCommerceProvider = PoyntCommerceProvider(
        poyntCommerceSql,
        PoyntAuthenticatedCatalogClient(poyntHttpTransport, poyntTokens),
        PoyntAuthenticatedOrderClient(poyntHttpTransport, poyntTokens),
        PoyntSqlCheckoutConfigurationResolver(poyntCommerceSql),
        PoyntPaymentBridgeClient(poyntHttpTransport, poyntTokens)
    )
    val commerceProviders = CommerceProviderRegistry(listOf(poyntCommerceProvider))
    val remotePaymentConfiguration = CommerceRemotePaymentConfiguration(
        config.poynt.paymentBridgeCallbackUrl,
        config.poynt.paymentBridgeCallbackHeaderName,
        config.poynt.paymentBridgeCallbackHeaderValue,
        config.poynt.paymentBridgeTtlSeconds
    )
    val poyntTerminalBindingResolver = SqlPoyntTerminalBindingResolver(
        database.jdbi.onDemand(PoyntTerminalBindingLookup::class.java)
    )
    val counterCommercePaymentService = CounterCommercePaymentService(
        database.jdbi,
        commerceProviders,
        remotePaymentConfiguration,
        poyntTerminalBindingResolver,
        testProviderEnabled =
            config.server.environment in setOf("local", "dev", "development")
    )
    val counterService = CounterService(
        database.jdbi,
        businessOtpService,
        paymentService,
        counterCommercePaymentService,
        redemptionService,
        phoneNormalizer
    )
    val commerceService = CommerceService(
        database.jdbi.onDemand(CommerceSql::class.java),
        commerceProviders,
        remotePaymentConfiguration,
        CommercePaymentProviderPolicy(config.server.environment),
        poyntTerminalBindingResolver
    )
    val platformPoyntPaymentService = PlatformPoyntPaymentService(
        database.jdbi.onDemand(PlatformPoyntPaymentSql::class.java),
        poyntCredentials,
        poyntTokens
    )
    val platformPoyntTerminalBindingService = PlatformPoyntTerminalBindingService(
        database.jdbi.onDemand(PlatformPoyntTerminalBindingSql::class.java)
    )
    val organizationPoyntTerminalBindingService = OrganizationPoyntTerminalBindingService(
        database.jdbi.onDemand(OrganizationPoyntTerminalBindingSql::class.java)
    )
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
            authenticationRoutes(authenticationService, config.authentication)
            posAuthenticationRoutes(posAuthenticationService, config.authentication)
            poyntTerminalRoutes(poyntTerminalService)
            rbacRoutes(rbacService, customerDevIdentityEnabled)
            organizationRoutes(organizationService)
            organizationUserRoutes(organizationUserService)
            organizationAccessRoutes(organizationAccessService)
            organizationMaintenanceRoutes(organizationMaintenanceService)
            platformPoyntPaymentRoutes(platformPoyntPaymentService, platformPoyntTerminalBindingService)
            organizationPoyntPaymentSummaryRoutes(platformPoyntPaymentService, organizationPoyntTerminalBindingService)

            // Batch 2A
            storeRoutes(storeService)
            brandingAssetRoutes(brandingAssetService)

            // Batch 2B
            staffRoutes(staffService)
            benefitRoutes(benefitService)
            organizationProductRoutes(organizationProductService)
            membershipProductRoutes(membershipProductService)
            offerRoutes(offerService)
            subscriptionRoutes(subscriptionService)
            redemptionRoutes(redemptionService)
            customerRoutes(customerService)
            customerSelfServiceRoutes(customerService, redemptionService)
            counterRoutes(counterService)
            counterRedemptionCheckoutRoutes(counterCommercePaymentService)
            paymentRoutes(paymentService)
            notificationConfigurationRoutes(notificationConfigurationService)
            notificationRoutes(notificationService)
            integrationConfigurationRoutes(integrationConfigurationService)
            commerceRoutes(commerceService)
            poyntPaymentBridgeCallbackRoutes(
                commerceService,
                counterCommercePaymentService,
                config.poynt.paymentBridgeCallbackHeaderName,
                config.poynt.paymentBridgeCallbackHeaderValue
            )
            customerExperienceReleaseRoutes(
                customerExperienceReleaseService
            )
            referenceDataRoutes(referenceDataService)
            entityStatusRoutes(entityStatusService)
        }
    }
}
