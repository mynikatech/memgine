package com.mynikatech.memgine.component.democustomer

import com.mynikatech.memgine.component.auth.AuthenticationSql
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.security.PhoneNormalizer
import org.postgresql.util.PSQLException
import org.postgresql.util.PSQLState
import java.lang.reflect.Proxy
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import java.sql.SQLException

class DemoCustomerServiceTest {
    @Test
    fun `designation update is observed by a subsequent authoritative lookup`() {
        var persistedDemo = false
        val service = service { method, args ->
            when (method) {
                "setDemo" -> {
                    persistedDemo = args[1] as Boolean
                    true
                }
                "lookup" -> DemoCustomerRow(
                    userId = "customer-1",
                    displayName = "Customer",
                    primaryPhone = "+14165550123",
                    demo = persistedDemo
                )
                else -> error("Unexpected SQL call: $method")
            }
        }

        assertTrue(service.setDemo("customer-1", SetDemoCustomerRequest(true), "platform-user"))
        assertTrue(service.lookup("+14165550123", "platform-user")!!.isDemo)

        assertTrue(service.setDemo("customer-1", SetDemoCustomerRequest(false), "platform-user"))
        assertEquals(false, service.lookup("+14165550123", "platform-user")!!.isDemo)
    }

    @Test
    fun `persisted is_demo maps exactly to API isDemo for both states`() {
        listOf(true, false).forEach { persistedDemo ->
            val service = service { method, _ ->
                when (method) {
                    "lookup" -> DemoCustomerRow(
                        userId = "customer-1",
                        displayName = "Customer",
                        primaryPhone = "+14165550123",
                        demo = persistedDemo
                    )
                    else -> error("Unexpected SQL call: $method")
                }
            }

            assertEquals(persistedDemo, service.lookup("+14165550123", "platform-user")?.isDemo)
        }
    }

    @Test
    fun `Platform Admin listing forwards search and page and maps only returned DEMO rows`() {
        var search: String? = null
        var limit = 0
        var offset = 0
        val service = service { method, args ->
            when (method) {
                "list" -> {
                    search = args[0] as String?
                    limit = args[1] as Int
                    offset = args[2] as Int
                    listOf(DemoCustomerListRow("demo-1", "Demo Customer", "demo@example.test", "+14165550123", true, "MOCK", 1))
                }
                else -> error("Unexpected SQL call: $method")
            }
        }

        val page = service.list(" demo ", 20, 0, "platform-user")

        assertEquals("demo", search)
        assertEquals(20, limit)
        assertEquals(0, offset)
        assertEquals(1, page.totalCount)
        assertEquals(listOf("demo-1"), page.items.map { it.userId })
        assertTrue(page.items.all { it.isDemo })
    }

    @Test
    fun `database Platform Admin rejection is surfaced as forbidden`() {
        val service = service { method, _ ->
            if (method == "list") {
                throw PSQLException(
                    org.postgresql.util.ServerErrorMessage(
                        "SERROR\u0000C42501\u0000MPlatform DEMO customer administration is not permitted\u0000\u0000"
                    )
                )
            }
            error("Unexpected SQL call: $method")
        }

        assertFailsWith<ForbiddenException> {
            service.list(null, 20, 0, "customer-user")
        }
    }

    @Test
    fun `listing migration constrains active nondeleted DEMO users and supports search pagination`() {
        val migration = java.nio.file.Files.readString(
            java.nio.file.Path.of("..", "DB", "liquibase", "sql", "290-platform-demo-customer-list.sql")
        )

        assertTrue(migration.contains("rbac_has_capability(p_actor_user_id, NULL, 'PLATFORM_ADMIN_ACCESS')"))
        assertTrue(migration.contains("u.is_demo"))
        assertTrue(migration.contains("NOT u.is_deleted"))
        assertTrue(migration.contains("u.user_status_id = 'entity-status-user-active'"))
        assertTrue(migration.contains("LIMIT p_limit OFFSET p_offset"))
        assertTrue(migration.contains("count(*) OVER ()::bigint"))
    }

    private fun service(handler: (String, Array<out Any?>) -> Any?): DemoCustomerService {
        @Suppress("UNCHECKED_CAST")
        val sql = Proxy.newProxyInstance(
            javaClass.classLoader,
            arrayOf(DemoCustomerSql::class.java)
        ) { _, method, args -> handler(method.name, args ?: emptyArray()) } as DemoCustomerSql
        @Suppress("UNCHECKED_CAST")
        val authenticationSql = Proxy.newProxyInstance(
            javaClass.classLoader,
            arrayOf(AuthenticationSql::class.java)
        ) { _, method, _ -> error("Unexpected authentication SQL call: ${method.name}") } as AuthenticationSql
        return DemoCustomerService(sql, authenticationSql, PhoneNormalizer())
    }
}
