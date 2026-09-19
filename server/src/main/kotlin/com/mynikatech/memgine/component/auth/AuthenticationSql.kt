package com.mynikatech.memgine.component.auth

import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery

data class AuthIdentityRow(
    var userId: String = "",
    var displayName: String = "",
    var passwordHash: String? = null,
    var passwordEnabled: Boolean = false,
    var failedAttemptCount: Int = 0,
    var lockedUntil: String? = null,
    var userActive: Boolean = false
)

data class AuthSessionRow(
    var sessionId: String = "",
    var userId: String = "",
    var displayName: String = "",
    var expiresAt: String = ""
)

data class AuthAccessRow(
    var organizationId: String? = null,
    var organizationName: String? = null,
    var roleCode: String = "",
    var capabilityCode: String = ""
)

interface AuthenticationSql {

    @SqlQuery("SELECT * FROM auth_find_identity(:phone)")
    @RegisterBeanMapper(AuthIdentityRow::class)
    fun identity(
        @Bind("phone") phone: String
    ): AuthIdentityRow?

    @SqlQuery("SELECT auth_record_password_failure(:userId) IS NULL")
    fun recordPasswordFailure(
        @Bind("userId") userId: String
    ): Boolean

    @SqlQuery("SELECT auth_record_password_success(:userId) IS NULL")
    fun recordPasswordSuccess(
        @Bind("userId") userId: String
    ): Boolean

    @SqlQuery("SELECT auth_set_password(:userId, :passwordHash, :actorUserId)")
    fun setPassword(
        @Bind("userId") userId: String,
        @Bind("passwordHash") passwordHash: String,
        @Bind("actorUserId") actorUserId: String
    ): Boolean

    @SqlQuery(
        """SELECT auth_create_session(
            :sessionId,
            :userId,
            :tokenHash,
            CAST(:expiresAt AS timestamp),
            :clientIp,
            :userAgent
        )"""
    )
    fun createSession(
        @Bind("sessionId") sessionId: String,
        @Bind("userId") userId: String,
        @Bind("tokenHash") tokenHash: String,
        @Bind("expiresAt") expiresAt: String,
        @Bind("clientIp") clientIp: String?,
        @Bind("userAgent") userAgent: String?
    ): Boolean

    @SqlQuery("SELECT * FROM auth_resolve_session(:tokenHash)")
    @RegisterBeanMapper(AuthSessionRow::class)
    fun resolveSession(
        @Bind("tokenHash") tokenHash: String
    ): AuthSessionRow?

    @SqlQuery("SELECT auth_revoke_session(:tokenHash, :userId)")
    fun revokeSession(
        @Bind("tokenHash") tokenHash: String,
        @Bind("userId") userId: String
    ): Boolean

    @SqlQuery("SELECT * FROM auth_effective_access(:userId)")
    @RegisterBeanMapper(AuthAccessRow::class)
    fun access(
        @Bind("userId") userId: String
    ): List<AuthAccessRow>
    
    @SqlQuery("SELECT auth_password_configured(:userId)")
    fun passwordConfigured(
        @Bind("userId") userId: String
    ): Boolean
    
    @SqlQuery(
    """
    SELECT concat_ws(
        '|',
        current_database(),
        current_user,
        current_schema(),
        current_setting('search_path'),
        COALESCE(inet_server_addr()::text, 'local'),
        COALESCE(inet_server_port()::text, '')
    )
    """
        )
        fun debugConnection(): String

        @SqlQuery(
            """
            SELECT COUNT(*)
            FROM memginedev."user"
            WHERE primary_phone = :phone
            """
        )
        fun debugPhoneCount(
            @Bind("phone") phone: String
        ): Int
}