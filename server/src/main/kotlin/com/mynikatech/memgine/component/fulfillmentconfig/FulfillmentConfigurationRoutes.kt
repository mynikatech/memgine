package com.mynikatech.memgine.component.fulfillmentconfig

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.exception.NotFoundException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.security.authenticatedPrincipal
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.put
import io.ktor.server.routing.route
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import org.jdbi.v3.core.statement.UnableToExecuteStatementException
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery
import org.postgresql.util.PSQLException

@Serializable
data class FulfillmentPolicyWriteRequest(val policy: JsonObject, val versionNo: Int)

@Serializable
data class FulfillmentStoreWriteRequest(val overrides: JsonObject, val versionNo: Int)

@Serializable
data class FulfillmentWorkflowRuleWriteRequest(
    val storeId: String? = null,
    val targetKind: String,
    val targetId: String,
    val workflow: String? = null, // null clears an existing override (inherit)
    val versionNo: Int
)

/** SQL functions perform authorization using the authenticated actor ID. */
interface FulfillmentConfigurationSql {
    @SqlQuery("SELECT get_organization_fulfillment_policy(:organizationId, :actorId)::text")
    fun organization(@Bind("organizationId") organizationId: String, @Bind("actorId") actorId: String): String

    @SqlQuery("SELECT save_organization_fulfillment_policy(:organizationId, CAST(:policy AS jsonb), :versionNo, :actorId)::text")
    fun saveOrganization(
        @Bind("organizationId") organizationId: String,
        @Bind("policy") policy: String,
        @Bind("versionNo") versionNo: Int,
        @Bind("actorId") actorId: String
    ): String

    @SqlQuery("SELECT get_store_fulfillment_overrides(:organizationId, :storeId, :actorId)::text")
    fun store(
        @Bind("organizationId") organizationId: String,
        @Bind("storeId") storeId: String,
        @Bind("actorId") actorId: String
    ): String

    @SqlQuery("SELECT save_store_fulfillment_overrides(:organizationId, :storeId, CAST(:overrides AS jsonb), :versionNo, :actorId)::text")
    fun saveStore(
        @Bind("organizationId") organizationId: String,
        @Bind("storeId") storeId: String,
        @Bind("overrides") overrides: String,
        @Bind("versionNo") versionNo: Int,
        @Bind("actorId") actorId: String
    ): String

    @SqlQuery("SELECT get_fulfillment_policy_reference_choices(:organizationId, :actorId)::text")
    fun references(@Bind("organizationId") organizationId: String, @Bind("actorId") actorId: String): String

    @SqlQuery("SELECT get_fulfillment_workflow_rules(:organizationId, CAST(:storeId AS varchar), CAST(:search AS varchar), :actorId)::text")
    fun workflowRules(
        @Bind("organizationId") organizationId: String,
        @Bind("storeId") storeId: String?,
        @Bind("search") search: String?,
        @Bind("actorId") actorId: String
    ): String

    @SqlQuery("SELECT save_fulfillment_pos_category_rule(:organizationId, :storeId, :targetId, CAST(:workflow AS varchar), :versionNo, :actorId)::text")
    fun savePosCategoryRule(
        @Bind("organizationId") organizationId: String,
        @Bind("storeId") storeId: String,
        @Bind("targetId") targetId: String,
        @Bind("workflow") workflow: String?,
        @Bind("versionNo") versionNo: Int,
        @Bind("actorId") actorId: String
    ): String

    @SqlQuery("SELECT save_fulfillment_workflow_rule(:organizationId, CAST(:storeId AS varchar), :targetKind, :targetId, CAST(:workflow AS varchar), :versionNo, :actorId)::text")
    fun saveWorkflowRule(
        @Bind("organizationId") organizationId: String,
        @Bind("storeId") storeId: String?,
        @Bind("targetKind") targetKind: String,
        @Bind("targetId") targetId: String,
        @Bind("workflow") workflow: String?,
        @Bind("versionNo") versionNo: Int,
        @Bind("actorId") actorId: String
    ): String
}

class FulfillmentConfigurationService(private val sql: FulfillmentConfigurationSql) {
    private fun <T> guarded(call: () -> T): T {
        try {
            return call()
        } catch (e: UnableToExecuteStatementException) {
            val state = generateSequence(e as Throwable?) { it.cause }
                .filterIsInstance<PSQLException>()
                .firstOrNull()?.sqlState
            when (state) {
                "42501" -> throw ForbiddenException("Organization fulfillment configuration access denied")
                "P0002" -> throw NotFoundException("Organization or Store not found")
                "40001" -> throw ConflictException("Configuration changed since it was loaded. Reload and retry.")
                "22023", "23514" -> throw BadRequestException("Invalid fulfillment configuration")
                else -> throw e
            }
        }
    }

