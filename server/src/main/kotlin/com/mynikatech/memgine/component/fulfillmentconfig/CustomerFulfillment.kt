package com.mynikatech.memgine.component.fulfillmentconfig

import com.mynikatech.memgine.component.commerce.CounterCommercePaymentService
import com.mynikatech.memgine.component.counter.PickupCodeSecurity
import com.mynikatech.memgine.component.commerce.CounterRedemptionQuoteRow
import com.mynikatech.memgine.component.payment.PaymentService
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.exception.NotFoundException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.net.dto.CounterRedemptionQuoteDto
import com.mynikatech.memgine.net.dto.RedemptionTransactionDto
import com.mynikatech.memgine.security.authenticatedPrincipal
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import org.jdbi.v3.core.Jdbi
import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery
import org.postgresql.util.PSQLException
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.*
import java.util.Base64

@Serializable
data class CustomerFulfillmentSelection(
    val subscriptionId: String,
    val benefitIds: List<String> = emptyList(),
    val offerIds: List<String> = emptyList()
) {
    fun validate() {
        val ids = benefitIds + offerIds
        if (subscriptionId.isBlank() || subscriptionId.length > 64 || ids.size !in 1..100 ||
            ids.any { it.isBlank() || it.length > 64 } ||
            benefitIds.distinct().size != benefitIds.size || offerIds.distinct().size != offerIds.size
        ) throw BadRequestException("Select valid benefits or offers")
    }
}

@Serializable
data class CustomerFulfillmentRequest(
    val selection: CustomerFulfillmentSelection,
    val storeId: String,
    val productSelections: Map<String, String>,
    val journey: String = "ADVANCE_PAY_AT_COUNTER",
    val collectionLocalTime: String? = null,
    val requestKey: String? = null,
    val quoteHash: String? = null
) {
    fun validate() {
        selection.validate()
        val expected = selection.benefitIds.map { "BENEFIT:$it" } + selection.offerIds.map { "OFFER:$it" }
        if (storeId.isBlank() || storeId.length > 64 || productSelections.keys != expected.toSet() ||
            productSelections.values.any { it.isBlank() || it.length > 40 }
        ) throw BadRequestException("Select a Store and a product for each item")
    }
}

@Serializable
data class CustomerRedemptionRow(
    var transactionId: String = "",
    var transactionNumber: String = "",
    var status: String = "",
    var expiresAt: String? = null
)

@Serializable
data class CustomerFulfillmentReview(
    val customerLabel: String,
    val fulfillmentType: String,
    val requestTiming: String,
    val paymentTiming: String,
    val storeName: String,
    val timezone: String,
    val expectedCollectionAt: String,
    val collectionWindowEndsAt: String,
    val schedulingSupported: Boolean,
    val quote: CounterRedemptionQuoteDto
)

@Serializable
data class CustomerFulfillmentChange(val version: Int, val collectionLocalTime: String? = null)

@Serializable
data class CustomerFulfillmentPickup(val reference: String, val expiresAt: String)

@Serializable
data class CustomerFulfillmentPickupCode(
    val code: String,
    val expiresAt: String
)

@Serializable
data class CustomerCounterQrLookup(val selection: CustomerFulfillmentSelection, val transactionId: String? = null, val paymentIntentId: String? = null)

@Serializable
data class CustomerFulfillmentSubmission(val fulfillment: JsonObject? = null, val payment: JsonObject? = null)

