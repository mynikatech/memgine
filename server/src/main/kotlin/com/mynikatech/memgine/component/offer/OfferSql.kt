package com.mynikatech.memgine.component.offer

import com.mynikatech.memgine.net.dto.OfferDto
import com.mynikatech.memgine.net.dto.OfferUsageRuleDto
import com.mynikatech.memgine.net.dto.CanonicalProductRow
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.customizer.BindBean
import org.jdbi.v3.sqlobject.statement.SqlQuery
import org.jdbi.v3.sqlobject.kotlin.RegisterKotlinMapper

data class OfferSqlParams(
    val organizationId: String, val id: String, val offerCode: String,
    val offerName: String, val description: String?, val membershipProductId: String?,
    val storeId: String?, val promotionImageUrl: String, val badgeText: String?,
    val availabilityText: String?, val disclaimerText: String?, val ctaLabel: String, val ctaType: String,
    val ctaTarget: String?, val discountPercentage: Double?, val effectiveDate: String,
    val expiryDate: String?, val statusId: String, val versionNo: Int,
    val actorUserId: String, val create: Boolean
)

data class OfferRuleSqlParams(
    val organizationId: String, val offerId: String, val id: String,
    val ruleName: String, val frequencyType: String, val frequencyInterval: Int,
    val usageLimit: Int, val windowStartTime: String?, val windowEndTime: String?,
    val applicableDays: String?, val timeZone: String?, val effectiveDate: String,
    val expiryDate: String?, val statusId: String, val versionNo: Int,
    val actorUserId: String, val create: Boolean
)

interface OfferSql {
    @SqlQuery("SELECT * FROM get_offer_products(:organizationId)")
    @RegisterKotlinMapper(CanonicalProductRow::class)
    fun canonicalProducts(@Bind("organizationId") organizationId: String): List<CanonicalProductRow>

    @SqlQuery("SELECT save_offer_products(:organizationId, :offerId, :productIds, :actorUserId)")
    fun saveCanonicalProducts(@Bind("organizationId") organizationId: String,
                              @Bind("offerId") offerId: String,
                              @Bind("productIds") productIds: Array<String>,
                              @Bind("actorUserId") actorUserId: String): Boolean
    @SqlQuery("SELECT can_administer_organization(:organizationId, :actorUserId)")
    fun canAdminister(@Bind("organizationId") organizationId: String,
                      @Bind("actorUserId") actorUserId: String): Boolean

    @SqlQuery("SELECT * FROM get_organization_offers(:organizationId, :actorUserId)")
    @RegisterKotlinMapper(OfferDto::class)
    fun list(@Bind("organizationId") organizationId: String,
             @Bind("actorUserId") actorUserId: String): List<OfferDto>

    @SqlQuery("SELECT * FROM get_organization_offers(:organizationId, :actorUserId) WHERE id = :offerId")
    @RegisterKotlinMapper(OfferDto::class)
    fun get(@Bind("organizationId") organizationId: String,
            @Bind("offerId") offerId: String,
            @Bind("actorUserId") actorUserId: String): OfferDto?

    @SqlQuery("SELECT * FROM get_organization_offer_rules(:organizationId, :offerId, :actorUserId)")
    fun rules(@Bind("organizationId") organizationId: String,
              @Bind("offerId") offerId: String,
              @Bind("actorUserId") actorUserId: String): List<OfferUsageRuleDto>

    @SqlQuery("""SELECT save_organization_offer(
        :organizationId, :id, :offerCode, :offerName, :description,
        :membershipProductId, :storeId, :promotionImageUrl, :badgeText,
        :availabilityText, :disclaimerText, :ctaLabel, :ctaType, :ctaTarget,
        CAST(:discountPercentage AS numeric), CAST(:effectiveDate AS date),
        CAST(:expiryDate AS date), :statusId, :versionNo, :actorUserId, :create)""")
    fun save(@BindBean params: OfferSqlParams): Boolean

    @SqlQuery("""SELECT save_organization_offer_rule(
        :organizationId, :offerId, :id, :ruleName, :frequencyType,
        :frequencyInterval, :usageLimit, CAST(:windowStartTime AS time),
        CAST(:windowEndTime AS time), :applicableDays, :timeZone,
        CAST(:effectiveDate AS date), CAST(:expiryDate AS date), :statusId,
        :versionNo, :actorUserId, :create)""")
    fun saveRule(@BindBean params: OfferRuleSqlParams): Boolean

    @SqlQuery("SELECT delete_organization_offer_rule(:organizationId, :offerId, :ruleId, :versionNo, :actorUserId)")
    fun deleteRule(@Bind("organizationId") organizationId: String,
                   @Bind("offerId") offerId: String, @Bind("ruleId") ruleId: String,
                   @Bind("versionNo") versionNo: Int,
                   @Bind("actorUserId") actorUserId: String): Boolean

    @SqlQuery("SELECT delete_organization_offer(:organizationId, :offerId, :versionNo, :actorUserId)")
    fun delete(@Bind("organizationId") organizationId: String,
               @Bind("offerId") offerId: String, @Bind("versionNo") versionNo: Int,
               @Bind("actorUserId") actorUserId: String): Boolean
}
