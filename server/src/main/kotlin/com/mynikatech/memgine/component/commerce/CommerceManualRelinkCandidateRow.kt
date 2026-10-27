package com.mynikatech.memgine.component.commerce

import kotlinx.serialization.Serializable

@Serializable
data class CommerceManualRelinkCandidateRow(
    var productId: String = "",
    var organizationId: String = "",
    var productName: String = "",
    var productCode: String = "",
    var sku: String? = null,
    var catalogId: String = "",
    var catalogName: String = "",
    var categoryId: String? = null,
    var categoryName: String? = null,
    var basePriceMinor: Long? = null,
    var currencyCode: String? = null,
    var versionNo: Int = 0
)
