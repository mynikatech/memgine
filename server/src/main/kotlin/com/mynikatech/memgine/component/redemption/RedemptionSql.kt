package com.mynikatech.memgine.component.redemption

import com.mynikatech.memgine.net.dto.OrgAdminRedemptionDto
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery

interface RedemptionSql {
    @SqlQuery("SELECT can_administer_organization(:organizationId, :actorUserId)")
    fun canAdminister(@Bind("organizationId") organizationId: String,
                      @Bind("actorUserId") actorUserId: String): Boolean

    @SqlQuery("SELECT * FROM get_organization_redemptions_admin(:organizationId, :actorUserId)")
    fun listForOrganization(@Bind("organizationId") organizationId: String,
                            @Bind("actorUserId") actorUserId: String): List<OrgAdminRedemptionDto>
}
