package com.mynikatech.memgine.exception

import io.ktor.http.HttpStatusCode

open class ApiException(
    val status: HttpStatusCode,
    val code: String,
    override val message: String
) : RuntimeException(message)

class BadRequestException(message: String, code: String = "BAD_REQUEST") :
    ApiException(HttpStatusCode.BadRequest, code, message)

class NotFoundException(message: String, code: String = "NOT_FOUND") :
    ApiException(HttpStatusCode.NotFound, code, message)

class ConflictException(message: String, code: String = "CONFLICT") :
    ApiException(HttpStatusCode.Conflict, code, message)

class UnauthorizedException(message: String = "Unauthorized", code: String = "UNAUTHORIZED") :
    ApiException(HttpStatusCode.Unauthorized, code, message)

class ForbiddenException(message: String = "Forbidden", code: String = "FORBIDDEN") :
    ApiException(HttpStatusCode.Forbidden, code, message)
