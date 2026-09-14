package com.mynikatech.memgine.model.common

import kotlinx.serialization.Serializable

@Serializable
data class ApiResponse<T>(
    val success: Boolean,
    val data: T? = null,
    val error: ApiError? = null,
    val requestId: String? = null
) {
    companion object {
        fun <T> success(data: T, requestId: String? = null) =
            ApiResponse(success = true, data = data, requestId = requestId)

        fun failure(error: ApiError, requestId: String? = null) =
            ApiResponse<Unit>(success = false, error = error, requestId = requestId)
    }
}

@Serializable
data class ApiError(
    val code: String,
    val message: String
)
