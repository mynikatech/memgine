package com.mynikatech.memgine.component.membershipagreement

import com.mynikatech.memgine.component.benefit.BenefitService
import com.mynikatech.memgine.component.customer.CustomerSql
import com.mynikatech.memgine.component.membership.MembershipProductService
import com.mynikatech.memgine.component.organization.OrganizationService
import com.mynikatech.memgine.component.payment.PaymentService
import com.mynikatech.memgine.component.store.StoreService
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.net.dto.AcceptMembershipAgreementDto
import com.mynikatech.memgine.net.dto.MembershipAgreementAcceptedDto
import com.mynikatech.memgine.net.dto.MembershipAgreementPreviewDto
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import java.util.UUID

/** All agreement text is generated from the authoritative backend. */
class MembershipAgreementOperations(
    private val sql: CustomerSql,
    private val membershipProducts: MembershipProductService,
    private val benefits: BenefitService,
    private val stores: StoreService,
    private val organizations: OrganizationService,
    private val payments: PaymentService,
) {
    private val json = Json { ignoreUnknownKeys = true }

    private fun validateCustomer(org: String, userId: String) {
        if (org.isBlank() || userId.isBlank() || (!sql.hasActiveRelationship(org, userId) && !sql.customerCanStartMembershipPurchase(org, userId))) {
            throw ForbiddenException("Customer relationship is required")
        }
    }

    /** Preserve restrictions exactly; only translate known rule codes to readable words. */
    private fun frequencyDescription(interval: Int, type: String): String {
        val period = when (type.uppercase()) {
            "DAILY" -> "day"
            "WEEKLY" -> "week"
            "MONTHLY" -> "month"
            "YEARLY", "ANNUALLY", "ANNUAL" -> "year"
            else -> return "every $interval ${type.lowercase().replace('_', ' ')} period"
        }
        return if (interval == 1) "per $period" else "every $interval ${period}s"
    }

    private fun applicableDaysText(raw: String?): String {
        if (raw.isNullOrBlank()) return "subject to the applicable schedule"
        val weekdays = mapOf("MON" to "Monday", "TUE" to "Tuesday", "WED" to "Wednesday",
            "THU" to "Thursday", "FRI" to "Friday", "SAT" to "Saturday", "SUN" to "Sunday")
        val codes = raw.split(',').map { it.trim().uppercase() }.filter { it.isNotEmpty() }
        if (codes.isEmpty() || codes.any { it !in weekdays }) return "on applicable days: $raw"
        if (codes.toSet() == weekdays.keys) return "every day"
        val names = codes.distinct().mapNotNull(weekdays::get)
        return "on ${names.joinToString(", ")}" 
    }

    fun preview(
        org: String, userId: String, planId: String, offerId: String? = null
    ): MembershipAgreementPreviewDto {
        validateCustomer(org, userId)
        if (planId.isBlank() || planId.length > 64) throw BadRequestException("Invalid plan")
        val product = membershipProducts.list(org).firstOrNull { candidate ->
            !candidate.isDeleted && candidate.plans.any { it.id == planId && !it.isDeleted }
        } ?: throw BadRequestException("Membership plan unavailable")
        val plan = product.plans.first { it.id == planId }
        // Also validates offer eligibility and computes customer-specific authoritative pricing.
        val quote = payments.quoteCustomerMembership(org, planId, userId, offerId)
        val organization = json.parseToJsonElement(organizations.get(org)).jsonObject
        val details = json.parseToJsonElement(organizations.getDetails(org)).jsonObject
        val organizationTerms = details["membershipTermsAndConditions"]?.jsonPrimitive?.contentOrNull.orEmpty()
        if (organizationTerms.isBlank()) throw BadRequestException("Membership terms have not been configured")
        val orgName = organization["displayName"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }
            ?: organization["name"]?.jsonPrimitive?.content.orEmpty()
        val allBenefits = benefits.list(org).filter { !it.isDeleted && it.id in product.benefitIds }
        val knownStores = stores.list(org).filter { !it.isDeleted }.associateBy { it.id }
        // Keep benefit information together: name, description, usage and disclaimer.
        // Do not repeat these details under a separate "Restrictions" section.
        val benefitLines = allBenefits.map { benefit ->
            val name = benefit.displayName ?: benefit.benefitName
            val lines = mutableListOf<String>()
            lines += name
            benefit.description?.trim()?.takeIf { it.isNotEmpty() }?.let { lines += it }
            benefits.rules(org, benefit.id)
                .filter { !it.isDeleted }
                .forEach { rule ->
                    val times = if (rule.usageLimit.toString() == "1") {
                        "Once"
                    } else {
                        "Up to ${rule.usageLimit} times"
                    }
                    val interval = rule.frequencyInterval.toString().toIntOrNull() ?: 1
                    val frequency = frequencyDescription(interval, rule.frequencyType.toString())
                    val days = applicableDaysText(rule.applicableDays)
                    lines += "$times $frequency, $days."
                }
            benefit.disclaimerText?.trim()?.takeIf { it.isNotEmpty() }?.let { disclaimer ->
                lines += "Please note: $disclaimer"
            }
            lines.joinToString(" — ")
        }

        // Store eligibility belongs to each benefit. Never imply that a Store
        // accepts every benefit simply because it accepts one of them.
        val storeLines = allBenefits.flatMap { benefit ->
            val availability = benefit.storeAvailability ?: return@flatMap emptyList<String>()
            val benefitName = benefit.displayName ?: benefit.benefitName
            val names = when (availability.mode.name) {
                "SELECTED_STORES" -> availability.storeIds
                    .mapNotNull { knownStores[it]?.name }
                "ALL_STORES" -> knownStores.values.map { it.name }
                else -> emptyList()
            }
            names.distinct().sorted().map { name -> "$name — $benefitName" }
        }.distinct()

        val document = MembershipAgreementDocumentRenderer.render(
            MembershipAgreementDetails(
                organizationName = orgName,
                membershipName = product.displayName ?: product.membershipProductName,
                planName = plan.subscriptionPlanName,
                priceDisplay = "${quote.currencyCode} ${"%.2f".format(java.util.Locale.US, quote.totalAmount)} (including applicable tax and offer adjustments)",
                durationDisplay = "${plan.subscriptionPeriod} ${plan.subscriptionPeriodUnit}",
                benefits = benefitLines,
                eligibleStores = storeLines,
                organizationTerms = organizationTerms
            )
        )
        return MembershipAgreementPreviewDto(org, product.id, planId, document.text, document.sha256)
    }

    fun accept(
        org: String,
        userId: String,
        request: AcceptMembershipAgreementDto,
        counterStoreId: String? = null,
        counterStaffId: String? = null,
        counterActorUserId: String? = null
    ): MembershipAgreementAcceptedDto {
        validateCustomer(org, userId)
        if (request.idempotencyKey.isBlank() || request.idempotencyKey.length > 160 ||
            request.agreementSha256.length != 64 ||
            request.acceptanceChannel !in setOf("CUSTOMER_WEB", "CUSTOMER_MOBILE", "COUNTER_CUSTOMER")) {
            throw BadRequestException("Invalid membership agreement acceptance")
        }
        val preview = preview(org, userId, request.planId, request.explicitOfferId)
        if (preview.agreementSha256 != request.agreementSha256) {
            throw ConflictException("Membership agreement or pricing changed; read the updated agreement")
        }
        if (request.acceptanceChannel == "COUNTER_CUSTOMER" &&
            (counterStoreId.isNullOrBlank() ||
                counterStaffId.isNullOrBlank() ||
                counterActorUserId.isNullOrBlank())
        ) {
            throw BadRequestException("Counter acceptance must include an authorized Store and staff")
        }
        val snapshot = buildJsonObject {
            put("planId", request.planId)
            put("explicitOfferId", request.explicitOfferId ?: "")
            put("renderVersion", 1)

            if (request.acceptanceChannel == "COUNTER_CUSTOMER") {
                put("counterStoreId", counterStoreId!!)
                put("counterStaffId", counterStaffId!!)
                put("counterActorUserId", counterActorUserId!!)
                put("consentMethod", "CUSTOMER_TAPPED_COUNTER_SCREEN")
            }
        }.toString()
        val stored = sql.recordMembershipAgreementAcceptance(
            UUID.randomUUID().toString(), org, userId, preview.membershipProductId,
            request.idempotencyKey, request.acceptanceChannel, preview.agreementText,
            preview.agreementSha256, snapshot
        ) ?: throw ConflictException("Agreement acceptance could not be saved")
        val accepted = json.decodeFromString<MembershipAgreementAcceptedDto>(stored)
        if (accepted.customerUserId != userId || accepted.agreementSha256 != preview.agreementSha256 ||
            accepted.membershipProductId != preview.membershipProductId) {
            throw ConflictException("The saved purchase agreement differs from this purchase")
        }
        return accepted
    }

    fun requireAccepted(org: String, userId: String, planId: String, key: String, offerId: String? = null) {
        validateCustomer(org, userId)
        if (sql.customerExistingMembershipPayment(org, userId, planId, key)) return
        val currentHash = preview(org, userId, planId, offerId).agreementSha256
        if (!sql.customerHasMembershipAgreement(org, userId, planId, key, offerId, currentHash)) {
            throw BadRequestException("Accept the membership agreement before starting payment")
        }
    }

    fun history(org: String, userId: String): List<MembershipAgreementAcceptedDto> {
        // Ownership comes from the authenticated principal, and SQL scopes each
        // row to that user. Access survives expiration or cancellation.
        if (org.isBlank() || userId.isBlank()) throw BadRequestException("Invalid agreement history request")
        return json.decodeFromString(sql.customerMembershipAgreements(org, userId))
    }
}
