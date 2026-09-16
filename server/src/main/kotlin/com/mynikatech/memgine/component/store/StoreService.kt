package com.mynikatech.memgine.component.store

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.net.dto.CreateStoreRequestDto
import com.mynikatech.memgine.net.dto.DeleteStoreResponseDto
import com.mynikatech.memgine.net.dto.StoreDto
import com.mynikatech.memgine.net.dto.UpdateStoreRequestDto

class StoreService(
    private val sql: StoreSql
) {

    fun list(
        organizationId: String
    ): List<StoreDto> {
        validateOrganizationId(organizationId)
        return sql.getAll(organizationId)
    }

    fun get(
        organizationId: String,
        storeId: String
    ): StoreDto {
        validateOrganizationId(organizationId)
        validateStoreId(storeId)

        return sql.get(organizationId, storeId)
            ?: throw BadRequestException("Store not found")
    }

    fun create(
        organizationId: String,
        request: CreateStoreRequestDto
    ): StoreDto {
        validateOrganizationId(organizationId)
        validateStoreId(request.id)
        validateStore(
            request.storeCode,
            request.name,
            request.storeTypeId,
            request.addressLine1,
            request.city,
            request.state,
            request.postalCode,
            request.country,
            request.timezone,
            request.storeStatusId,
            request.openingDate,
            request.closingDate
        )

        return sql.create(
            organizationId = organizationId,
            storeId = request.id,
            storeCode = request.storeCode,
            name = request.name,
            storeTypeId = request.storeTypeId,
            phoneNumber = request.phoneNumber,
            emailAddress = request.emailAddress,
            addressLine1 = request.addressLine1,
            addressLine2 = request.addressLine2,
            city = request.city,
            state = request.state,
            postalCode = request.postalCode,
            country = request.country,
            timezone = request.timezone,
            storeStatusId = request.storeStatusId,
            openingDate = request.openingDate,
            closingDate = request.closingDate,
            actorUserId = ORG_ADMIN_USER_ID
        )
    }

    fun update(
        organizationId: String,
        storeId: String,
        request: UpdateStoreRequestDto
    ): StoreDto {
        validateOrganizationId(organizationId)
        validateStoreId(storeId)
        validateStore(
            request.storeCode,
            request.name,
            request.storeTypeId,
            request.addressLine1,
            request.city,
            request.state,
            request.postalCode,
            request.country,
            request.timezone,
            request.storeStatusId,
            request.openingDate,
            request.closingDate
        )

        return sql.update(
            organizationId = organizationId,
            storeId = storeId,
            storeCode = request.storeCode,
            name = request.name,
            storeTypeId = request.storeTypeId,
            phoneNumber = request.phoneNumber,
            emailAddress = request.emailAddress,
            addressLine1 = request.addressLine1,
            addressLine2 = request.addressLine2,
            city = request.city,
            state = request.state,
            postalCode = request.postalCode,
            country = request.country,
            timezone = request.timezone,
            storeStatusId = request.storeStatusId,
            openingDate = request.openingDate,
            closingDate = request.closingDate,
            actorUserId = ORG_ADMIN_USER_ID
        )
    }

    fun delete(
        organizationId: String,
        storeId: String
    ): DeleteStoreResponseDto {
        validateOrganizationId(organizationId)
        validateStoreId(storeId)

        val deleted = sql.delete(
            organizationId,
            storeId,
            ORG_ADMIN_USER_ID
        )

        if (!deleted) {
            throw BadRequestException("Store not found")
        }

        return DeleteStoreResponseDto(
            storeId = storeId,
            deleted = true
        )
    }

    private fun validateStore(
        storeCode: String,
        name: String,
        storeTypeId: String,
        addressLine1: String,
        city: String,
        state: String,
        postalCode: String,
        country: String,
        timezone: String,
        storeStatusId: String,
        openingDate: String?,
        closingDate: String?
    ) {
        if (storeCode.isBlank()) {
            throw BadRequestException("Store code is required")
        }

        if (name.isBlank()) {
            throw BadRequestException("Store name is required")
        }

        if (storeTypeId.isBlank()) {
            throw BadRequestException("Store type is required")
        }

        if (addressLine1.isBlank()) {
            throw BadRequestException("Address line 1 is required")
        }

        if (city.isBlank()) {
            throw BadRequestException("City is required")
        }

        if (state.isBlank()) {
            throw BadRequestException("State is required")
        }

        if (postalCode.isBlank()) {
            throw BadRequestException("Postal code is required")
        }

        if (country.isBlank()) {
            throw BadRequestException("Country is required")
        }

        if (timezone.isBlank()) {
            throw BadRequestException("Timezone is required")
        }

        if (storeStatusId.isBlank()) {
            throw BadRequestException("Store status is required")
        }

        if (
            openingDate != null &&
            closingDate != null &&
            closingDate < openingDate
        ) {
            throw BadRequestException(
                "Closing date cannot be before opening date"
            )
        }
    }

    private fun validateOrganizationId(
        organizationId: String
    ) {
        if (organizationId.isBlank()) {
            throw BadRequestException(
                "Organization id is required"
            )
        }

        if (organizationId.length > 64) {
            throw BadRequestException(
                "Organization id must not exceed 64 characters"
            )
        }
    }

    private fun validateStoreId(
        storeId: String
    ) {
        if (storeId.isBlank()) {
            throw BadRequestException("Store id is required")
        }

        if (storeId.length > 64) {
            throw BadRequestException(
                "Store id must not exceed 64 characters"
            )
        }
    }

    private companion object {
        const val ORG_ADMIN_USER_ID = "user-org-admin"
    }
}