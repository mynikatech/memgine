package com.mynikatech.memgine.component.benefit

import com.mynikatech.memgine.net.dto.BenefitDto
import com.mynikatech.memgine.net.dto.BenefitUsageRuleDto
import com.mynikatech.memgine.net.dto.CatalogProductDto
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.customizer.BindBean
import org.jdbi.v3.sqlobject.statement.SqlQuery

data class BenefitSqlParams(
    val organizationId: String, val id: String, val benefitCode: String,
    val benefitName: String, val displayName: String?, val benefitCategoryId: String,
    val benefitTypeId: String, val description: String?, val benefitStatusId: String,
    val productId: String?, val retailPrice: Double?, val cost: Double?,
    val effectiveDate: String, val expiryDate: String?, val actorUserId: String,
    val create: Boolean
)

data class RuleSqlParams(
    val organizationId: String, val benefitId: String, val id: String,
    val ruleName: String, val frequencyType: String, val frequencyInterval: Int,
    val usageLimit: Int, val windowStartTime: String?, val windowEndTime: String?,
    val applicableDays: String?, val timeZone: String?, val effectiveDate: String,
    val expiryDate: String?, val benefitUsageRuleStatusId: String,
    val actorUserId: String, val create: Boolean
)

interface BenefitSql {
    @SqlQuery("SELECT EXISTS(SELECT 1 FROM benefit_categories WHERE benefit_category_id = :id AND is_active = true)")
    fun categoryExists(@Bind("id") id: String): Boolean

    @SqlQuery("SELECT EXISTS(SELECT 1 FROM benefit_types WHERE benefit_type_id = :id AND is_active = true)")
    fun typeExists(@Bind("id") id: String): Boolean

    @SqlQuery("""SELECT EXISTS(SELECT 1 FROM entity_status es
        JOIN entity_type et ON et.entity_type_id = es.entity_type_id
        WHERE es.entity_status_id = :id AND et.entity_type_code = 'BENEFIT'
          AND es.is_active = true)""")
    fun benefitStatusExists(@Bind("id") id: String): Boolean
        @SqlQuery("""SELECT EXISTS(SELECT 1 FROM entity_status es
        JOIN entity_type et ON et.entity_type_id = es.entity_type_id
        WHERE es.entity_status_id = :id AND et.entity_type_code = 'BENEFIT_USAGE_RULE'
          AND es.is_active = true)""")
    fun benefitUsageRuleStatusExists(@Bind("id") id: String): Boolean

    @SqlQuery("SELECT EXISTS(SELECT 1 FROM benefits WHERE benefit_code = :code AND benefit_id <> :id)")
    fun codeInUse(@Bind("code") code: String, @Bind("id") id: String): Boolean
    @SqlQuery("SELECT * FROM get_membership_product_benefits(:membershipProductId)")
    fun byMembershipProduct(@Bind("membershipProductId") membershipProductId: String): List<BenefitDto>
    @SqlQuery("SELECT * FROM get_organization_products(:organizationId)")
    fun products(@Bind("organizationId") organizationId: String): List<CatalogProductDto>

    @SqlQuery("SELECT * FROM get_organization_benefits(:organizationId)")
    fun list(@Bind("organizationId") organizationId: String): List<BenefitDto>

    @SqlQuery("SELECT * FROM get_organization_benefits(:organizationId) WHERE id = :benefitId")
    fun get(@Bind("organizationId") organizationId: String,
            @Bind("benefitId") benefitId: String): BenefitDto?

    @SqlQuery("SELECT * FROM get_organization_benefit_rules(:organizationId, :benefitId)")
    fun rules(@Bind("organizationId") organizationId: String,
              @Bind("benefitId") benefitId: String): List<BenefitUsageRuleDto>

    @SqlQuery("""SELECT save_organization_benefit(
        :organizationId, :id, :benefitCode, :benefitName, :displayName,
        :benefitCategoryId, :benefitTypeId, :description, :benefitStatusId,
        :productId, CAST(:retailPrice AS numeric), CAST(:cost AS numeric),
        CAST(:effectiveDate AS date), CAST(:expiryDate AS date),
        :actorUserId, :create)""")
    fun save(@BindBean params: BenefitSqlParams): Boolean

    @SqlQuery("""SELECT save_organization_benefit_rule(
        :organizationId, :benefitId, :id, :ruleName, :frequencyType,
        :frequencyInterval, :usageLimit, CAST(:windowStartTime AS time),
        CAST(:windowEndTime AS time), :applicableDays, :timeZone,
        CAST(:effectiveDate AS date), CAST(:expiryDate AS date),
        :benefitUsageRuleStatusId, :actorUserId, :create)""")
    fun saveRule(@BindBean params: RuleSqlParams): Boolean

    @SqlQuery("SELECT delete_organization_benefit_rule(:organizationId, :benefitId, :ruleId, :actorUserId)")
    fun deleteRule(@Bind("organizationId") organizationId: String,
                   @Bind("benefitId") benefitId: String,
                   @Bind("ruleId") ruleId: String,
                   @Bind("actorUserId") actorUserId: String): Boolean

    @SqlQuery("SELECT delete_organization_benefit(:organizationId, :benefitId, :actorUserId)")
    fun delete(@Bind("organizationId") organizationId: String,
               @Bind("benefitId") benefitId: String,
               @Bind("actorUserId") actorUserId: String): Boolean
}
