package com.mynikatech.memgine.component.otp

import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery

data class BusinessOtpContextRow(
    var organizationId: String = "",
    var storeId: String? = null,
    var planId: String? = null,
    var subscriptionId: String? = null,
    var userId: String? = null,
    var staffId: String? = null,
    var normalizedPhone: String = "",
    var benefitIds: String? = null,
    var payload: String = "{}"
)

@RegisterBeanMapper(BusinessOtpContextRow::class)
interface BusinessOtpSql {
    @SqlQuery("""
        SELECT business_otp_create_context(
            :id, :challengeId, :purpose, :organizationId, :storeId, :planId,
            :subscriptionId, :userId, :staffId, :phone,
            CAST(:benefitIds AS jsonb), CAST(:payload AS jsonb)
        )
    """)
    fun create(
        @Bind("id") id: String,
        @Bind("challengeId") challengeId: String,
        @Bind("purpose") purpose: String,
        @Bind("organizationId") organizationId: String,
        @Bind("storeId") storeId: String?,
        @Bind("planId") planId: String?,
        @Bind("subscriptionId") subscriptionId: String?,
        @Bind("userId") userId: String?,
        @Bind("staffId") staffId: String?,
        @Bind("phone") phone: String,
        @Bind("benefitIds") benefitIds: String?,
        @Bind("payload") payload: String
    ): Boolean

    @SqlQuery("SELECT * FROM business_otp_resolve_context(:challengeId, :purpose)")
    fun resolve(
        @Bind("challengeId") challengeId: String,
        @Bind("purpose") purpose: String
    ): BusinessOtpContextRow?

    @SqlQuery("SELECT business_otp_consume_context(:challengeId, :purpose)")
    fun consume(
        @Bind("challengeId") challengeId: String,
        @Bind("purpose") purpose: String
    ): Boolean
}