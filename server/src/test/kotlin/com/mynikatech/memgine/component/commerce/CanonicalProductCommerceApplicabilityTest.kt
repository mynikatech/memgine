package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.net.dto.CommerceApplicabilityWriteDto
import java.lang.reflect.Proxy
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class CanonicalProductCommerceApplicabilityTest {
    @Test
    fun `active canonical product adjustment may persist without POS mapping links`() {
        var savedMappings: Array<String>? = null
        val service = CommerceService(sql { method, args ->
            when (method) {
                "saveBenefitApplicability" -> {
                    savedMappings = args!![7] as Array<String>
                    "adjustment"
                }
                "benefitApplicability" -> CommerceApplicabilityRow(
                    adjustmentId = "adjustment",
                    organizationId = "org",
                    adjustmentType = "PRODUCT_PERCENT_OFF",
                    percentage = 25.0,
                    active = true
                )
                "snapshots", "adjustmentMappings" -> emptyList<Any>()
                else -> error("Unexpected CommerceSql call: $method")
            }
        })

        val result = service.saveBenefitApplicability(
            "org", "benefit", CommerceApplicabilityWriteDto(
                adjustmentType = "PRODUCT_PERCENT_OFF",
                percentage = 25.0,
                active = true,
                productMappingIds = emptyList()
            ), "actor"
        )

        assertEquals("adjustment", result.adjustmentId)
        assertEquals(emptyList(), savedMappings?.toList())
    }

    @Test
    fun `order adjustment still rejects product mapping links`() {
        val service = CommerceService(sql { method, _ -> error("Unexpected CommerceSql call: $method") })

        assertFailsWith<BadRequestException> {
            service.saveBenefitApplicability(
                "org", "benefit", CommerceApplicabilityWriteDto(
                    adjustmentType = "ORDER_PERCENT_OFF",
                    percentage = 25.0,
                    active = true,
                    productMappingIds = listOf("mapping")
                ), "actor"
            )
        }
    }

    private fun sql(answer: (String, Array<out Any?>?) -> Any?): CommerceSql =
        Proxy.newProxyInstance(
            CommerceSql::class.java.classLoader,
            arrayOf(CommerceSql::class.java)
        ) { _, method, args -> answer(method.name, args) } as CommerceSql
}
