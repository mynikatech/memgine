package com.mynikatech.memgine.component.benefit

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.exception.NotFoundException
import com.mynikatech.memgine.net.dto.*
import org.jdbi.v3.core.Jdbi
import java.time.LocalDate

class BenefitService(private val jdbi: Jdbi) {

    fun byMembershipProduct(membershipProductId: String): List<BenefitDto> {
        validateId(membershipProductId)
        val sql = jdbi.onDemand(BenefitSql::class.java)
        val rows = sql.byMembershipProduct(membershipProductId)
        return if (rows.isEmpty()) rows else withProducts(rows, sql.canonicalProducts(rows.first().organizationId))
    }

    fun products(organizationId: String): List<CatalogProductDto> {
        validateId(organizationId)

        val result =
            jdbi.onDemand(BenefitSql::class.java)
                .products(organizationId)

        println(
            "CATALOG_PRODUCTS org=$organizationId count=${result.size}"
        )

        return result
    }

    fun list(organizationId: String): List<BenefitDto> {
        validateId(organizationId)
        val sql = jdbi.onDemand(BenefitSql::class.java)
        return withProducts(sql.list(organizationId), sql.canonicalProducts(organizationId))
    }

    fun get(organizationId: String, benefitId: String): BenefitDto {
        validateId(organizationId)
        validateId(benefitId)
        val sql = jdbi.onDemand(BenefitSql::class.java)
        val row = sql.get(organizationId, benefitId) ?: throw NotFoundException("Benefit not found")
        return withProducts(listOf(row), sql.canonicalProducts(organizationId)).single()
    }

    fun rules(organizationId: String, benefitId: String): List<BenefitUsageRuleDto> {
        get(organizationId, benefitId)
        return jdbi.onDemand(BenefitSql::class.java).rules(organizationId, benefitId)
    }

