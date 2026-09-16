package com.mynikatech.memgine.component.asset

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.PartData
import io.ktor.http.content.forEachPart
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receiveMultipart
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytes
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import io.ktor.utils.io.readRemaining
import kotlinx.io.readByteArray
import kotlinx.serialization.Serializable
import java.nio.file.Files

@Serializable
data class BrandingAssetUploadResponseDto(
    val path: String
)

fun Route.brandingAssetRoutes(
    service: BrandingAssetService
) {

    route("/branding-assets") {

        post("/{organizationId}") {

            val organizationId =
                call.parameters["organizationId"]
                    ?: throw BadRequestException(
                        "Organization id is required"
                    )

            var assetType: String? = null
            var fileName: String? = null
            var contentType: String? = null
            var fileBytes: ByteArray? = null

            val multipart =
                call.receiveMultipart()

            multipart.forEachPart { part ->

                try {
                    when (part) {

                        is PartData.FormItem -> {
                            if (part.name == "assetType") {
                                assetType = part.value
                            }
                        }

                        is PartData.FileItem -> {
                            if (part.name == "file") {

                                fileName =
                                    part.originalFileName
                                        ?: "branding-asset"

                                contentType =
                                    part.contentType
                                        ?.toString()

                                fileBytes =
                                    part.provider()
                                        .readRemaining()
                                        .readByteArray()
                            }
                        }

                        else -> Unit
                    }
                } finally {
                    part.dispose()
                }
            }

            val stored =
                service.upload(
                    organizationId =
                        organizationId,

                    assetType =
                        assetType
                            ?: throw BadRequestException(
                                "Asset type is required"
                            ),

                    fileName =
                        fileName
                            ?: throw BadRequestException(
                                "Asset file is required"
                            ),

                    contentType =
                        contentType,

                    bytes =
                        fileBytes
                            ?: throw BadRequestException(
                                "Asset file is required"
                            )
                )

            call.respond(
                HttpStatusCode.Created,
                ApiResponse.success(
                    BrandingAssetUploadResponseDto(
                        path = stored.path
                    ),
                    call.callId
                )
            )
        }
    }

    route("/assets") {

        get("{path...}") {

            val pathParts =
                call.parameters.getAll("path")
                    ?: throw BadRequestException(
                        "Asset path is required"
                    )

            if (pathParts.isEmpty()) {
                throw BadRequestException(
                    "Asset path is required"
                )
            }

            val publicPath =
                "/api/v1/assets/" +
                    pathParts.joinToString("/")

            val file =
                service.resolve(publicPath)

            if (
                file == null ||
                !Files.exists(file) ||
                !Files.isRegularFile(file)
            ) {
                call.respond(
                    HttpStatusCode.NotFound
                )

                return@get
            }

            val detectedContentType =
                Files.probeContentType(file)

            val responseContentType =
                detectedContentType
                    ?.let {
                        runCatching {
                            ContentType.parse(it)
                        }.getOrNull()
                    }
                    ?: ContentType.Application.OctetStream

            call.response.header(
                HttpHeaders.CacheControl,
                "public, max-age=3600"
            )

            call.respondBytes(
                bytes =
                    Files.readAllBytes(file),

                contentType =
                    responseContentType,

                status =
                    HttpStatusCode.OK
            )
        }
    }
}