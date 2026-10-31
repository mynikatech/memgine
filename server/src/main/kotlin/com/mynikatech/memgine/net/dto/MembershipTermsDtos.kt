package com.mynikatech.memgine.net.dto

import kotlinx.serialization.Serializable

@Serializable
data class SaveMembershipTermsRequestDto(val terms: String)

@Serializable
data class MembershipTermsResponseDto(val organizationId: String, val terms: String?)
