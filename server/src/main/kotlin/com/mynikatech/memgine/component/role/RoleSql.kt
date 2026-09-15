package com.mynikatech.memgine.component.role

import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery

interface RoleSql {
    @SqlQuery("SELECT can_administer_organization(:organizationId, :userId)")
    fun canAdministerOrganization(@Bind("organizationId") organizationId: String, @Bind("userId") userId: String): Boolean
}
