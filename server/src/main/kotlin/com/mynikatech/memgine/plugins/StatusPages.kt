package com.mynikatech.memgine.plugins

import com.mynikatech.memgine.exception.ApiException
import com.mynikatech.memgine.model.common.ApiError
import com.mynikatech.memgine.model.common.ApiResponse
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.plugins.callid.callId
import io.ktor.server.plugins.statuspages.StatusPages
import io.ktor.server.response.respond
import org.postgresql.util.PSQLException
import io.ktor.server.application.log

fun Application.configureStatusPages() {
    install(StatusPages) {

        exception<ApiException> { call, cause ->
            call.respond(
                cause.status,
                ApiResponse.failure(
                    ApiError(
                        code = cause.code,
                        message = cause.message
                    ),
                    call.callId
                )
            )
        }

        exception<PSQLException> { call, cause ->
            this@configureStatusPages.log.error(
                "Database error. requestId={}",
                call.callId,
                cause
            )

            call.respond(
                HttpStatusCode.InternalServerError,
                ApiResponse.failure(
                    ApiError(
                        code = "DATABASE_ERROR",
                        message = "A database error occurred"
                    ),
                    call.callId
                )
            )
        }

        exception<Throwable> { call, cause ->
            this@configureStatusPages.log.error(
                "Unhandled server error. requestId={}",
                call.callId,
                cause
            )

            call.respond(
                HttpStatusCode.InternalServerError,
                ApiResponse.failure(
                    ApiError(
                        code = "INTERNAL_SERVER_ERROR",
                        message = "An unexpected server error occurred"
                    ),
                    call.callId
                )
            )
        }
    }
}