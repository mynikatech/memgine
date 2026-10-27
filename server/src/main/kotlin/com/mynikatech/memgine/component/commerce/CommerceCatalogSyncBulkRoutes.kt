package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.security.authenticatedPrincipal
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.int
import org.jdbi.v3.core.Jdbi

@Serializable
data class CommerceBulkProductLinkSelection(
    val rowId: String,
    val canonicalProductId: String,
    val expectedCanonicalProductVersionNo: Int
)
@Serializable
data class CommerceBulkProductLinkRequest(
    val selections: List<CommerceBulkProductLinkSelection>
)
@Serializable
data class CommercePartialApplyRequest(
    val approved: Boolean,
    val idempotencyKey: String,
    val rowIds: List<String>
)
@Serializable
data class CommercePartialApplyResult(
    val previewId: String,
    val status: String,
    val createdCount: Int,
    val appliedCount: Int,
    val mappedCount: Int
)
@Serializable
data class CommerceBulkProductLinkResult(val resolvedCount: Int)

/** Install once inside the authenticated /api/v1 route tree, adjacent to commerceCatalogSyncRoutes. */
fun Route.commerceCatalogSyncBulkRoutes(jdbi: Jdbi) {
    route("/organizations/{organizationId}/commerce/catalog-sync/{previewId}") {
        post("/partial-apply") {
            val organizationId = call.parameters["organizationId"]?.takeIf { it.isNotBlank() }
                ?: throw BadRequestException("Organization is required")
            val previewId = call.parameters["previewId"]?.takeIf { it.isNotBlank() }
                ?: throw BadRequestException("Preview is required")
            val request = call.receive<CommercePartialApplyRequest>()
            if (!request.approved || request.idempotencyKey.isBlank() || request.idempotencyKey.length > 160 ||
                request.rowIds.isEmpty() || request.rowIds.size > 500 ||
                request.rowIds.distinct().size != request.rowIds.size) {
                throw BadRequestException("Explicit approval, idempotency key and 1-500 distinct rows are required")
            }
            val numbers = request.rowIds.map { rowId ->
                if (!rowId.startsWith("$previewId:")) throw BadRequestException("Preview row ID mismatch")
                rowId.substringAfterLast(':').toIntOrNull()?.takeIf { it > 0 }
                    ?: throw BadRequestException("Invalid preview row ID")
            }
            val payload = kotlinx.serialization.json.buildJsonArray {
                numbers.forEach { add(kotlinx.serialization.json.JsonPrimitive(it)) }
            }.toString()
            val result = jdbi.withHandle<String, Exception> { handle ->
                handle.createQuery("SELECT commerce_partial_apply_catalog_sync_preview(:org,:preview,:key,CAST(:rows AS jsonb),:actor)::text")
                    .bind("org", organizationId)
                    .bind("preview", previewId)
                    .bind("key", request.idempotencyKey)
                    .bind("rows", payload)
                    .bind("actor", call.authenticatedPrincipal().userId)
                    .mapTo(String::class.java).one()
            }
            val output = kotlinx.serialization.json.Json.parseToJsonElement(result).jsonObject
            call.respond(ApiResponse.success(CommercePartialApplyResult(
                previewId, "APPLIED", output["createdCount"]?.jsonPrimitive?.int ?: 0,
                output["appliedCount"]?.jsonPrimitive?.int ?: 0,
                output["mappedCount"]?.jsonPrimitive?.int ?: 0
            ), call.callId))
        }
        post("/bulk-resolve") {
            val organizationId = call.parameters["organizationId"]?.takeIf { it.isNotBlank() }
                ?: throw BadRequestException("Organization is required")
            val previewId = call.parameters["previewId"]?.takeIf { it.isNotBlank() }
                ?: throw BadRequestException("Preview is required")
            val request = call.receive<CommerceBulkProductLinkRequest>()
            if (request.selections.isEmpty() || request.selections.size > 500 ||
                request.selections.distinctBy { it.rowId }.size != request.selections.size) {
                throw BadRequestException("Select 1-500 distinct preview rows")
            }
            val normalized = request.selections.map { item ->
                val rowNumber = item.rowId.substringAfterLast(':', "").toIntOrNull()
                    ?: throw BadRequestException("Invalid row ID")
                if (!item.rowId.startsWith("$previewId:") || rowNumber < 1 ||
                    item.canonicalProductId.isBlank() || item.canonicalProductId.length > 64 ||
                    item.expectedCanonicalProductVersionNo < 1) {
                    throw BadRequestException("Invalid Product link selection")
                }
                Triple(rowNumber, item.canonicalProductId, item.expectedCanonicalProductVersionNo)
            }
            val payload = kotlinx.serialization.json.buildJsonArray {
                for ((number, productId, version) in normalized) {
                    add(kotlinx.serialization.json.buildJsonObject {
                        put("rowNumber", kotlinx.serialization.json.JsonPrimitive(number))
                        put("productId", kotlinx.serialization.json.JsonPrimitive(productId))
                        put("expectedVersion", kotlinx.serialization.json.JsonPrimitive(version))
                    })
                }
            }.toString()
            val outcome = jdbi.withHandle<Int, Exception> { handle ->
                val result = handle.createQuery(
                    "SELECT commerce_bulk_resolve_catalog_sync_preview_rows(:organizationId,:previewId,CAST(:payload AS jsonb),:actorUserId)::text"
                ).bind("organizationId", organizationId)
                 .bind("previewId", previewId)
                 .bind("payload", payload)
                 .bind("actorUserId", call.authenticatedPrincipal().userId)
                 .mapTo(String::class.java).one()
                kotlinx.serialization.json.Json.parseToJsonElement(result).jsonObject["resolvedCount"]
                    ?.jsonPrimitive?.int ?: 0
            }
            call.respond(ApiResponse.success(CommerceBulkProductLinkResult(outcome), call.callId))
        }
    }
}
