package com.mynikatech.memgine.net.dto

import kotlinx.serialization.Serializable

@Serializable
data class StoreDto(
    val id: String,
    val organizationId: String,
    val storeCode: String,
    val name: String,
    val storeTypeId: String,
    val phoneNumber: String? = null,
    val emailAddress: String? = null,
    val addressLine1: String,
    val addressLine2: String? = null,
    val city: String,
    val state: String,
    val postalCode: String,
    val country: String,
    val timezone: String,
    val storeStatusId: String,
    val openingDate: String? = null,
    val closingDate: String? = null,
    val createdAt: String,
    val createdBy: String,
    val updatedAt: String,
    val updatedBy: String? = null,
    val isDeleted: Boolean,
    val versionNo: Int
)

@Serializable
data class CreateStoreRequestDto(
    val id: String,
    val storeCode: String,
    val name: String,
    val storeTypeId: String,
    val phoneNumber: String? = null,
    val emailAddress: String? = null,
    val addressLine1: String,
    val addressLine2: String? = null,
    val city: String,
    val state: String,
    val postalCode: String,
    val country: String,
    val timezone: String,
    val storeStatusId: String,
    val openingDate: String? = null,
    val closingDate: String? = null
)

@Serializable
data class UpdateStoreRequestDto(
    val storeCode: String,
    val name: String,
    val storeTypeId: String,
    val phoneNumber: String? = null,
    val emailAddress: String? = null,
    val addressLine1: String,
    val addressLine2: String? = null,
    val city: String,
    val state: String,
    val postalCode: String,
    val country: String,
    val timezone: String,
    val storeStatusId: String,
    val openingDate: String? = null,
    val closingDate: String? = null
)

@Serializable
data class DeleteStoreResponseDto(
    val storeId: String,
    val deleted: Boolean
)