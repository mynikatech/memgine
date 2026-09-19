package com.mynikatech.memgine.security

import com.google.i18n.phonenumbers.PhoneNumberUtil
import com.google.i18n.phonenumbers.NumberParseException
import com.mynikatech.memgine.exception.BadRequestException

data class CanonicalPhone(val e164: String, val regionCode: String)

class PhoneNormalizer(private val phoneUtil: PhoneNumberUtil = PhoneNumberUtil.getInstance()) {
    fun normalize(input: String, regionCode: String?): CanonicalPhone {
        val raw = input.trim()
        val region = regionCode?.trim()?.uppercase()?.takeIf { it.length == 2 }
        if (raw.isEmpty() || (!raw.startsWith("+") && region == null)) {
            throw BadRequestException("A valid phone number and country are required")
        }
        try {
            val parsed = phoneUtil.parse(raw, region)
            if (!phoneUtil.isValidNumber(parsed)) throw BadRequestException("Phone number is invalid")
            val resolvedRegion = phoneUtil.getRegionCodeForNumber(parsed)
                ?: throw BadRequestException("Phone region is unsupported")
            return CanonicalPhone(
                phoneUtil.format(parsed, PhoneNumberUtil.PhoneNumberFormat.E164),
                resolvedRegion
            )
        } catch (_: NumberParseException) {
            throw BadRequestException("Phone number is invalid")
        }
    }
}
