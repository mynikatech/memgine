package com.mynikatech.memgine.component.store

import com.mynikatech.memgine.net.dto.StoreDto
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery

interface StoreSql {

    @SqlQuery(
        """
        SELECT *
        FROM get_organization_stores(:organizationId)
        """
    )
    fun getAll(
        @Bind("organizationId") organizationId: String
    ): List<StoreDto>

    @SqlQuery(
        """
        SELECT *
        FROM get_organization_store(
            :organizationId,
            :storeId
        )
        """
    )
    fun get(
        @Bind("organizationId") organizationId: String,
        @Bind("storeId") storeId: String
    ): StoreDto?

    @SqlQuery(
        """
        SELECT *
        FROM create_store(
            :organizationId,
            :storeId,
            :storeCode,
            :name,
            :storeTypeId,
            :phoneNumber,
            :emailAddress,
            :addressLine1,
            :addressLine2,
            :city,
            :state,
            :postalCode,
            :country,
            :timezone,
            :storeStatusId,
            CAST(:openingDate AS date),
            CAST(:closingDate AS date),
            :actorUserId
        )
        """
    )
    fun create(
        @Bind("organizationId") organizationId: String,
        @Bind("storeId") storeId: String,
        @Bind("storeCode") storeCode: String,
        @Bind("name") name: String,
        @Bind("storeTypeId") storeTypeId: String,
        @Bind("phoneNumber") phoneNumber: String?,
        @Bind("emailAddress") emailAddress: String?,
        @Bind("addressLine1") addressLine1: String,
        @Bind("addressLine2") addressLine2: String?,
        @Bind("city") city: String,
        @Bind("state") state: String,
        @Bind("postalCode") postalCode: String,
        @Bind("country") country: String,
        @Bind("timezone") timezone: String,
        @Bind("storeStatusId") storeStatusId: String,
        @Bind("openingDate") openingDate: String?,
        @Bind("closingDate") closingDate: String?,
        @Bind("actorUserId") actorUserId: String
    ): StoreDto

    @SqlQuery(
        """
        SELECT *
        FROM update_store(
            :organizationId,
            :storeId,
            :storeCode,
            :name,
            :storeTypeId,
            :phoneNumber,
            :emailAddress,
            :addressLine1,
            :addressLine2,
            :city,
            :state,
            :postalCode,
            :country,
            :timezone,
            :storeStatusId,
            CAST(:openingDate AS date),
            CAST(:closingDate AS date),
            :actorUserId
        )
        """
    )
    fun update(
        @Bind("organizationId") organizationId: String,
        @Bind("storeId") storeId: String,
        @Bind("storeCode") storeCode: String,
        @Bind("name") name: String,
        @Bind("storeTypeId") storeTypeId: String,
        @Bind("phoneNumber") phoneNumber: String?,
        @Bind("emailAddress") emailAddress: String?,
        @Bind("addressLine1") addressLine1: String,
        @Bind("addressLine2") addressLine2: String?,
        @Bind("city") city: String,
        @Bind("state") state: String,
        @Bind("postalCode") postalCode: String,
        @Bind("country") country: String,
        @Bind("timezone") timezone: String,
        @Bind("storeStatusId") storeStatusId: String,
        @Bind("openingDate") openingDate: String?,
        @Bind("closingDate") closingDate: String?,
        @Bind("actorUserId") actorUserId: String
    ): StoreDto

    @SqlQuery(
        """
        SELECT delete_store(
            :organizationId,
            :storeId,
            :actorUserId
        )
        """
    )
    fun delete(
        @Bind("organizationId") organizationId: String,
        @Bind("storeId") storeId: String,
        @Bind("actorUserId") actorUserId: String
    ): Boolean
}