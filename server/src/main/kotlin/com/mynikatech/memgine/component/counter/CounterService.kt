package com.mynikatech.memgine.component.counter

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.exception.NotFoundException
import com.mynikatech.memgine.net.dto.*
import org.jdbi.v3.core.Jdbi
import org.postgresql.util.PSQLException

class CounterService(private val jdbi: Jdbi) {
    private fun sql(): CounterSql = jdbi.onDemand(CounterSql::class.java)

    private fun id(value: String, name: String) {
        if (value.isBlank() || value.length > 40) throw BadRequestException("Invalid $name")
    }

    private fun authorize(organizationId: String, storeId: String, staffId: String, actorUserId: String) {
        id(organizationId, "organization id")
        id(storeId, "store id")
        id(staffId, "staff id")
        if (!sql().canOperate(organizationId, storeId, staffId, actorUserId)) {
            throw ForbiddenException("Staff is not active at this store")
        }
    }

    fun customers(org: String, store: String, staff: String, actorUserId: String): List<OrgAdminCustomerDto> {
        authorize(org, store, staff, actorUserId)
        return sql().customers(org, actorUserId)
    }

    fun subscriptions(org: String, store: String, staff: String, actorUserId: String): List<CounterSubscriptionDto> {
        authorize(org, store, staff, actorUserId)
        return sql().subscriptions(org, actorUserId)
    }

    fun redemptions(org: String, store: String, staff: String, actorUserId: String): List<OrgAdminRedemptionDto> {
        authorize(org, store, staff, actorUserId)
        return sql().redemptions(org, actorUserId)
    }

    fun qrSamples(org: String, store: String, staff: String, actorUserId: String): List<CounterQrDto> {
        authorize(org, store, staff, actorUserId)
        return sql().qrCodes(org, null)
    }

    fun staffName(org: String, store: String, staff: String, actorUserId: String): String? {
        authorize(org, store, staff, actorUserId)
        return sql().staffName(org, staff)
    }

    fun eligibility(org: String, store: String, staff: String,
                    subscriptionId: String, benefitIds: List<String>, actorUserId: String): List<CounterEligibilityDto> {
        authorize(org, store, staff, actorUserId)
        id(subscriptionId, "subscription id")
        if (benefitIds.isEmpty() || benefitIds.size > 100) throw BadRequestException("Select benefits")
        benefitIds.forEach { id(it, "benefit id") }
        val lookup = sql()
        return benefitIds.distinct().map { CounterEligibilityDto(it, lookup.rejection(org, subscriptionId, it)) }
    }

    fun purchase(org: String, request: CounterPurchaseRequest, actorUserId: String): CounterPurchaseResult {
        authorize(org, request.storeId, request.staffId, actorUserId)
        id(request.planId, "plan id")
        request.customerUserId?.let { id(it, "customer user id") }
        if (request.customerUserId == null && (request.firstName.isNullOrBlank() ||
            request.lastName.isNullOrBlank() || request.primaryPhone.isNullOrBlank())) {
            throw BadRequestException("New customer name and phone are required")
        }
        return translate {
            sql().purchase(org, request.storeId, request.staffId, request.planId,
                request.customerUserId, request.firstName, request.lastName,
                request.primaryEmail, request.primaryPhone, actorUserId)
                ?: throw ConflictException("Purchase was not created")
        }
    }

    fun redeem(org: String, request: CounterRedeemRequest, actorUserId: String): List<CounterRedemptionResult> {
        authorize(org, request.storeId, request.staffId, actorUserId)
        id(request.subscriptionId, "subscription id")
        if (request.benefitIds.isEmpty() || request.benefitIds.size > 100 ||
            request.benefitIds.distinct().size != request.benefitIds.size) {
            throw BadRequestException("Select distinct benefits")
        }
        request.benefitIds.forEach { id(it, "benefit id") }
        return translate {
            sql().redeem(org, request.storeId, request.staffId, request.subscriptionId,
                request.benefitIds.toTypedArray(), actorUserId)
        }
    }

    fun redeemQr(org: String, request: CounterQrRedeemRequest, actorUserId: String): List<CounterRedemptionResult> {
        authorize(org, request.storeId, request.staffId, actorUserId)
        if (request.token.isBlank() || request.token.length > 200) throw BadRequestException("Invalid QR token")
        if (sql().qrCodeType(org, request.token) == "QR_OFFER_REDEMPTION") {
            throw BadRequestException("Offer QR redemption is not supported by the server yet")
        }
        val qr = sql().qrCodes(org, request.token).singleOrNull()
            ?: throw NotFoundException("Benefit redemption QR was not found on the server")
        throw BadRequestException("Benefit QR selection is not stored on the server; use phone or staff-assisted redemption")
    }

    private fun <T> translate(block: () -> T): T {
        try { return block() } catch (error: Exception) {
            val postgres = generateSequence<Throwable>(error) { it.cause }
                .filterIsInstance<PSQLException>().firstOrNull()
            val databaseMessage: String? = postgres?.serverErrorMessage?.message?.toString()
            when (postgres?.sqlState) {
                "42501" -> throw ForbiddenException("Counter operation is not permitted")
                "22023" -> throw BadRequestException(
                    databaseMessage?.takeIf { it in setOf(
                        "Membership plan is unavailable for this organization",
                        "Membership plan has an invalid subscription period",
                        "Customer is not active in this organization",
                        "Customer account is not active"
                    ) } ?: "Invalid membership or customer details")
                "23505" -> throw ConflictException(
                    databaseMessage?.takeIf {
                        it == "Customer already has an active subscription for this membership" ||
                            it.startsWith("Benefit ") || it.startsWith("Subscription ")
                    } ?: "The Counter transaction conflicts with existing data")
                else -> throw error
            }
        }
    }
}
