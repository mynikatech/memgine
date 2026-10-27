package com.mynikatech.memgine.net.dto

import kotlinx.serialization.Serializable

@Serializable
data class CommerceManualRelinkPreviewRequestDto(val targetProductId: String)

@Serializable
data class CommerceManualRelinkConfirmRequestDto(
    val targetProductId: String,
    val expectedMappingVersionNo: Int,
    val expectedTargetProductVersionNo: Int,
    val reason: String
)
