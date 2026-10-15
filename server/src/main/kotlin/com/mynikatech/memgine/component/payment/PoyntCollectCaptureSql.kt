package com.mynikatech.memgine.component.payment

import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery

/** New Stage A capture-evidence access. Each call uses its own committed Jdbi operation. */
interface PoyntCollectCaptureSql {
    @SqlQuery("""SELECT payment_record_verified_collect_capture(
        :organizationId, :intentId, :actorUserId, :transactionId, :amountMinor, :currencyCode)""")
    fun recordVerifiedCapture(
        @Bind("organizationId") organizationId: String,
        @Bind("intentId") intentId: String,
        @Bind("actorUserId") actorUserId: String,
        @Bind("transactionId") transactionId: String,
        @Bind("amountMinor") amountMinor: Long,
        @Bind("currencyCode") currencyCode: String
    ): Boolean

    @SqlQuery("""SELECT payment_has_verified_collect_capture(
        :organizationId, :intentId, :actorUserId)""")
    fun hasVerifiedCapture(
        @Bind("organizationId") organizationId: String,
        @Bind("intentId") intentId: String,
        @Bind("actorUserId") actorUserId: String
    ): Boolean
}
