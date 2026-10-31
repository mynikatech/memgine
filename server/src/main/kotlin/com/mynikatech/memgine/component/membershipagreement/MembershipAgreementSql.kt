package com.mynikatech.memgine.component.membershipagreement

import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery

/** All reads are scoped to the authenticated customer supplied by the server. */
interface MembershipAgreementSql {
    @SqlQuery("SELECT get_membership_terms(:organizationId)")
    fun terms(@Bind("organizationId") organizationId: String): String?

    @SqlQuery("SELECT get_customer_membership_agreements(:organizationId, :customerUserId)::text")
    fun history(@Bind("organizationId") organizationId: String,
                @Bind("customerUserId") customerUserId: String): String

    @SqlQuery("SELECT get_customer_membership_agreement(:organizationId, :customerUserId, :acceptanceId)::text")
    fun detail(@Bind("organizationId") organizationId: String,
               @Bind("customerUserId") customerUserId: String,
               @Bind("acceptanceId") acceptanceId: String): String?
}
