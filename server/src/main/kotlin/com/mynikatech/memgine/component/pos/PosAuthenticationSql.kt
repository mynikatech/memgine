package com.mynikatech.memgine.component.pos

import com.mynikatech.memgine.net.dto.PosDeviceDto
import com.mynikatech.memgine.net.dto.PosStaffDto
import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery

data class PosPinCandidateRow(
    var staffId: String = "",
    var userId: String = "",
    var displayName: String = "",
    var pinHash: String = "",
    var failedAttemptCount: Int = 0,
    var lockedUntil: String? = null,
    var deviceId: String = "",
    var organizationId: String = "",
    var storeId: String = ""
)

data class PosDeviceContextRow(
    var deviceId: String = "",
    var organizationId: String = "",
    var organizationName: String = "",
    var storeId: String = "",
    var storeName: String = "",
    var deviceName: String = ""
)

data class PosDeviceRow(
    var deviceId: String = "",
    var organizationId: String = "",
    var storeId: String = "",
    var storeName: String? = null,
    var deviceName: String = "",
    var revokedAt: String? = null,
    var lastSeenAt: String? = null
)

data class PosStaffRow(
    var staffId: String = "",
    var displayName: String = "",
    var staffCode: String = "",
    var designation: String? = null,
    var pinConfigured: Boolean = false
)

interface PosAuthenticationSql {

    @SqlQuery(
        """
        SELECT *
        FROM pos_register_device(
            :id,
            :org,
            :store,
            :name,
            :hash,
            :actor
        )
        """
    )
    @RegisterBeanMapper(PosDeviceRow::class)
    fun register(
        @Bind("id") id: String,
        @Bind("org") org: String,
        @Bind("store") store: String,
        @Bind("name") name: String,
        @Bind("hash") hash: String,
        @Bind("actor") actor: String
    ): PosDeviceRow

    @SqlQuery(
        """
        SELECT *
        FROM pos_list_devices(
            :org,
            :actor
        )
        """
    )
   @RegisterBeanMapper(PosDeviceRow::class)
    fun list(
        @Bind("org") org: String,
        @Bind("actor") actor: String
    ): List<PosDeviceRow>

    @SqlQuery(
        """
        SELECT pos_revoke_device(
            :org,
            :id,
            :actor
        )
        """
    )
    fun revoke(
        @Bind("org") org: String,
        @Bind("id") id: String,
        @Bind("actor") actor: String
    ): Boolean

    @SqlQuery(
        """
        SELECT pos_set_staff_pin_hash(
            :org,
            :staff,
            :hash,
            :actor
        )
        """
    )
    fun setPin(
        @Bind("org") org: String,
        @Bind("staff") staff: String,
        @Bind("hash") hash: String,
        @Bind("actor") actor: String
    ): Boolean

    @SqlQuery(
        """
        SELECT *
        FROM pos_resolve_device(:hash)
        """
    )
    @RegisterBeanMapper(PosDeviceContextRow::class)
    fun device(
        @Bind("hash") hash: String
    ): PosDeviceContextRow?

    @SqlQuery(
        """
        SELECT pos_touch_device(:hash)
        """
    )
    fun touchDevice(
        @Bind("hash") hash: String
    ): Boolean

    @SqlQuery(
        """
        SELECT *
        FROM pos_eligible_staff(:hash)
        """
    )
    @RegisterBeanMapper(PosStaffRow::class)
    fun eligibleStaff(
        @Bind("hash") hash: String
    ): List<PosStaffRow>

    @SqlQuery(
        """
        SELECT *
        FROM pos_pin_candidate(
            :hash,
            :staff
        )
        """
    )
    @RegisterBeanMapper(PosPinCandidateRow::class)
    fun candidate(
        @Bind("hash") hash: String,
        @Bind("staff") staff: String
    ): PosPinCandidateRow?

    @SqlQuery(
        """
        SELECT pos_record_pin_failure(
            :staff,
            :max,
            :lock
        )
        """
    )
    fun failure(
        @Bind("staff") staff: String,
        @Bind("max") max: Int,
        @Bind("lock") lock: Int
    ): Int

    @SqlQuery(
        """
        SELECT pos_record_pin_success(:staff)
        """
    )
    fun success(
        @Bind("staff") staff: String
    ): Boolean

    @SqlQuery(
        """
        SELECT pos_create_session(
            :sid,
            :uid,
            :token,
            CAST(:expires AS timestamp),
            :ip,
            :agent,
            :deviceToken,
            :device,
            :org,
            :store,
            :staff
        )
        """
    )
    fun createSession(
        @Bind("sid") sid: String,
        @Bind("uid") uid: String,
        @Bind("token") token: String,
        @Bind("expires") expires: String,
        @Bind("ip") ip: String?,
        @Bind("agent") agent: String?,
        @Bind("deviceToken") deviceToken: String,
        @Bind("device") device: String,
        @Bind("org") org: String,
        @Bind("store") store: String,
        @Bind("staff") staff: String
    ): Boolean
}