package com.mynikatech.memgine.component.poynt

import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery

data class PoyntPairingRow(
    var pairingId: String = "",
    var organizationId: String = "",
    var storeId: String = "",
    var expiresAt: String = ""
)

data class PoyntTerminalRow(
    var deviceId: String = "",
    var organizationId: String = "",
    var organizationName: String = "",
    var storeId: String = "",
    var storeName: String = "",
    var deviceName: String = ""
)

interface PoyntTerminalSql {

    @SqlQuery(
        """
        SELECT * FROM poynt_create_terminal_pairing(
            :pairingId,
            :organizationId,
            :storeId,
            :pairingCodeHash,
            CAST(:expiresAt AS timestamp with time zone),
            :actorUserId
        )
        """
    )
    @RegisterBeanMapper(PoyntPairingRow::class)
    fun createPairing(
        @Bind("pairingId")
        pairingId: String,

        @Bind("organizationId")
        organizationId: String,

        @Bind("storeId")
        storeId: String,

        @Bind("pairingCodeHash")
        pairingCodeHash: String,

        @Bind("expiresAt")
        expiresAt: String,

        @Bind("actorUserId")
        actorUserId: String
    ): PoyntPairingRow

    @SqlQuery(
        """
        SELECT * FROM poynt_complete_terminal_pairing(
            :pairingCodeHash,
            :poyntBusinessId,
            :poyntStoreId,
            :poyntTerminalId,
            :deviceId,
            :deviceName,
            :deviceTokenHash,
            :bindingId
        )
        """
    )
    @RegisterBeanMapper(PoyntTerminalRow::class)
    fun completePairing(
        @Bind("pairingCodeHash")
        pairingCodeHash: String,

        @Bind("poyntBusinessId")
        poyntBusinessId: String,

        @Bind("poyntStoreId")
        poyntStoreId: String,

        @Bind("poyntTerminalId")
        poyntTerminalId: String,

        @Bind("deviceId")
        deviceId: String,

        @Bind("deviceName")
        deviceName: String,

        @Bind("deviceTokenHash")
        deviceTokenHash: String,

        @Bind("bindingId")
        bindingId: String
    ): PoyntTerminalRow
}