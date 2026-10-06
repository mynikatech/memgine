package com.mynikatech.memgine.net.dto

data class CanonicalProductRow(
    val parentId: String,
    val productId: String,
    val productName: String,
    val productCode: String,
) {
    fun product() = CanonicalProductDto(productId, productName, productCode)
}
