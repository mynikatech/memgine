package com.mynikatech.memgine.component.subscription

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.net.dto.OrgAdminSubscriptionDto

class SubscriptionService(private val sql: SubscriptionSql) {
    // Current Org Admin components use the development actor until request auth is wired.
    fun listForOrganization(organizationId: String, actorUserId: String): List<OrgAdminSubscriptionDto> {
        if (organizationId.isBlank() || organizationId.length > 40) {
            throw BadRequestException("Invalid organization id")
        }
        if (!sql.canAdminister(organizationId, actorUserId)) {
            throw ForbiddenException("Organization administration is not permitted")
        }
        return sql.listForOrganization(organizationId, actorUserId)
    }
}