class CustomerFulfillmentService(
    jdbi: Jdbi,
    private val pricing: CounterCommercePaymentService,
    private val payments: PaymentService
) {
    private val sql = jdbi.onDemand(CustomerFulfillmentSql::class.java)
    private val pickupRandom = SecureRandom()

    fun stores(org: String, actor: String, selection: CustomerFulfillmentSelection): JsonArray = database {
        selection.validate()
        Json.parseToJsonElement(sql.stores(org, selection.subscriptionId, selection.benefitIds.toTypedArray(),
            selection.offerIds.toTypedArray(), actor, pricing.testProviderEnabled,
            payments.fulfillmentCollectAvailable())).jsonArray
    }

    fun createCounterRedemption(org: String, actor: String, request: CustomerFulfillmentRequest): RedemptionTransactionDto = database {
        request.validate()
        if (request.journey != "IMMEDIATE_PAY_AT_COUNTER") throw BadRequestException("Invalid redemption journey")
        val row = sql.createCounterRedemption(org, request.storeId, request.selection.subscriptionId, request.selection.benefitIds.toTypedArray(),
            request.selection.offerIds.toTypedArray(), Json.encodeToString(request.productSelections), actor, pricing.testProviderEnabled)
            ?: throw BadRequestException("Could not create the redemption")
        RedemptionTransactionDto(
            transactionId = row.transactionId,
            transactionNumber = row.transactionNumber,
            status = row.status,
            expiresAt = row.expiresAt
        )
    }

    fun counterQr(org: String, actor: String, request: CustomerCounterQrLookup): JsonObject = database {
        val selection = request.selection
        val lookupId = request.transactionId ?: request.paymentIntentId
        if (lookupId == null) selection.validate()
        else if (lookupId.isBlank() || lookupId.length > 64 || (request.transactionId != null && request.paymentIntentId != null) ||
            selection.subscriptionId.isBlank() || selection.subscriptionId.length > 64 ||
            selection.benefitIds.isNotEmpty() || selection.offerIds.isNotEmpty()) {
            throw BadRequestException("Invalid Counter redemption")
        }
        val summary = sql.counterQr(org, actor, selection.subscriptionId, request.transactionId,
            selection.benefitIds.toTypedArray(), selection.offerIds.toTypedArray(), request.paymentIntentId)
        buildJsonObject { summary?.let { put("redemption", Json.parseToJsonElement(it)) } }
    }

    fun review(org: String, actor: String, request: CustomerFulfillmentRequest): CustomerFulfillmentReview = database {
        prepare(org, actor, request).review
    }

    fun submit(org: String, actor: String, request: CustomerFulfillmentRequest): CustomerFulfillmentSubmission = database {
        requireAdvanceJourney(request)
        val key = request.requestKey?.takeIf { it.matches(Regex("[A-Za-z0-9_-]{16,80}")) }
            ?: throw BadRequestException("Invalid request key")
        val quoteHash = request.quoteHash?.takeIf { it.matches(Regex("[0-9a-f]{64}")) }
            ?: throw BadRequestException("Review the current quote before confirming")
        val requestHash = digest(Json.encodeToString(request.copy(
            selection = request.selection.copy(benefitIds = request.selection.benefitIds.sorted(), offerIds = request.selection.offerIds.sorted()),
            productSelections = request.productSelections.toSortedMap()
        )))
        val scopedKey = "FUL:" + digest("$actor:$key")
        sql.replay(org, actor, scopedKey, requestHash)?.let { return@database CustomerFulfillmentSubmission(fulfillment = detail(org, actor, it)) }
        paymentRow(org, actor, key = scopedKey)?.let { previous ->
            if (previous.string("requestHash") != requestHash) throw ConflictException("This request key has already been used")
            return@database paymentSubmission(org, actor, previous)
        }
        val prepared = prepare(org, actor, request)
        if (prepared.review.quote.quoteHash != quoteHash) {
            throw ConflictException("Prices changed. Review the updated quote.", "FULFILLMENT_QUOTE_CHANGED")
        }
        val selection = request.selection
        val evidence = buildJsonObject {
            put("policy", prepared.policy)
            put("timezone", prepared.review.timezone)
            put("journey", request.journey)
            prepared.counterPaymentProvider?.let { put("counterPaymentProvider", it) }
            Json.encodeToJsonElement(CounterRedemptionQuoteDto.serializer(), prepared.review.quote).jsonObject
                .filterKeys { it != "lines" }.forEach { (key, value) -> put(key, value) }
            val first = prepared.rows.first()
            put("providerCode", first.providerCode)
            first.integrationConfigurationId?.let { put("integrationId", it) }
            putJsonArray("lines") {
                for (line in prepared.review.quote.lines) {
                    val row = prepared.rows.single { it.itemType == line.itemType && it.itemId == line.itemId }
                    add(buildJsonObject {
                        put("itemType", line.itemType)
                        put("itemId", line.itemId)
                        put("productName", line.productName)
                        put("unitPriceMinor", line.unitPriceMinor)
                        put("subtotalMinor", line.subtotalMinor)
                        put("discountMinor", line.discountMinor)
                        row.commerceProductMappingId?.let { put("mappingId", it) }
                        put("mappingVersion", row.mappingVersionNo)
                        put("adjustmentId", row.commerceAdjustmentId)
                        put("adjustmentVersion", row.adjustmentVersionNo)
                    })
                }
            }
        }
        val id = sql.accept(org, request.storeId, selection.subscriptionId, actor, scopedKey, requestHash,
            selection.benefitIds.toTypedArray(), selection.offerIds.toTypedArray(), Json.encodeToString(request.productSelections),
            evidence.toString(), prepared.expectedCompletion.toString(), prepared.review.expectedCollectionAt)
        if (id.startsWith("PAY_")) {
            val payment = paymentRow(org, actor, id = id) ?: throw NotFoundException("Fulfillment payment is unavailable")
            paymentSubmission(org, actor, payment)
        } else CustomerFulfillmentSubmission(fulfillment = detail(org, actor, id))
    }

    fun pendingPayment(org: String, actor: String, subscription: String): CustomerFulfillmentSubmission = database {
        paymentRow(org, actor, subscription = subscription)?.let { paymentSubmission(org, actor, it) }
            ?: CustomerFulfillmentSubmission()
    }

    fun activity(org: String, actor: String, subscription: String): JsonObject = database {
        val value = sql.activity(org, actor, subscription) ?: throw NotFoundException("Membership activity is unavailable")
        Json.parseToJsonElement(value).jsonObject
    }

    fun reconcilePayment(org: String, actor: String, id: String): CustomerFulfillmentSubmission = database {
        paymentRow(org, actor, id = id) ?: throw NotFoundException("Fulfillment payment is unavailable")
        payments.reconcileFulfillmentCollect(org, id, actor)
        paymentSubmission(org, actor, paymentRow(org, actor, id = id)
            ?: throw NotFoundException("Fulfillment payment is unavailable"))
    }

    private fun paymentRow(org: String, actor: String, id: String? = null, key: String? = null, subscription: String? = null) =
        sql.payment(org, actor, id, key, subscription)?.let { Json.parseToJsonElement(it).jsonObject }

    private fun paymentSubmission(org: String, actor: String, row: JsonObject) = CustomerFulfillmentSubmission(
        fulfillment = row.string("fulfillmentId")?.let { detail(org, actor, it) },
        payment = JsonObject(row - "requestHash")
    )

    fun list(org: String, actor: String, subscription: String?, limit: Int, offset: Int): JsonArray = database {
        Json.parseToJsonElement(sql.orders(org, actor, null, subscription, limit.coerceIn(1, 50), offset.coerceAtLeast(0))).jsonArray
    }

    fun detail(org: String, actor: String, id: String): JsonObject = database {
        val order = Json.parseToJsonElement(sql.orders(org, actor, id, null, 1, 0)).jsonArray
            .firstOrNull()?.jsonObject ?: throw NotFoundException("Fulfillment not found")
        JsonObject(order + mapOf(
            "canShowPickup" to JsonPrimitive(order.string("requestTiming") == "ADVANCE" && order.string("fulfillmentType") == "ORDER" &&
                order.string("status") in setOf("PLACED", "PREPARING", "READY")),
            "canRequestCancellation" to JsonPrimitive(order["canRequestCancellation"]?.jsonPrimitive?.booleanOrNull == true),
            "canRequestCollectionChange" to JsonPrimitive(order["canRequestCollectionChange"]?.jsonPrimitive?.booleanOrNull == true)
        ))
    }

    fun pickup(org: String, actor: String, id: String): CustomerFulfillmentPickup = database {
        val token = Base64.getUrlEncoder().withoutPadding().encodeToString(ByteArray(32).also(pickupRandom::nextBytes))
        CustomerFulfillmentPickup("MEMGINE_PICKUP:$token", sql.issuePickup(org, actor, id, digest(token)))
    }
 fun pickupCode(org: String, actor: String, id: String): CustomerFulfillmentPickupCode = database {
        // Ownership and READY are checked in the SECURITY DEFINER lookup and again at issue time.
        val store = sql.pickupCodeStore(org, actor, id)
            ?: throw NotFoundException("Pickup Code is unavailable for this order")

        repeat(12) {
            val code = PickupCodeSecurity.newCode()

            val value = sql.issuePickupCode(
                org,
                actor,
                id,
                PickupCodeSecurity.digest(org, store, code),
                PickupCodeSecurity.scopeDigest(org, store, code)
            )

            if (value == "UNAVAILABLE") {
                throw NotFoundException("Pickup Code is unavailable")
            }

            if (value == "INVALID") {
                throw BadRequestException("Invalid Pickup Code")
            }

            if (value != "COLLISION") {
                return@database CustomerFulfillmentPickupCode(code, value)
            }
        }

        throw ConflictException(
            "Could not allocate a unique Pickup Code. Please try again."
        )
    }

    fun requestChange(org: String, actor: String, id: String, request: CustomerFulfillmentChange): JsonObject = database {
        val proposed = request.collectionLocalTime?.let {
            val order = detail(org, actor, id)
            val zone = order.string("timezone") ?: throw BadRequestException("Collection timezone is unavailable")
            parseLocalCollection(it, zoneId(zone)).toString()
        }
        sql.requestChange(org, actor, id, request.version, proposed)
        detail(org, actor, id)
    }

    private data class Prepared(
        val rows: List<CounterRedemptionQuoteRow>,
        val review: CustomerFulfillmentReview,
        val expectedCompletion: Instant,
        val policy: JsonObject,
        val counterPaymentProvider: String?
    )

    private fun prepare(org: String, actor: String, request: CustomerFulfillmentRequest): Prepared {
        requireAdvanceJourney(request)
        val selection = request.selection
        val context = sql.quoteContext(org, request.storeId, selection.subscriptionId, actor)
            ?.let { Json.parseToJsonElement(it).jsonObject } ?: throw ForbiddenException("Store or membership is unavailable")
        val payNow = request.journey == "ADVANCE_PAY_NOW"
        val counterPaymentProvider = context.string("counterPaymentProvider")
        if (!payNow && (counterPaymentProvider == null || (counterPaymentProvider == "TEST" && !pricing.testProviderEnabled))) {
            throw BadRequestException("Counter payment is unavailable at this Store")
        }
        val policy = context.getValue("policy").jsonObject
        if (policy["journeys"]?.jsonObject?.get(request.journey)?.jsonPrimitive?.booleanOrNull != true) {
            throw BadRequestException("This fulfillment journey is unavailable")
        }
        val zone = zoneId(context.string("timezone") ?: throw BadRequestException("Collection timezone is unavailable"))
        val rows = sql.quoteRows(org, request.storeId, selection.subscriptionId, selection.benefitIds.toTypedArray(),
            selection.offerIds.toTypedArray(), Json.encodeToString(request.productSelections), actor)
        val quote = pricing.priceCustomerRedemptionQuote(org, request.storeId, selection.subscriptionId, actor, rows)
        if (payNow && (context.string("collectCurrency") != quote.currencyCode ||
                runCatching { java.util.Currency.getInstance(quote.currencyCode).defaultFractionDigits }.getOrNull() != 2)
        ) throw BadRequestException("Online payment is unavailable in this Store currency")
        val now = Instant.now()
        val preparation = policy.minutes("defaultPreparationMinutes")
        val checkoutMinutes = if (payNow && quote.totalMinor > 0) 10 else 0
        val earliest = now.plusSeconds((maxOf(preparation, policy.minutes("minimumLeadMinutes")) + checkoutMinutes) * 60)
        val latest = now.plusSeconds(policy.minutes("maximumHorizonMinutes") * 60)
        val supportsScheduling = policy.string("collectionPolicy") == "ASAP_OR_SCHEDULED"
        val hours = policy["collectionHours"] as? JsonObject
        val windowSeconds = policy.minutes("collectionWindowMinutes") * 60
        val collection = if (request.collectionLocalTime != null) {
            if (!supportsScheduling) throw BadRequestException("Scheduled collection is unavailable")
            parseLocalCollection(request.collectionLocalTime, zone).also {
                if (it < earliest || it > latest || !withinCollectionHours(it, it.plusSeconds(windowSeconds), zone, hours)) {
                    throw BadRequestException("Choose an available collection time")
                }
            }
        } else {
            val first = if (earliest.epochSecond % 60 == 0L && earliest.nano == 0) earliest
                else Instant.ofEpochSecond((earliest.epochSecond / 60 + 1) * 60)
            generateSequence(first) { it.plusSeconds(60) }.takeWhile { it <= latest }
                .firstOrNull { withinCollectionHours(it, it.plusSeconds(windowSeconds), zone, hours) }
                ?: throw BadRequestException("No collection time is available")
        }
        return Prepared(rows, CustomerFulfillmentReview(
            policy.string("customerLabel") ?: "Order", "ORDER", "ADVANCE", if (payNow) "PAY_NOW" else "PAY_AT_COUNTER",
            context.getValue("storeName").jsonPrimitive.content, zone.id, collection.toString(),
            collection.plusSeconds(windowSeconds).toString(), supportsScheduling, quote
        ), if (request.collectionLocalTime != null) collection else now.plusSeconds((preparation + checkoutMinutes) * 60),
            policy, counterPaymentProvider)
    }

    private fun requireAdvanceJourney(request: CustomerFulfillmentRequest) {
        request.validate()
        if (request.journey !in setOf("ADVANCE_PAY_AT_COUNTER", "ADVANCE_PAY_NOW") ||
            (request.journey == "ADVANCE_PAY_NOW" && !payments.fulfillmentCollectAvailable())) {
            throw ConflictException("This fulfillment journey is unavailable")
        }
    }

    private fun parseLocalCollection(value: String, zone: ZoneId): Instant {
        if (value.length != 16) throw BadRequestException("Enter collection time as YYYY-MM-DD HH:MM")
        val local = try { LocalDateTime.parse(value.replace(' ', 'T')) }
            catch (_: DateTimeException) { throw BadRequestException("Enter a valid collection date and time") }
        val offset = zone.rules.getValidOffsets(local).singleOrNull()
            ?: throw BadRequestException("Choose a collection time outside the daylight-saving change")
        return local.toInstant(offset)
    }

    private fun zoneId(value: String): ZoneId = try { ZoneId.of(value) }
        catch (_: DateTimeException) { throw BadRequestException("Collection timezone is unavailable") }

    private fun withinCollectionHours(value: Instant, endOfWindow: Instant, zone: ZoneId, hours: JsonObject?): Boolean {
        if (hours == null) return true
        val local = value.atZone(zone)
        val end = endOfWindow.atZone(zone)
        if (local.toLocalDate() != end.toLocalDate()) return false
        val windows = hours[local.dayOfWeek.name] as? JsonArray ?: return false
        return windows.any {
            val window = it.jsonObject
            val time = local.toLocalTime().toString().take(5)
            val start = window.string("start") ?: return@any false
            val close = window.string("end") ?: return@any false
            time >= start && time < close && end.toLocalTime().toString().take(5) <= close
        }
    }

    private fun JsonObject.string(key: String) = (get(key) as? JsonPrimitive)?.contentOrNull
    private fun JsonObject.minutes(key: String) = get(key)?.jsonPrimitive?.longOrNull ?: 0L
    private fun digest(value: String) = MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }

    private fun <T> database(action: () -> T): T = try {
        action()
    } catch (error: Exception) {
        val failure = generateSequence<Throwable>(error) { it.cause }.filterIsInstance<PSQLException>().firstOrNull()
        val message = failure?.serverErrorMessage?.message
        if (failure?.sqlState == "23505" && message == "Finish the existing Counter redemption or wait for the QR to expire") {
            throw ConflictException(message, "ACTIVE_COUNTER_REDEMPTION")
        }
        when (failure?.sqlState) {
            "42501" -> throw ForbiddenException("Fulfillment operation is not permitted")
            "23505", "40001" -> throw ConflictException(failure.serverErrorMessage?.message ?: "Fulfillment state changed")
            "22023", "23503" -> throw BadRequestException(failure.serverErrorMessage?.message ?: "Invalid fulfillment selection")
            "P0002" -> throw NotFoundException("Fulfillment not found")
            else -> throw error
        }
    }
}

