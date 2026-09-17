package com.mynikatech.memgine.component.membership

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.exception.NotFoundException
import com.mynikatech.memgine.net.dto.*
import org.jdbi.v3.core.Jdbi
import org.postgresql.util.PSQLException
import java.time.LocalDate

class MembershipProductService(private val jdbi: Jdbi) {
    private val actorUserId = "user-org-admin"

    fun list(organizationId: String): List<MembershipProductDto> {
        validateId(organizationId, 64)
        val sql = jdbi.onDemand(MembershipProductSql::class.java)
        return sql.list(organizationId).map { assemble(sql, it) }
    }

    fun get(organizationId: String, productId: String): MembershipProductDto {
        validateId(organizationId, 64)
        validateId(productId, 40)
        val sql = jdbi.onDemand(MembershipProductSql::class.java)
        return assemble(sql, sql.get(organizationId, productId)
            ?: throw NotFoundException("Membership product not found"))
    }

    fun save(organizationId: String, request: MembershipProductWriteDto,
             create: Boolean): MembershipProductDto {
        validateId(organizationId, 64)
        validateId(request.id, 40)
        if (request.membershipProductCode.isBlank() || request.membershipProductCode.length > 30 ||
            request.membershipProductName.isBlank() || request.membershipProductName.length > 100 ||
            (request.displayName?.length ?: 0) > 100 ||
            (request.description?.length ?: 0) > 1000 ||
            (request.tier?.length ?: 0) > 50 ||
            (request.tierSequence != null && request.tierSequence < 1)) {
            throw BadRequestException("Invalid membership product fields")
        }
        validateDates(request.effectiveDate, request.expiryDate)
        if (request.plans.isEmpty() || request.benefitIds.isEmpty()) {
            throw BadRequestException("Membership requires a plan and an active Benefit")
        }
        if (request.plans.map { it.id }.distinct().size != request.plans.size ||
            request.plans.map { it.subscriptionPlanCode }.distinct().size != request.plans.size ||
            request.benefitIds.distinct().size != request.benefitIds.size) {
            throw BadRequestException("Duplicate membership plan or Benefit")
        }
        val lookup = jdbi.onDemand(MembershipProductSql::class.java)
        if (!lookup.categoryExists(request.productCategoryId) ||
            !lookup.typeExists(request.productTypeId) ||
            !lookup.statusExists("MEMBERSHIP_PRODUCT", request.productStatusId)) {
            throw BadRequestException("Invalid membership category, type or status")
        }
        if (lookup.codeInUse(request.membershipProductCode, request.id)) {
            throw ConflictException("Membership product code already exists")
        }
        request.benefitIds.forEach { benefitId ->
            validateId(benefitId, 40)
            if (!lookup.activeBenefitExists(organizationId, benefitId)) {
                throw BadRequestException("Benefit does not belong to this organization or is inactive")
            }
        }
        request.plans.forEach { plan ->
            validateId(plan.id, 40)
            if (plan.subscriptionPlanCode.isBlank() || plan.subscriptionPlanCode.length > 30 ||
                plan.subscriptionPlanName.isBlank() || plan.subscriptionPlanName.length > 100 ||
                (plan.description?.length ?: 0) > 1000 ||
                plan.subscriptionPeriod < 1 || plan.subscriptionPeriodUnit.isBlank() ||
                plan.subscriptionPeriodUnit.length > 20 ||
                !plan.price.isFinite() || plan.price < 0 || plan.price > 9999999999.99) {
                throw BadRequestException("Invalid subscription plan fields")
            }
            validateDates(plan.effectiveDate, plan.expiryDate)
            if (!lookup.currencyExists(plan.currencyId) ||
                !lookup.statusExists("SUBSCRIPTION_PLAN", plan.subscriptionPlanStatusId)) {
                throw BadRequestException("Invalid subscription plan currency or status")
            }
            if (lookup.planCodeInUse(plan.subscriptionPlanCode, plan.id)) {
                throw ConflictException("Subscription plan code already exists")
            }
        }
        return try { jdbi.inTransaction<MembershipProductDto, Exception> { handle ->
            val sql = handle.attach(MembershipProductSql::class.java)
            val existing = sql.get(organizationId, request.id)
            if (create && existing != null) throw ConflictException("Membership product already exists")
            if (!create && existing == null) throw NotFoundException("Membership product not found")
            if (!create && existing!!.versionNo != request.versionNo) {
                throw ConflictException("Membership product changed since it was loaded")
            }
            val oldPlans = if (create) emptyList() else sql.plans(organizationId, request.id)
            val oldBenefits = if (create) emptyList() else sql.benefitIds(organizationId, request.id)
            sql.save(MembershipProductSqlParams(
                organizationId, request.id, request.membershipProductCode,
                request.membershipProductName, request.displayName,
                request.productCategoryId, request.productTypeId, request.tier,
                request.tierSequence, request.description, request.productStatusId,
                request.effectiveDate, request.expiryDate, request.versionNo,
                actorUserId, create
            ))
            val oldPlansById = oldPlans.associateBy { it.id }
            request.plans.forEach { plan ->
                val old = oldPlansById[plan.id]
                if (old != null && old.versionNo != plan.versionNo) {
                    throw ConflictException("Subscription plan changed since it was loaded")
                }
                sql.savePlan(SubscriptionPlanSqlParams(
                    organizationId, request.id, plan.id, plan.subscriptionPlanCode,
                    plan.subscriptionPlanName, plan.description, plan.subscriptionPeriod,
                    plan.subscriptionPeriodUnit, plan.price, plan.currencyId,
                    plan.subscriptionPlanStatusId, plan.effectiveDate, plan.expiryDate,
                    plan.versionNo, actorUserId, old == null
                ))
            }
            oldPlans.filter { old -> request.plans.none { it.id == old.id } }
                .forEach { sql.deletePlan(organizationId, request.id, it.id, actorUserId) }
            request.benefitIds.forEachIndexed { index, benefitId ->
                sql.assignBenefit(organizationId, request.id, benefitId, index + 1, actorUserId)
            }
            oldBenefits.filter { it !in request.benefitIds }
                .forEach { sql.deleteBenefit(organizationId, request.id, it, actorUserId) }
            assemble(sql, sql.get(organizationId, request.id)
                ?: throw NotFoundException("Membership product not found after save"))
        } } catch (error: Exception) { translateDatabaseError(error) }
    }

