package com.mynikatech.memgine.component.otp

import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery

data class OtpChallengeRow(
    var challengeId: String = "", var destination: String = "",
    var purpose: String = "", var channel: String = "", var providerCode: String = "",
    var otpHash: String = "", var otpSalt: String = "", var status: String = "",
    var failedAttemptCount: Int = 0, var maxAttemptCount: Int = 0,
    var expiresAt: String = ""
)

interface OtpSql {
    @SqlQuery("""SELECT otp_create_challenge(:challengeId, :destination, :destinationRegion, :purpose,
        :channel, :provider, :otpHash, :otpSalt, CAST(:contextJson AS jsonb),
        CAST(:expiresAt AS timestamp), :maxAttempts, :cooldownSeconds)""")
    fun create(
        @Bind("challengeId") challengeId: String, @Bind("destination") destination: String,
        @Bind("destinationRegion") destinationRegion: String?, @Bind("purpose") purpose: String,
        @Bind("channel") channel: String, @Bind("provider") provider: String,
        @Bind("otpHash") otpHash: String, @Bind("otpSalt") otpSalt: String,
        @Bind("contextJson") contextJson: String?, @Bind("expiresAt") expiresAt: String,
        @Bind("maxAttempts") maxAttempts: Int, @Bind("cooldownSeconds") cooldownSeconds: Int
    ): String

    @SqlQuery("SELECT * FROM otp_get_challenge(:challengeId)")
    @RegisterBeanMapper(OtpChallengeRow::class)
    fun get(@Bind("challengeId") challengeId: String): OtpChallengeRow?

    @SqlQuery("SELECT otp_record_failure(:challengeId)")
    fun recordFailure(@Bind("challengeId") challengeId: String): Int

    @SqlQuery("SELECT otp_consume_challenge(:challengeId, :purpose)")
    fun consume(@Bind("challengeId") challengeId: String, @Bind("purpose") purpose: String): Boolean

    @SqlQuery("SELECT otp_mark_delivery_failed(:challengeId)")
    fun markDeliveryFailed(@Bind("challengeId") challengeId: String): Boolean
}