private fun ApplicationCall.fulfillmentOrg() = parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
private fun ApplicationCall.fulfillmentId() = parameters["fulfillmentId"] ?: throw BadRequestException("Fulfillment id is required")

fun Route.customerFulfillmentRoutes(service: CustomerFulfillmentService) {
    route("/customer/organizations/{organizationId}/fulfillment") {
        post("/stores") {
            call.respond(ApiResponse.success(service.stores(call.fulfillmentOrg(), call.authenticatedPrincipal().userId, call.receive()), call.callId))
        }
        post("/counter-redemption") {
            call.respond(ApiResponse.success(service.createCounterRedemption(call.fulfillmentOrg(), call.authenticatedPrincipal().userId, call.receive()), call.callId))
        }
        post("/counter-redemption/lookup") {
            call.respond(ApiResponse.success(service.counterQr(call.fulfillmentOrg(), call.authenticatedPrincipal().userId, call.receive()), call.callId))
        }
        post("/quote") {
            call.respond(ApiResponse.success(service.review(call.fulfillmentOrg(), call.authenticatedPrincipal().userId, call.receive()), call.callId))
        }
        post("/requests") {
            call.respond(ApiResponse.success(service.submit(call.fulfillmentOrg(), call.authenticatedPrincipal().userId, call.receive()), call.callId))
        }
        get("/payments") {
            val subscription = call.request.queryParameters["subscriptionId"] ?: throw BadRequestException("Subscription id is required")
            call.respond(ApiResponse.success(service.pendingPayment(call.fulfillmentOrg(), call.authenticatedPrincipal().userId, subscription), call.callId))
        }
        get("/activity/{subscriptionId}") {
            val subscription = call.parameters["subscriptionId"] ?: throw BadRequestException("Subscription id is required")
            call.respond(ApiResponse.success(service.activity(call.fulfillmentOrg(), call.authenticatedPrincipal().userId, subscription), call.callId))
        }
        post("/payments/{paymentIntentId}/reconcile") {
            val id = call.parameters["paymentIntentId"] ?: throw BadRequestException("Payment intent id is required")
            call.respond(ApiResponse.success(service.reconcilePayment(call.fulfillmentOrg(), call.authenticatedPrincipal().userId, id), call.callId))
        }
        get("/requests") {
            val query = call.request.queryParameters
            call.respond(ApiResponse.success(service.list(call.fulfillmentOrg(), call.authenticatedPrincipal().userId,
                query["subscriptionId"], query["limit"]?.toIntOrNull() ?: 25, query["offset"]?.toIntOrNull() ?: 0), call.callId))
        }
        get("/requests/{fulfillmentId}") {
            call.respond(ApiResponse.success(service.detail(call.fulfillmentOrg(), call.authenticatedPrincipal().userId, call.fulfillmentId()), call.callId))
        }
        post("/requests/{fulfillmentId}/change") {
            call.respond(ApiResponse.success(service.requestChange(call.fulfillmentOrg(), call.authenticatedPrincipal().userId, call.fulfillmentId(), call.receive()), call.callId))
        }
        post("/requests/{fulfillmentId}/pickup") {
            call.respond(ApiResponse.success(service.pickup(call.fulfillmentOrg(), call.authenticatedPrincipal().userId, call.fulfillmentId()), call.callId))
        }
        
        post("/requests/{fulfillmentId}/pickup-code") {
            call.respond(
                ApiResponse.success(
                    service.pickupCode(
                        call.fulfillmentOrg(),
                        call.authenticatedPrincipal().userId,
                        call.fulfillmentId()
                    ),
                    call.callId
                )
            )
        }
    }
}

