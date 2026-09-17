package com.mynikatech.memgine.component.offer

import com.mynikatech.memgine.exception.ApiException
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.exception.NotFoundException
import com.mynikatech.memgine.net.dto.*
import org.jdbi.v3.core.Jdbi
import org.postgresql.util.PSQLException
import java.time.LocalDate
import java.time.LocalTime

class OfferService(private val jdbi: Jdbi) {
    private val actorUserId = "user-org-admin"

    fun list(organizationId: String): List<OfferDto> {
        validateId(organizationId, 40)
        requireOrganizationAdmin(organizationId)
        return jdbi.onDemand(OfferSql::class.java).list(organizationId, actorUserId)
    }

    fun get(organizationId: String, offerId: String): OfferDto {
        validateId(organizationId, 40)
        validateId(offerId, 40)
        requireOrganizationAdmin(organizationId)
        return jdbi.onDemand(OfferSql::class.java).get(organizationId, offerId, actorUserId)
            ?: throw NotFoundException("Offer not found")
    }

    fun rules(organizationId: String, offerId: String): List<OfferUsageRuleDto> {
        get(organizationId, offerId)
        return jdbi.onDemand(OfferSql::class.java).rules(organizationId, offerId, actorUserId)
    }

    fun save(organizationId: String, request: OfferWriteDto, create: Boolean): OfferBundleDto {
        validateId(organizationId, 40)
        validateId(request.id, 40)
        if (request.offerCode.isBlank() || request.offerCode.length > 50 ||
            request.offerName.isBlank() || request.offerName.length > 150 ||
            (request.description?.length ?: 0) > 1000 ||
            request.promotionImageUrl.isBlank() || request.promotionImageUrl.length > 500 ||
            request.promotionImageUrl.startsWith("data:") ||
            (request.badgeText?.length ?: 0) > 50 ||
            (request.availabilityText?.length ?: 0) > 100 ||
            request.ctaLabel.isBlank() || request.ctaLabel.length > 50 ||
            request.ctaType !in setOf("REDEEM_OFFER", "SHOP") ||
            (request.ctaTarget?.length ?: 0) > 500 ||
            (request.discountPercentage != null &&
                (request.discountPercentage <= 0 || request.discountPercentage > 100)) ||
            request.versionNo < 1) {
            throw BadRequestException("Invalid Offer fields")
        }
        validateDates(request.effectiveDate, request.expiryDate)
        if (!request.promotionImageUrl.startsWith("/api/v1/assets/organizations/$organizationId/") &&
            !request.promotionImageUrl.startsWith("https://") &&
            !request.promotionImageUrl.startsWith("http://")) {
            throw BadRequestException("Offer image must be an organization asset or HTTP URL")
        }
        request.membershipProductId?.let { validateId(it, 40) }
        request.storeId?.let { validateId(it, 40) }
        if (request.rules.map { it.id }.distinct().size != request.rules.size) {
            throw BadRequestException("Duplicate Offer Usage Rule id")
        }
        request.rules.forEach { rule ->
            validateId(rule.id, 40)
            if (rule.ruleName.isBlank() || rule.ruleName.length > 100 ||
                rule.frequencyType !in setOf("DAILY", "WEEKLY", "MONTHLY", "YEARLY", "ONE_TIME") ||
                rule.frequencyInterval < 1 || rule.usageLimit < 1 ||
                (rule.applicableDays?.length ?: 0) > 100 ||
                (rule.timeZone?.length ?: 0) > 100 || rule.versionNo < 1) {
                throw BadRequestException("Invalid Offer Usage Rule fields")
            }
            validateDates(rule.effectiveDate, rule.expiryDate)
            val start = validateTime(rule.windowStartTime)
            val end = validateTime(rule.windowEndTime)
            if (start != null && end != null && !end.isAfter(start)) {
                throw BadRequestException("Offer Usage Rule end time must follow start time")
            }
        }

        return try {
            jdbi.inTransaction<OfferBundleDto, Exception> { handle ->
                val sql = handle.attach(OfferSql::class.java)
                val existing = sql.get(organizationId, request.id, actorUserId)
                if (create && existing != null) throw ConflictException("Offer already exists")
                if (!create && existing == null) throw NotFoundException("Offer not found")
                val oldRules = if (create) emptyList() else sql.rules(organizationId, request.id, actorUserId)
                sql.save(OfferSqlParams(
                    organizationId, request.id, request.offerCode, request.offerName,
                    request.description, request.membershipProductId, request.storeId,
                    request.promotionImageUrl, request.badgeText, request.availabilityText,
                    request.ctaLabel, request.ctaType, request.ctaTarget,
                    request.discountPercentage, request.effectiveDate, request.expiryDate,
                    request.statusId, request.versionNo, actorUserId, create
                ))
                val oldIds = oldRules.map { it.id }.toSet()
                request.rules.forEach { rule ->
                    sql.saveRule(OfferRuleSqlParams(
                        organizationId, request.id, rule.id, rule.ruleName,
                        rule.frequencyType, rule.frequencyInterval, rule.usageLimit,
                        rule.windowStartTime, rule.windowEndTime, rule.applicableDays,
                        rule.timeZone, rule.effectiveDate, rule.expiryDate,
                        rule.offerUsageRuleStatusId, rule.versionNo, actorUserId,
                        rule.id !in oldIds
                    ))
                }
                oldRules.filter { old -> request.rules.none { it.id == old.id } }
                    .forEach { sql.deleteRule(organizationId, request.id, it.id, it.versionNo, actorUserId) }
                OfferBundleDto(
                    sql.get(organizationId, request.id, actorUserId)
                        ?: throw NotFoundException("Offer not found after save"),
                    sql.rules(organizationId, request.id, actorUserId)
                )
            }
        } catch (error: Exception) {
            translateDatabaseError(error)
        }
    }

