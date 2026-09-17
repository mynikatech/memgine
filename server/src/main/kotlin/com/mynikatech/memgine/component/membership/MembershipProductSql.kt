package com.mynikatech.memgine.component.membership

import com.mynikatech.memgine.net.dto.MembershipProductRowDto
import com.mynikatech.memgine.net.dto.SubscriptionPlanDto
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.customizer.BindBean
import org.jdbi.v3.sqlobject.statement.SqlQuery

data class MembershipProductSqlParams(
    val organizationId: String, val id: String, val membershipProductCode: String,
    val membershipProductName: String, val displayName: String?,
    val productCategoryId: String, val productTypeId: String,
    val tier: String?, val tierSequence: Int?, val description: String?,
    val productStatusId: String, val effectiveDate: String,
    val expiryDate: String?, val versionNo: Int,
    val actorUserId: String, val create: Boolean
)

data class SubscriptionPlanSqlParams(
    val organizationId: String, val membershipProductId: String,
    val id: String, val subscriptionPlanCode: String,
    val subscriptionPlanName: String, val description: String?,
    val subscriptionPeriod: Int, val subscriptionPeriodUnit: String,
    val price: Double, val currencyId: String,
    val subscriptionPlanStatusId: String, val effectiveDate: String,
    val expiryDate: String?, val versionNo: Int,
    val actorUserId: String, val create: Boolean
)

interface MembershipProductSql {
    @SqlQuery("SELECT EXISTS(SELECT 1 FROM product_categories WHERE product_category_id = :id AND is_active = true)")
    fun categoryExists(@Bind("id") id: String): Boolean

    @SqlQuery("SELECT EXISTS(SELECT 1 FROM product_types WHERE product_type_id = :id AND is_active = true)")
    fun typeExists(@Bind("id") id: String): Boolean

    @SqlQuery("SELECT EXISTS(SELECT 1 FROM currencies WHERE currency_id = :id AND is_active = true)")
    fun currencyExists(@Bind("id") id: String): Boolean

    @SqlQuery("""SELECT EXISTS(SELECT 1 FROM entity_status es
        JOIN entity_type et ON et.entity_type_id = es.entity_type_id
        WHERE es.entity_status_id = :id AND et.entity_type_code = :entityType
          AND es.is_active = true)""")
    fun statusExists(@Bind("entityType") entityType: String, @Bind("id") id: String): Boolean

    @SqlQuery("""SELECT EXISTS(SELECT 1 FROM benefits b
        JOIN entity_status es ON es.entity_status_id = b.benefit_status_id
        JOIN statuses s ON s.status_id = es.status_id
        WHERE b.benefit_id = :benefitId AND b.organization_id = :organizationId
          AND b.is_deleted = false AND s.status_code = 'ACTIVE')""")
    fun activeBenefitExists(@Bind("organizationId") organizationId: String,
                            @Bind("benefitId") benefitId: String): Boolean

    @SqlQuery("SELECT * FROM get_organization_membership_products(:organizationId)")
    fun list(@Bind("organizationId") organizationId: String): List<MembershipProductRowDto>

    @SqlQuery("SELECT * FROM get_organization_membership_products(:organizationId) WHERE id = :productId")
    fun get(@Bind("organizationId") organizationId: String,
            @Bind("productId") productId: String): MembershipProductRowDto?

    @SqlQuery("SELECT * FROM get_organization_subscription_plans(:organizationId, :productId)")
    fun plans(@Bind("organizationId") organizationId: String,
              @Bind("productId") productId: String): List<SubscriptionPlanDto>

    @SqlQuery("SELECT \"benefitId\" FROM get_organization_membership_benefit_ids(:organizationId, :productId)")
    fun benefitIds(@Bind("organizationId") organizationId: String,
                   @Bind("productId") productId: String): List<String>

    @SqlQuery("SELECT EXISTS(SELECT 1 FROM membership_products WHERE membership_product_code = :code AND membership_product_id <> :id)")
    fun codeInUse(@Bind("code") code: String, @Bind("id") id: String): Boolean

    @SqlQuery("SELECT EXISTS(SELECT 1 FROM subscription_plans WHERE subscription_plan_code = :code AND subscription_plan_id <> :id)")
    fun planCodeInUse(@Bind("code") code: String, @Bind("id") id: String): Boolean

    @SqlQuery("""SELECT save_organization_membership_product(
        :organizationId, :id, :membershipProductCode, :membershipProductName,
        :displayName, :productCategoryId, :productTypeId, :tier, :tierSequence,
        :description, :productStatusId, CAST(:effectiveDate AS date),
        CAST(:expiryDate AS date), :versionNo, :actorUserId, :create)""")
    fun save(@BindBean params: MembershipProductSqlParams): Boolean

    @SqlQuery("""SELECT save_organization_subscription_plan(
        :organizationId, :membershipProductId, :id, :subscriptionPlanCode,
        :subscriptionPlanName, :description, :subscriptionPeriod,
        :subscriptionPeriodUnit, CAST(:price AS numeric), :currencyId,
        :subscriptionPlanStatusId, CAST(:effectiveDate AS date),
        CAST(:expiryDate AS date), :versionNo, :actorUserId, :create)""")
    fun savePlan(@BindBean params: SubscriptionPlanSqlParams): Boolean

    @SqlQuery("SELECT delete_organization_subscription_plan(:organizationId, :productId, :planId, :actorUserId)")
    fun deletePlan(@Bind("organizationId") organizationId: String,
                   @Bind("productId") productId: String,
                   @Bind("planId") planId: String,
                   @Bind("actorUserId") actorUserId: String): Boolean

    @SqlQuery("SELECT assign_organization_membership_benefit(:organizationId, :productId, :benefitId, :sequence, :actorUserId)")
    fun assignBenefit(@Bind("organizationId") organizationId: String,
                      @Bind("productId") productId: String,
                      @Bind("benefitId") benefitId: String,
                      @Bind("sequence") sequence: Int,
                      @Bind("actorUserId") actorUserId: String): Boolean

    @SqlQuery("SELECT delete_organization_membership_benefit(:organizationId, :productId, :benefitId, :actorUserId)")
    fun deleteBenefit(@Bind("organizationId") organizationId: String,
                      @Bind("productId") productId: String,
                      @Bind("benefitId") benefitId: String,
                      @Bind("actorUserId") actorUserId: String): Boolean

    @SqlQuery("SELECT delete_organization_membership_product(:organizationId, :productId, :actorUserId)")
    fun delete(@Bind("organizationId") organizationId: String,
               @Bind("productId") productId: String,
               @Bind("actorUserId") actorUserId: String): Boolean
}
