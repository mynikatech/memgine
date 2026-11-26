package com.mynikatech.memgine.component.product

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.net.dto.OrganizationProductCatalogWriteDto
import com.mynikatech.memgine.net.dto.OrganizationProductImageWriteDto
import com.mynikatech.memgine.net.dto.OrganizationProductWriteDto
import com.mynikatech.memgine.security.authenticatedPrincipal
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.*

private fun ApplicationCall.organizationId(): String =
    parameters["organizationId"]
        ?.takeIf { it.isNotBlank() }
        ?: throw BadRequestException("Organization id is required")

fun Route.organizationProductRoutes(
    service: OrganizationProductService
) = route("/organizations/{organizationId}/products") {

    get("/catalogs") {
        call.respond(ApiResponse.success(service.catalogs(call.organizationId(),call.authenticatedPrincipal().userId),call.callId))
    }
    post("/catalogs") {
        val organizationId = call.organizationId()
        call.respond(HttpStatusCode.Created,ApiResponse.success(service.saveCatalog(organizationId,call.receive(),call.authenticatedPrincipal().userId),call.callId))
    }
    put("/catalogs/{catalogId}") {
        val organizationId = call.organizationId()
        val request = call.receive<OrganizationProductCatalogWriteDto>()
        if (request.productCatalogId != call.parameters["catalogId"]) throw BadRequestException("Catalog id does not match path")
        call.respond(ApiResponse.success(service.saveCatalog(organizationId,request,call.authenticatedPrincipal().userId),call.callId))
    }
    get {
        val org=call.organizationId()
        val search=call.request.queryParameters["search"]
        val catalogId=call.request.queryParameters["catalogId"]?.trim()?.takeIf(String::isNotEmpty)
        val actor=call.authenticatedPrincipal().userId
        call.respond(ApiResponse.success(
            if(catalogId == null) service.products(org,search,actor)
            else service.catalogProducts(org,catalogId,search,actor), call.callId))
    }
    post {
        val organizationId = call.organizationId()
        call.respond(HttpStatusCode.Created,ApiResponse.success(service.saveProduct(organizationId,call.receive(),call.authenticatedPrincipal().userId),call.callId))
    }
    
    get("/images") {

        val organizationId = call.organizationId()

        val productIdsParam =
            call.request.queryParameters["productIds"]

        val productIds = when {
            productIdsParam == null -> null

            productIdsParam.isBlank() ->
                emptyList()

            else ->
                productIdsParam
                    .split(",")
                    .map { it.trim() }
                    .distinct()
        }

        call.respond(
            ApiResponse.success(
                service.productImages(
                    organizationId,
                    productIds,
                    call.authenticatedPrincipal().userId
                ),
                call.callId
            )
        )
    }


    // ------------------------------------------------------------
    // Retrieve a single product image
    // ------------------------------------------------------------

    get("/{productId}/image") {

        val organizationId = call.organizationId()

        val productId = call.parameters["productId"]
            ?: throw BadRequestException(
                "Product id is required"
            )

        call.respond(
            ApiResponse.success(
                service.productImage(
                    organizationId,
                    productId,
                    call.authenticatedPrincipal().userId
                ),
                call.callId
            )
        )
    }


    // ------------------------------------------------------------
    // Save, replace or remove a product image
    // ------------------------------------------------------------

    put("/{productId}/image") {

        val organizationId = call.organizationId()

        val productId = call.parameters["productId"]
            ?: throw BadRequestException(
                "Product id is required"
            )

        val request =
            call.receive<OrganizationProductImageWriteDto>()

        call.respond(
            ApiResponse.success(
                service.saveProductImage(
                    organizationId,
                    productId,
                    request,
                    call.authenticatedPrincipal().userId
                ),
                call.callId
            )
        )
    }
    put("/{productId}") {
        val organizationId = call.organizationId()
        val request = call.receive<OrganizationProductWriteDto>()
        if (request.productId != call.parameters["productId"]) throw BadRequestException("Product id does not match path")
        call.respond(ApiResponse.success(service.saveProduct(organizationId,request,call.authenticatedPrincipal().userId),call.callId))
    }
    post("/imports/preview") {
        val organizationId = call.organizationId()
        call.respond(ApiResponse.success(service.preview(organizationId,call.receive(),call.authenticatedPrincipal().userId),call.callId))
    }
    post("/imports/commit") {
        val organizationId = call.organizationId()
        call.respond(ApiResponse.success(service.commit(organizationId,call.receive(),call.authenticatedPrincipal().userId),call.callId))
    }
}
