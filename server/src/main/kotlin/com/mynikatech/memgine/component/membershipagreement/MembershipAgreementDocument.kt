
package com.mynikatech.memgine.component.membershipagreement

import java.security.MessageDigest

/**
 * Deterministic plain-text membership agreement rendering.
 *
 * All content must originate from authoritative backend values.
 *
 * Benefit details, including usage limits, schedules and disclaimers,
 * are supplied through the benefits collection.
 *
 * Existing accepted agreement snapshots must remain immutable.
 */
data class MembershipAgreementDetails(
    val organizationName: String,
    val membershipName: String,
    val planName: String,
    val priceDisplay: String,
    val durationDisplay: String,
    val benefits: List<String>,
    val eligibleStores: List<String>,
    val organizationTerms: String
)

data class MembershipAgreementDocument(
    val text: String,
    val sha256: String
)

object MembershipAgreementDocumentRenderer {

    fun render(
        input: MembershipAgreementDetails
    ): MembershipAgreementDocument {

        require(input.organizationName.isNotBlank())
        require(input.membershipName.isNotBlank())
        require(input.planName.isNotBlank())
        require(input.priceDisplay.isNotBlank())
        require(input.durationDisplay.isNotBlank())
        require(input.organizationTerms.isNotBlank()) {
            "Membership terms must be configured"
        }

        val text = buildString {

            appendLine("MEMBERSHIP AGREEMENT")
            appendLine(input.organizationName)
            appendLine()

            appendLine("Membership: ${input.membershipName}")
            appendLine("Plan: ${input.planName}")
            appendLine("Purchase price: ${input.priceDisplay}")
            appendLine("Duration: ${input.durationDisplay}")
            appendLine()

            // Included Benefits
            // Each entry contains the benefit name, customer-friendly
            // usage details and any configured disclaimer.
            appendLine("Included Benefits")

            if (input.benefits.isEmpty()) {
                appendLine("No separately listed benefits")
            } else {
                input.benefits.forEach { benefit ->
                    appendLine("- $benefit")
                }
            }

            appendLine()

            // Participating Stores
            appendLine("Participating Stores")

            if (input.eligibleStores.isEmpty()) {
                appendLine(
                    "Applicable participating stores, subject to " +
                    "membership and benefit eligibility."
                )
            } else {
                input.eligibleStores.forEach { store ->
                    appendLine("- $store")
                }
            }

            appendLine()

            // Membership Terms and Conditions
            appendLine("Membership Terms and Conditions")
            appendLine()
            append(input.organizationTerms.trim())
        }

        val digest = MessageDigest
            .getInstance("SHA-256")
            .digest(text.toByteArray(Charsets.UTF_8))
            .joinToString("") {
                "%02x".format(it.toInt() and 0xff)
            }

        return MembershipAgreementDocument(
            text = text,
            sha256 = digest
        )
    }
}
