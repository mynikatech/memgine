package com.mynikatech.memgine.component.subscription

import com.mynikatech.memgine.net.dto.OrgAdminSubscriptionDto
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery

interface SubscriptionSql {
    @SqlQuery("SELECT can_administer_organization(:organizationId, :actorUserId)")
    fun canAdminister(@Bind("organizationId") organizationId: String,
                      @Bind("actorUserId") actorUserId: String): Boolean

    @SqlQuery("SELECT * FROM get_organization_subscriptions_admin(:organizationId, :actorUserId)")
    fun listForOrganization(@Bind("organizationId") organizationId: String,
                            @Bind("actorUserId") actorUserId: String): List<OrgAdminSubscriptionDto>
}
