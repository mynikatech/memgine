package com.mynikatech.memgine.net.dto

import kotlinx.serialization.Serializable

@Serializable data class OrganizationProductCatalogDto(
    val productCatalogId: String, val organizationId: String, val integrationConfigurationId: String? = null,
    val integrationName: String? = null, val provider: String? = null, val catalogName: String,
    val description: String? = null, val externalCatalogId: String? = null, val active: Boolean,
    val sourceUpdatedAt: String? = null, val lastSyncedAt: String? = null, val versionNo: Int
)
@Serializable data class OrganizationProductCatalogWriteDto(
    val productCatalogId: String? = null, val integrationConfigurationId: String? = null, val catalogName: String,
    val description: String? = null, val externalCatalogId: String? = null, val active: Boolean = true, val versionNo: Int? = null
)
@Serializable data class OrganizationProductDto(
    val productId: String, val organizationId: String, val productCatalogId: String? = null, val catalogName: String? = null,
    val integrationConfigurationId: String? = null, val integrationName: String? = null,
    val productCatalogCategoryId: String? = null, val categoryName: String? = null, val productCode: String,
    val productName: String, val description: String? = null, val shortCode: String? = null, val sku: String? = null,
    val upc: String? = null, val basePriceMinor: Long? = null, val currencyCode: String? = null,
    val active: Boolean, val externalProductIds: String? = null, val versionNo: Int
)
@Serializable data class OrganizationProductWriteDto(
    val productId: String? = null, val productCatalogId: String, val productCatalogCategoryId: String? = null,
    val productCode: String, val productName: String, val description: String? = null, val shortCode: String? = null,
    val sku: String? = null, val upc: String? = null, val basePriceMinor: Long, val currencyCode: String,
    val active: Boolean = true, val externalProductId: String? = null, val versionNo: Int? = null
)
@Serializable data class ProductImportRowDto(
    val rowNumber: Int, val productId: String? = null, val externalProductId: String? = null,
    val productCode: String, val productName: String, val sku: String? = null, val upc: String? = null,
    val description: String? = null, val categoryExternalId: String? = null, val categoryName: String? = null,
    val basePriceMinor: Long, val currencyCode: String, val active: Boolean = true
)
@Serializable data class ProductImportPreviewDto(val rowNumber: Int, val classification: String, val productId: String? = null, val reason: String? = null)
@Serializable data class ProductImportRequestDto(val productCatalogId: String, val fileName: String, val rows: List<ProductImportRowDto>)
@Serializable data class ProductImportCommitDto(val batchId: String, val newCount: Int, val updateCount: Int, val unchangedCount: Int)
