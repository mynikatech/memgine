package com.mynikatech.memgine.component.otp

import com.mynikatech.memgine.config.OtpConfig
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.pinpointsmsvoicev2.PinpointSmsVoiceV2Client
import software.amazon.awssdk.services.pinpointsmsvoicev2.model.MessageType
import software.amazon.awssdk.services.pinpointsmsvoicev2.model.SendTextMessageRequest

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
    private val client: PinpointSmsVoiceV2Client = PinpointSmsVoiceV2Client.builder()
        .region(Region.of(config.awsRegion)).build()
) : OtpProvider {
    override val providerCode = "AWS_END_USER_MESSAGING_SMS"
    override fun supports(regionCode: String, channel: OtpChannel) =
        channel == OtpChannel.SMS && regionCode in config.allowedRegions

    override fun send(delivery: OtpDelivery): OtpDeliveryResult {
        val builder = SendTextMessageRequest.builder()
            .destinationPhoneNumber(delivery.destination)
            .messageBody("Your Memgine verification code is ${delivery.code}. It expires shortly.")
            .messageType(MessageType.TRANSACTIONAL)
        config.awsConfigurationSet.takeIf(String::isNotBlank)?.let(builder::configurationSetName)
        config.awsOriginationIdentity.takeIf(String::isNotBlank)?.let(builder::originationIdentity)
        client.sendTextMessage(builder.build())
        return OtpDeliveryResult(providerCode)
    }
}

class OtpProviderRouter(
    private val config: OtpConfig,
    private val provider: OtpProvider
) {
    fun resolve(regionCode: String, channel: OtpChannel): OtpProvider {
        require(regionCode in config.allowedRegions) { "OTP delivery is not configured for this region" }
        require(provider.supports(regionCode, channel)) { "OTP delivery channel is unavailable" }
        return provider
    }
}