    fun save(organizationId: String, request: BenefitWriteDto, create: Boolean, actorUserId: String): BenefitBundleDto {
        validateId(organizationId)
        validateId(request.id)
        if (request.benefitCode.isBlank() || request.benefitName.isBlank() ||
            request.benefitCategoryId.isBlank() || request.benefitTypeId.isBlank() ||
            request.benefitStatusId.isBlank() || request.effectiveDate.isBlank()) {
            throw BadRequestException("Required Benefit fields are missing")
        }
        if (request.id.length > 40 || request.benefitCode.length > 30 ||
            request.benefitName.length > 100 ||
            (request.displayName?.length ?: 0) > 100 ||
            (request.description?.length ?: 0) > 1000 ||
            (request.disclaimerText?.length ?: 0) > 500 ||
            (request.retailPrice != null && request.retailPrice < 0) ||
            (request.cost != null && request.cost < 0)) {
            throw BadRequestException("Benefit exceeds a field limit or has a negative price")
        }
        validateDates(request.effectiveDate, request.expiryDate)
        val lookup = jdbi.onDemand(BenefitSql::class.java)
        if (!lookup.categoryExists(request.benefitCategoryId) ||
            !lookup.typeExists(request.benefitTypeId)) {
            throw BadRequestException("Benefit category or type is invalid")
        }
        if (!lookup.benefitStatusExists(request.benefitStatusId)) {
            throw BadRequestException("Benefit status is invalid")
        }
        if (lookup.codeInUse(request.benefitCode, request.id)) {
            throw ConflictException("Benefit code already exists")
        }
        val selectedProductIds = (request.productIds ?: request.productId?.let(::listOf) ?: emptyList()).distinct()
        if (selectedProductIds.any { it.isBlank() || it.length > 40 } ||
            !lookup.products(organizationId).map { it.id }.containsAll(selectedProductIds)) {
            throw BadRequestException("Product does not belong to organization")
        }
        if (request.rules.map { it.id }.distinct().size != request.rules.size) {
            throw BadRequestException("Duplicate Benefit Usage Rule id")
        }
        request.rules.forEach { rule ->
            validateId(rule.id)
            if (rule.ruleName.isBlank() || rule.ruleName.length > 100 ||
                rule.id.length > 40 || rule.benefitUsageRuleStatusId.isBlank() ||
                rule.frequencyInterval < 1 || rule.usageLimit < 1 ||
                (rule.applicableDays?.length ?: 0) > 100 ||
                (rule.timeZone?.length ?: 0) > 100) {
                throw BadRequestException("Invalid Benefit Usage Rule")
            }
            if (rule.frequencyType !in setOf("DAILY", "WEEKLY", "MONTHLY", "YEARLY", "ONE_TIME") ||
                !lookup.benefitUsageRuleStatusExists(rule.benefitUsageRuleStatusId)) {
                throw BadRequestException("Benefit Usage Rule frequency or status is invalid")
            }
            validateDates(rule.effectiveDate, rule.expiryDate)
        }
        return jdbi.inTransaction<BenefitBundleDto, Exception> { handle ->
            val sql = handle.attach(BenefitSql::class.java)
            val existing = if (create) emptyList() else sql.rules(organizationId, request.id)
            if (create && sql.get(organizationId, request.id) != null) {
                throw BadRequestException("Benefit already exists")
            }
            sql.save(BenefitSqlParams(
                organizationId, request.id, request.benefitCode, request.benefitName,
                request.displayName, request.benefitCategoryId, request.benefitTypeId,
                request.description, request.disclaimerText, request.benefitStatusId, selectedProductIds.minOrNull(),
                request.retailPrice, request.cost, request.effectiveDate,
                request.expiryDate, actorUserId, create
            ))
            val existingIds = existing.map { it.id }.toSet()
            request.rules.forEach { rule ->
                sql.saveRule(RuleSqlParams(
                    organizationId, request.id, rule.id, rule.ruleName,
                    rule.frequencyType, rule.frequencyInterval, rule.usageLimit,
                    rule.windowStartTime, rule.windowEndTime, rule.applicableDays,
                    rule.timeZone, rule.effectiveDate, rule.expiryDate,
                    rule.benefitUsageRuleStatusId, actorUserId,
                    rule.id !in existingIds
                ))
            }
            existing.filter { old -> request.rules.none { it.id == old.id } }
                .forEach { sql.deleteRule(organizationId, request.id, it.id, actorUserId) }
            sql.saveCanonicalProducts(organizationId, request.id, selectedProductIds.toTypedArray(), actorUserId)
            BenefitBundleDto(
                withProducts(listOf(sql.get(organizationId, request.id)
                    ?: throw NotFoundException("Benefit not found after save")),
                    sql.canonicalProducts(organizationId)).single(),
                sql.rules(organizationId, request.id)
            )
        }
    }

    fun delete(organizationId: String, benefitId: String, actorUserId: String): DeleteBenefitDto {
        validateId(organizationId)
        validateId(benefitId)
        jdbi.onDemand(BenefitSql::class.java).delete(organizationId, benefitId, actorUserId)
        return DeleteBenefitDto(benefitId, true)
    }

    private fun validateId(id: String) {
        if (id.isBlank() || id.length > 64) throw BadRequestException("Invalid id")
    }

    private fun withProducts(rows: List<BenefitDto>, products: List<CanonicalProductRow>): List<BenefitDto> {
        val byBenefit = products.groupBy { it.parentId }
        return rows.map { benefit ->
            val choices = byBenefit[benefit.id].orEmpty().map { it.product() }
            benefit.copy(productIds = choices.map { it.productId }, products = choices)
        }
    }

    private fun validateDates(effective: String, expiry: String?) {
        val start = try { LocalDate.parse(effective) }
            catch (_: Exception) { throw BadRequestException("Effective date must be YYYY-MM-DD") }
        val end = try { expiry?.let { LocalDate.parse(it) } }
            catch (_: Exception) { throw BadRequestException("Expiry date must be YYYY-MM-DD") }
        if (end != null && end.isBefore(start)) {
            throw BadRequestException("Expiry date cannot precede effective date")
        }
    }
}
