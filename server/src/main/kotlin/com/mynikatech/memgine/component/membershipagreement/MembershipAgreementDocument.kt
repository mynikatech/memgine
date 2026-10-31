package com.mynikatech.memgine.component.membershipagreement

import java.security.MessageDigest

/** Deterministic plain-text agreement rendering. Supply only authoritative server-side values. */
data class MembershipAgreementDetails(
    val organizationName: String,
    val membershipName: String,
    val planName: String,
    val priceDisplay: String,
    val durationDisplay: String,
    val benefits: List<String>,
    val restrictions: List<String>,
    val eligibleStores: List<String>,
    val organizationTerms: String
)

data class MembershipAgreementDocument(val text: String, val sha256: String)

object MembershipAgreementDocumentRenderer {
    fun render(input: MembershipAgreementDetails): MembershipAgreementDocument {
        require(input.organizationName.isNotBlank())
        require(input.membershipName.isNotBlank())
        require(input.planName.isNotBlank())
        require(input.priceDisplay.isNotBlank())
        require(input.durationDisplay.isNotBlank())
        require(input.organizationTerms.isNotBlank()) { "Membership terms must be configured" }
        val text = buildString {
            appendLine("MEMBERSHIP AGREEMENT")
            appendLine(input.organizationName)
            appendLine()
            appendLine("Membership: ${input.membershipName}")
            appendLine("Plan: ${input.planName}")
            appendLine("Purchase price: ${input.priceDisplay}")
            appendLine("Duration: ${input.durationDisplay}")
            appendLine()
            appendLine("Included benefits")
            if (input.benefits.isEmpty()) appendLine("No separately listed benefits")
            else input.benefits.forEach { appendLine("- $it") }
            appendLine()
            appendLine("Restrictions")
            if (input.restrictions.isEmpty()) appendLine("No additional restrictions listed")
            else input.restrictions.forEach { appendLine("- $it") }
            appendLine()
            appendLine("Participating stores")
            if (input.eligibleStores.isEmpty()) appendLine("See membership eligibility rules")
            else input.eligibleStores.forEach { appendLine("- $it") }
            appendLine()
            appendLine("Organization membership terms and conditions")
            append(input.organizationTerms)
        }
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(text.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it.toInt() and 0xff) }
        return MembershipAgreementDocument(text, digest)
    }
}