    fun delete(organizationId: String, productId: String): DeleteMembershipProductDto {
        validateId(organizationId, 64)
        validateId(productId, 40)
        try {
            jdbi.onDemand(MembershipProductSql::class.java)
                .delete(organizationId, productId, actorUserId)
        } catch (error: Exception) {
            translateDatabaseError(error)
        }
        return DeleteMembershipProductDto(productId, true)
    }

    private fun assemble(sql: MembershipProductSql, row: MembershipProductRowDto) =
        MembershipProductDto(
            row.id, row.organizationId, row.membershipProductCode,
            row.membershipProductName, row.displayName, row.productCategoryId,
            row.productTypeId, row.tier, row.tierSequence, row.description,
            row.productStatusId, row.effectiveDate, row.expiryDate,
            sql.benefitIds(row.organizationId, row.id),
            sql.plans(row.organizationId, row.id), row.createdAt, row.createdBy,
            row.updatedAt, row.updatedBy, row.isDeleted, row.versionNo
        )

    private fun validateId(id: String, maxLength: Int) {
        if (id.isBlank() || id.length > maxLength) throw BadRequestException("Invalid id")
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

    private fun translateDatabaseError(error: Exception): Nothing {
        var cause: Throwable? = error
        while (cause != null) {
            if (cause is PSQLException) {
                when (cause.sqlState) {
                    "23505", "40001" -> throw ConflictException(
                        "Membership data changed or its code is already in use"
                    )
                    "23503", "22023" -> throw BadRequestException(
                        "Membership contains an invalid reference or value"
                    )
                    "42501" -> throw ForbiddenException(
                        "Actor cannot administer this organization"
                    )
                    "P0002" -> throw NotFoundException(
                        "Membership record not found in this organization"
                    )
                }
            }
            cause = cause.cause
        }
        throw error
    }
}