interface CustomerFulfillmentSql {
    @SqlQuery("SELECT get_customer_fulfillment_activity(:org,:actor,:subscription)")
    fun activity(@Bind("org") org: String, @Bind("actor") actor: String, @Bind("subscription") subscription: String): String?

    @SqlQuery("SELECT get_customer_fulfillment_stores(:org,:subscription,:benefits,:offers,:actor,TRUE,:test,:collect)")
    fun stores(@Bind("org") org: String, @Bind("subscription") subscription: String, @Bind("benefits") benefits: Array<String>,
        @Bind("offers") offers: Array<String>, @Bind("actor") actor: String,
        @Bind("test") test: Boolean, @Bind("collect") collect: Boolean): String

    @SqlQuery("SELECT get_customer_fulfillment_payment(:org,:actor,:intent,:key,:subscription)")
    fun payment(@Bind("org") org: String, @Bind("actor") actor: String, @Bind("intent") id: String?,
        @Bind("key") key: String?, @Bind("subscription") subscription: String?): String?

    @SqlQuery("SELECT * FROM create_store_customer_redemption(:org,:store,:subscription,:benefits,:offers,CAST(:products AS jsonb),:actor,:test)")
    @RegisterBeanMapper(CustomerRedemptionRow::class)
    fun createCounterRedemption(@Bind("org") org: String, @Bind("store") store: String, @Bind("subscription") subscription: String,
        @Bind("benefits") benefits: Array<String>, @Bind("offers") offers: Array<String>, @Bind("products") products: String,
        @Bind("actor") actor: String, @Bind("test") test: Boolean): CustomerRedemptionRow?

