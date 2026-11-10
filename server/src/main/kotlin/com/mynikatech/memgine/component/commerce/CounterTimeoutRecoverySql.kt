package com.mynikatech.memgine.component.commerce

import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery

/** No direct table writes: the SQL function locks and validates every transition. */
interface CounterTimeoutRecoverySql {
    @SqlQuery("""
        SELECT commerce_counter_timeout_recover(
            :organizationId, :transactionId, :storeId, :staffId,
            :actorUserId, :attemptId, :action, :confirmed)
    """)
    fun recover(
        @Bind("organizationId") organizationId: String,
        @Bind("transactionId") transactionId: String,
        @Bind("storeId") storeId: String,
        @Bind("staffId") staffId: String,
        @Bind("actorUserId") actorUserId: String,
        @Bind("attemptId") attemptId: String,
        @Bind("action") action: String,
        @Bind("confirmed") confirmed: Boolean
    ): String

    @SqlQuery("SELECT commerce_counter_timeout_cash_allowed(:transactionId, :actorUserId)")
    fun cashAllowed(
        @Bind("transactionId") transactionId: String,
        @Bind("actorUserId") actorUserId: String
    ): Boolean

    @SqlQuery("SELECT commerce_counter_terminal_attempt_recovered(:referenceId)")
    fun attemptRecovered(@Bind("referenceId") referenceId: String): Boolean
}