    fun delete(organizationId: String, offerId: String): DeleteOfferDto {
        val current = get(organizationId, offerId)
        try {
            jdbi.onDemand(OfferSql::class.java)
                .delete(organizationId, offerId, current.versionNo, actorUserId)
        } catch (error: Exception) {
            translateDatabaseError(error)
        }
        return DeleteOfferDto(offerId, true)
    }

    private fun validateId(id: String, maxLength: Int) {
        if (id.isBlank() || id.length > maxLength) throw BadRequestException("Invalid id")
    }

    private fun requireOrganizationAdmin(organizationId: String) {
        if (!jdbi.onDemand(OfferSql::class.java).canAdminister(organizationId, actorUserId)) {
            throw ForbiddenException("Organization access denied")
        }
    }

    private fun validateDates(effective: String, expiry: String?) {
        val start = try { LocalDate.parse(effective) }
            catch (_: Exception) { throw BadRequestException("Effective date must be YYYY-MM-DD") }
        val end = try { expiry?.let(LocalDate::parse) }
            catch (_: Exception) { throw BadRequestException("Expiry date must be YYYY-MM-DD") }
        if (end != null && end.isBefore(start)) {
            throw BadRequestException("Expiry date cannot precede effective date")
        }
    }

    private fun validateTime(value: String?): LocalTime? =
        try { value?.let(LocalTime::parse) }
        catch (_: Exception) { throw BadRequestException("Rule time must be HH:MM") }

    private fun translateDatabaseError(error: Exception): Nothing {
        if (error is ApiException) throw error
        var cause: Throwable? = error
        while (cause != null) {
            if (cause is PSQLException) {
                when (cause.sqlState) {
                    "23505", "40001" -> throw ConflictException("Offer or rule already exists or changed since load")
                    "23502", "23503", "23514", "22001", "22007", "22008", "22023", "22P02" ->
                        throw BadRequestException("Invalid Offer or rule relationship or field value")
                    "42501" -> throw ForbiddenException("Organization access denied")
                    "P0002" -> throw NotFoundException("Offer not found in organization")
                }
            }
            cause = cause.cause
        }
        throw error
    }
}
