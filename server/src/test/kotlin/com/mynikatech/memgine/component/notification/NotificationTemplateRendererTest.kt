package com.mynikatech.memgine.component.notification

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class NotificationTemplateRendererTest {
    private val template = NotificationContentTemplate(
        "Your order is ready", "Order {referenceNumber} is ready at {storeName}.",
        setOf("referenceNumber", "storeName"), listOf("storeName", "referenceNumber")
    )

    @Test fun `renders values once in configured provider order`() {
        val result = NotificationTemplateRenderer.render(template, mapOf("referenceNumber" to "RTX-1", "storeName" to "{referenceNumber}"))
        assertEquals("Order RTX-1 is ready at {referenceNumber}.", result.message)
        assertEquals(listOf("{referenceNumber}", "RTX-1"), result.providerParameters)
    }

    @Test fun `rejects missing unknown and malformed placeholders`() {
        assertFailsWith<IllegalArgumentException> { NotificationTemplateRenderer.render(template, mapOf("referenceNumber" to "RTX-1")) }
        assertFailsWith<IllegalArgumentException> { NotificationTemplateRenderer.render(template.copy(message = "{unknown}"), emptyMap()) }
        assertFailsWith<IllegalArgumentException> { NotificationTemplateRenderer.render(template.copy(message = "{storeName"), emptyMap()) }
    }

    @Test fun `rejects secret fields and allows repeated provider parameters`() {
        assertFailsWith<IllegalArgumentException> {
            NotificationTemplateRenderer.render(template.copy(allowedParameters = setOf("otpCode")), mapOf("otpCode" to "123456"))
        }
        val repeated = NotificationTemplateRenderer.render(template.copy(providerParameterOrder = listOf("storeName", "storeName")),
            mapOf("referenceNumber" to "RTX-1", "storeName" to "Store"))
        assertEquals(listOf("Store", "Store"), repeated.providerParameters)
    }
}
