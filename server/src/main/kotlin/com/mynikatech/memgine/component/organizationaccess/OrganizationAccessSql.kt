package com.mynikatech.memgine.component.organizationaccess

import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery

interface OrganizationAccessSql {
    @SqlQuery("SELECT CAST(organization_access_list(:org, :actor) AS text)")
    fun list(@Bind("org") org: String, @Bind("actor") actor: String): String

    @SqlQuery("SELECT organization_access_set_org_admin(:org, :organizationUserId, :enabled, :actor)")
    fun setOrgAdmin(@Bind("org") org: String, @Bind("organizationUserId") organizationUserId: String,
                    @Bind("enabled") enabled: Boolean, @Bind("actor") actor: String): Boolean

    @SqlQuery("SELECT organization_access_set_membership_active(:org, :organizationUserId, :active, :actor)")
    fun setMembership(@Bind("org") org: String, @Bind("organizationUserId") organizationUserId: String,
                      @Bind("active") active: Boolean, @Bind("actor") actor: String): Boolean

    @SqlQuery("SELECT organization_access_set_counter_operator(:org, :organizationUserId, CAST(:payload AS jsonb), :actor)")
    fun setCounterOperator(@Bind("org") org: String, @Bind("organizationUserId") organizationUserId: String,
                           @Bind("payload") payload: String, @Bind("actor") actor: String): String?

    @SqlQuery("SELECT organization_access_set_stores(:org, :organizationUserId, :primaryStoreId, CAST(:additionalStoreIds AS jsonb), :actor)")
    fun setStores(@Bind("org") org: String, @Bind("organizationUserId") organizationUserId: String,
                  @Bind("primaryStoreId") primaryStoreId: String?,
                  @Bind("additionalStoreIds") additionalStoreIds: String,
                  @Bind("actor") actor: String): Boolean

    @SqlQuery("SELECT organization_access_staff_id(:org, :organizationUserId, :actor)")
    fun staffId(@Bind("org") org: String, @Bind("organizationUserId") organizationUserId: String,
                @Bind("actor") actor: String): String
}

