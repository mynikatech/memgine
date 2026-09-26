package com.mynikatech.memgine.component.otp

import com.mynikatech.memgine.config.OtpConfig
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.pinpointsmsvoicev2.PinpointSmsVoiceV2Client
import software.amazon.awssdk.services.pinpointsmsvoicev2.model.MessageType
import software.amazon.awssdk.services.pinpointsmsvoicev2.model.SendTextMessageRequest

enum class OtpLiveSmsRoute { CANADA_DEDICATED, INDIA_ILDO }

data class OtpLiveSmsRouteSelection(
    val route: OtpLiveSmsRoute,
    val originationIdentity: String?
)

class OtpSmsRouteResolver(private val canadaOriginationIdentity: String) {
    fun resolve(destination: String): OtpLiveSmsRouteSelection = when {
        destination.startsWith("+1") -> {
            val identity = canadaOriginationIdentity.takeIf(String::isNotBlank)
                ?: throw IllegalStateException("Canadian live SMS requires MEMGINE_OTP_AWS_ORIGINATION_IDENTITY_CA")
            OtpLiveSmsRouteSelection(OtpLiveSmsRoute.CANADA_DEDICATED, identity)
        }
        destination.startsWith("+91") -> OtpLiveSmsRouteSelection(OtpLiveSmsRoute.INDIA_ILDO, null)
        else -> throw IllegalStateException("Live SMS is not configured for this destination")
    }
}

class DevOtpProvider(private val environment: String) : OtpProvider {
    init {
        require(environment in setOf("local", "dev", "development")) {
            "DevOtpProvider is restricted to local/development environments"
        }
    }
    override val providerCode = "DEV"
    override fun supports(regionCode: String, channel: OtpChannel) = channel == OtpChannel.SMS
    override fun send(delivery: OtpDelivery) =
        OtpDeliveryResult(providerCode = providerCode, devCode = delivery.code)
}

class AwsEndUserMessagingSmsProvider(
    private val config: OtpConfig,
    private val routeResolver: OtpSmsRouteResolver = OtpSmsRouteResolver(config.awsCanadaOriginationIdentity),
    private val client: PinpointSmsVoiceV2Client = PinpointSmsVoiceV2Client.builder()
        .region(Region.of(config.awsRegion)).build()
) : OtpProvider {
    override val providerCode = "AWS_END_USER_MESSAGING_SMS"
    override fun supports(regionCode: String, channel: OtpChannel) =
        channel == OtpChannel.SMS && regionCode in config.allowedRegions

    override fun send(delivery: OtpDelivery): OtpDeliveryResult {
        val route = routeResolver.resolve(delivery.destination)
        val builder = SendTextMessageRequest.builder()
            .destinationPhoneNumber(delivery.destination)
            .messageBody("Your Memgine verification code is ${delivery.code}. It expires shortly.")
            .messageType(MessageType.TRANSACTIONAL)
        config.awsConfigurationSet.takeIf(String::isNotBlank)?.let(builder::configurationSetName)
        route.originationIdentity?.let(builder::originationIdentity)
        client.sendTextMessage(builder.build())
        return OtpDeliveryResult(providerCode)
    }
}

class OtpProviderRouter(
    private val config: OtpConfig,
    private val mockProvider: OtpProvider?,
    private val liveProvider: OtpProvider?
) {
    fun resolve(mode: OtpDeliveryMode, regionCode: String, channel: OtpChannel): OtpProvider {
        require(regionCode in config.allowedRegions) { "OTP delivery is not configured for this region" }
        val provider = when (mode) {
            OtpDeliveryMode.MOCK -> mockProvider
            OtpDeliveryMode.LIVE -> liveProvider
            OtpDeliveryMode.DEFAULT -> error("OTP delivery mode must be resolved before provider selection")
        } ?: throw IllegalStateException("OTP delivery provider is not configured")
        require(provider.supports(regionCode, channel)) { "OTP delivery channel is unavailable" }
        return provider
    }
}
