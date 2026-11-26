package com.mynikatech.memgine.net.dto

data class CanonicalProductRow(
    val parentId: String,
    val productId: String,
    val productName: String,
    val productCode: String,
    val imageUrl: String? = null,
) {
    fun product() = CanonicalProductDto(
        productId = productId,
        productName = productName,
        productCode = productCode,
        imageUrl = imageUrl,
    )
}