    @SqlQuery("SELECT get_customer_counter_qr_summary(:org,:actor,:subscription,:id,:benefits,:offers,:intent)")
    fun counterQr(@Bind("org") org: String, @Bind("actor") actor: String, @Bind("subscription") subscription: String,
        @Bind("id") id: String?, @Bind("benefits") benefits: Array<String>, @Bind("offers") offers: Array<String>, @Bind("intent") intent: String?): String?

    @SqlQuery("SELECT get_customer_fulfillment_quote_context(:org,:store,:subscription,:actor)")
    fun quoteContext(@Bind("org") org: String, @Bind("store") store: String,
        @Bind("subscription") subscription: String, @Bind("actor") actor: String): String?

    @SqlQuery("SELECT * FROM quote_customer_fulfillment_redemption(:org,:store,:subscription,:benefits,:offers,CAST(:products AS jsonb),:actor)")
    @RegisterBeanMapper(CounterRedemptionQuoteRow::class)
    fun quoteRows(@Bind("org") org: String, @Bind("store") store: String, @Bind("subscription") subscription: String,
        @Bind("benefits") benefits: Array<String>, @Bind("offers") offers: Array<String>, @Bind("products") products: String,
        @Bind("actor") actor: String): List<CounterRedemptionQuoteRow>