    fun getOrganization(organizationId: String, actorId: String): JsonElement =
        guarded { Json.parseToJsonElement(sql.organization(organizationId, actorId)) }

    fun saveOrganization(organizationId: String, request: FulfillmentPolicyWriteRequest, actorId: String): JsonElement =
        guarded { Json.parseToJsonElement(sql.saveOrganization(organizationId, request.policy.toString(), request.versionNo, actorId)) }

    fun getStore(organizationId: String, storeId: String, actorId: String): JsonElement =
        guarded { Json.parseToJsonElement(sql.store(organizationId, storeId, actorId)) }

    fun saveStore(organizationId: String, storeId: String, request: FulfillmentStoreWriteRequest, actorId: String): JsonElement =
        guarded { Json.parseToJsonElement(sql.saveStore(organizationId, storeId, request.overrides.toString(), request.versionNo, actorId)) }

    fun references(organizationId: String, actorId: String): JsonElement =
        guarded { Json.parseToJsonElement(sql.references(organizationId, actorId)) }

    fun workflowRules(organizationId: String, storeId: String?, search: String?, actorId: String): JsonElement =
        guarded { Json.parseToJsonElement(sql.workflowRules(organizationId, storeId, search, actorId)) }

    fun saveWorkflowRule(organizationId: String, request: FulfillmentWorkflowRuleWriteRequest, actorId: String): JsonElement =
        guarded {
            // Poynt/POS categories are defined by the selected Store's actual
            // integration+external catalog+category, not by a canonical category ID.
            val response = if (request.targetKind == "POS_CATEGORY") {
                val storeId = request.storeId?.takeIf { it.isNotBlank() }
                    ?: throw BadRequestException("Select a Store for a POS category override")
                sql.savePosCategoryRule(
                    organizationId, storeId, request.targetId, request.workflow,
                    request.versionNo, actorId
                )
            } else {
                sql.saveWorkflowRule(
                    organizationId, request.storeId, request.targetKind, request.targetId,
                    request.workflow, request.versionNo, actorId
                )
            }
            Json.parseToJsonElement(response)
        }
}

fun Route.fulfillmentConfigurationRoutes(service: FulfillmentConfigurationService) {
    route("/organizations/{organizationId}/fulfillment-configuration") {
        get {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization ID required")
            call.respond(HttpStatusCode.OK, ApiResponse.success(service.getOrganization(org, call.authenticatedPrincipal().userId), call.callId))
        }
        put {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization ID required")
            val request = call.receive<FulfillmentPolicyWriteRequest>()
            call.respond(HttpStatusCode.OK, ApiResponse.success(service.saveOrganization(org, request, call.authenticatedPrincipal().userId), call.callId))
        }
        get("/references") {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization ID required")
            call.respond(HttpStatusCode.OK, ApiResponse.success(service.references(org, call.authenticatedPrincipal().userId), call.callId))
        }
        get("/workflow-rules") {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization ID required")
            call.respond(HttpStatusCode.OK, ApiResponse.success(service.workflowRules(
                org, call.request.queryParameters["storeId"], call.request.queryParameters["search"],
                call.authenticatedPrincipal().userId
            ), call.callId))
        }
        put("/workflow-rules") {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization ID required")
            val request = call.receive<FulfillmentWorkflowRuleWriteRequest>()
            call.respond(HttpStatusCode.OK, ApiResponse.success(service.saveWorkflowRule(
                org, request, call.authenticatedPrincipal().userId
            ), call.callId))
        }
        get("/stores/{storeId}") {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization ID required")
            val store = call.parameters["storeId"] ?: throw BadRequestException("Store ID required")
            call.respond(HttpStatusCode.OK, ApiResponse.success(service.getStore(org, store, call.authenticatedPrincipal().userId), call.callId))
        }
        put("/stores/{storeId}") {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization ID required")
            val store = call.parameters["storeId"] ?: throw BadRequestException("Store ID required")
            val request = call.receive<FulfillmentStoreWriteRequest>()
            call.respond(HttpStatusCode.OK, ApiResponse.success(service.saveStore(org, store, request, call.authenticatedPrincipal().userId), call.callId))
        }
    }
}
