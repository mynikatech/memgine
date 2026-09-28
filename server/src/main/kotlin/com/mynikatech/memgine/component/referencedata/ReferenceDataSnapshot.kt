package com.mynikatech.memgine.component.referencedata

import kotlinx.serialization.Serializable

@Serializable
data class ReferenceDataItemDto(val id: String, val code: String, val name: String, val displayOrder: Int, val active: Boolean)

@Serializable
data class CountryReferenceDataDto(
    val id: String, val code: String, val name: String, val countryCode: String,
    val callingCode: String? = null, val displayOrder: Int, val active: Boolean
)

@Serializable
data class RegionReferenceDataDto(val id: String, val countryCode: String, val code: String, val name: String)

@Serializable
data class CityReferenceDataDto(val id: String, val countryCode: String, val regionCode: String, val name: String)

@Serializable
data class ReferenceDataSnapshot(
    val languages: List<ReferenceDataItemDto> = emptyList(),
    val organizationTypes: List<ReferenceDataItemDto> = emptyList(),
    val organizationUserTypes: List<ReferenceDataItemDto> = emptyList(),
    val storeTypes: List<ReferenceDataItemDto> = emptyList(),
    val productCategories: List<ReferenceDataItemDto> = emptyList(),
    val productTypes: List<ReferenceDataItemDto> = emptyList(),
    val benefitCategories: List<ReferenceDataItemDto> = emptyList(),
    val benefitTypes: List<ReferenceDataItemDto> = emptyList(),
    val currencies: List<ReferenceDataItemDto> = emptyList(),
    val integrationTypes: List<ReferenceDataItemDto> = emptyList(),
    val countries: List<CountryReferenceDataDto> = emptyList(),
    val regions: List<RegionReferenceDataDto> = emptyList(),
    val cities: List<CityReferenceDataDto> = emptyList()
)