    @SqlQuery("SELECT get_customer_fulfillment_replay(:org,:actor,:key,:hash)")
    fun replay(@Bind("org") org: String, @Bind("actor") actor: String, @Bind("key") key: String, @Bind("hash") hash: String): String?

    @SqlQuery("SELECT accept_customer_fulfillment(:org,:store,:subscription,:actor,:key,:hash,:benefits,:offers," +
        "CAST(:products AS jsonb),CAST(:quote AS jsonb),CAST(:completion AS timestamptz),CAST(:collection AS timestamptz))")
    fun accept(@Bind("org") org: String, @Bind("store") store: String, @Bind("subscription") subscription: String,
        @Bind("actor") actor: String, @Bind("key") key: String, @Bind("hash") hash: String,
        @Bind("benefits") benefits: Array<String>, @Bind("offers") offers: Array<String>, @Bind("products") products: String,
        @Bind("quote") quote: String, @Bind("completion") completion: String, @Bind("collection") collection: String): String

    @SqlQuery("SELECT get_customer_fulfillment_orders(:org,:actor,:fulfillment,:subscription,:limit,:offset)")
    fun orders(@Bind("org") org: String, @Bind("actor") actor: String, @Bind("fulfillment") fulfillment: String?,
        @Bind("subscription") subscription: String?, @Bind("limit") limit: Int, @Bind("offset") offset: Int): String

    @SqlQuery("SELECT request_customer_fulfillment_change(:org,:actor,:order,:version,CAST(:collection AS timestamptz))")
    fun requestChange(@Bind("org") org: String, @Bind("actor") actor: String, @Bind("order") order: String,
        @Bind("version") version: Int, @Bind("collection") collection: String?): Boolean

 @SqlQuery("SELECT customer_fulfillment_pickup_code_store(:org,:actor,:order)")
    fun pickupCodeStore(
        @Bind("org") org: String,
        @Bind("actor") actor: String,
        @Bind("order") order: String
    ): String?

    @SqlQuery("SELECT issue_customer_fulfillment_pickup_code(:org,:actor,:order,:hash,:scopeHash)")
    fun issuePickupCode(
        @Bind("org") org: String,
        @Bind("actor") actor: String,
        @Bind("order") order: String,
        @Bind("hash") hash: String,
        @Bind("scopeHash") scopeHash: String
    ): String

    @SqlQuery("SELECT issue_customer_fulfillment_pickup(:org,:actor,:order,:hash)")
    fun issuePickup(
        @Bind("org") org: String,
        @Bind("actor") actor: String,
        @Bind("order") order: String,
        @Bind("hash") hash: String
    ): String
}
