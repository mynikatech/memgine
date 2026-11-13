
package com.mynikatech.memgine.component.democustomer

import com.mynikatech.memgine.component.auth.AuthenticationSql
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.exception.NotFoundException
import com.mynikatech.memgine.security.PhoneNormalizer
import kotlinx.serialization.Serializable
import org.jdbi.v3.core.mapper.reflect.ColumnName
import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery
import org.postgresql.util.PSQLException

data class DemoCustomerRow(
    var userId: String = "",
    var displayName: String = "",
    var primaryEmail: String? = null,
    var primaryPhone: String = "",

    @set:ColumnName("isDemo")
    var demo: Boolean = false,

    var otpDeliveryMode: String = "DEFAULT"
)

data class DemoCustomerListRow(
    var userId: String = "",
    var displayName: String = "",
    var primaryEmail: String? = null,
    var primaryPhone: String = "",

    @set:ColumnName("isDemo")
    var demo: Boolean = false,

    var otpDeliveryMode: String = "DEFAULT",
    var totalCount: Long = 0
)

@Serializable
data class DemoCustomerDto(
    val userId: String,
    val displayName: String,
    val primaryEmail: String?,
    val primaryPhone: String,
    val isDemo: Boolean,
    val otpDeliveryMode: String
)

@Serializable
data class DemoCustomerPageDto(
    val items: List<DemoCustomerDto>,
    val totalCount: Long
)

@Serializable
data class SetDemoCustomerRequest(
    val isDemo: Boolean
)

@Serializable
data class ProvisionDemoCustomerRequest(
    val firstName: String,
    val lastName: String,
    val primaryPhone: String,
    val primaryEmail: String? = null
)

interface DemoCustomerSql {

    @SqlQuery(
        "SELECT rbac_has_capability(:actorUserId, NULL, 'PLATFORM_ADMIN_ACCESS')"
    )
    fun isPlatformAdmin(
        @Bind("actorUserId") actorUserId: String
    ): Boolean

    @SqlQuery(
        "SELECT * FROM platform_demo_customer_lookup(:phone, :actorUserId)"
    )
    @RegisterBeanMapper(DemoCustomerRow::class)
    fun lookup(
        @Bind("phone") phone: String,
        @Bind("actorUserId") actorUserId: String
    ): DemoCustomerRow?

    @SqlQuery(
        "SELECT * FROM platform_list_demo_customers(:search, :limit, :offset, :actorUserId)"
    )
    @RegisterBeanMapper(DemoCustomerListRow::class)
    fun list(
        @Bind("search") search: String?,
        @Bind("limit") limit: Int,
        @Bind("offset") offset: Int,
        @Bind("actorUserId") actorUserId: String
    ): List<DemoCustomerListRow>

    @SqlQuery(
        "SELECT platform_set_customer_demo(:userId, :isDemo, :actorUserId)"
    )
    fun setDemo(
        @Bind("userId") userId: String,
        @Bind("isDemo") isDemo: Boolean,
        @Bind("actorUserId") actorUserId: String
    ): Boolean

    @SqlQuery(
        "SELECT platform_count_demo_customers(:search, :actorUserId)"
    )
    fun count(
        @Bind("search") search: String?,
        @Bind("actorUserId") actorUserId: String
    ): Long
}

class DemoCustomerService(
    private val sql: DemoCustomerSql,
    private val authenticationSql: AuthenticationSql,
    private val phoneNormalizer: PhoneNormalizer
) {

    fun lookup(
        phone: String,
        actorUserId: String
    ): DemoCustomerDto? = map {
        sql.lookup(
            phoneNormalizer.normalize(phone, null).e164,
            required(actorUserId)
        )?.toDto()
    }

    fun list(
        search: String?,
        limit: Int,
        offset: Int,
        actorUserId: String
    ): DemoCustomerPageDto = map {

        if (limit !in 1..100 || offset < 0) {
            throw BadRequestException(
                "Invalid DEMO customer list page"
            )
        }

        val normalizedSearch = search
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
            ?.take(100)

        val actor = required(actorUserId)

        val rows = sql.list(
            normalizedSearch,
            limit,
            offset,
            actor
        )

        val totalCount = rows.firstOrNull()?.totalCount
            ?: sql.count(normalizedSearch, actor)

        DemoCustomerPageDto(
            items = rows.map { it.toDto() },
            totalCount = totalCount
        )
    }

    fun setDemo(
        userId: String,
        request: SetDemoCustomerRequest,
        actorUserId: String
    ): Boolean = map {
        sql.setDemo(
            required(userId),
            request.isDemo,
            required(actorUserId)
        )
    }

    fun provision(
        request: ProvisionDemoCustomerRequest,
        actorUserId: String
    ): DemoCustomerDto {

        val actor = required(actorUserId)

        if (!sql.isPlatformAdmin(actor)) {
            throw ForbiddenException(
                "Platform DEMO customer administration is not permitted"
            )
        }

        val firstName = request.firstName.trim()
        val lastName = request.lastName.trim()

        if (
            firstName.isBlank() ||
            firstName.length > 100 ||
            lastName.isBlank() ||
            lastName.length > 100
        ) {
            throw BadRequestException(
                "Valid customer name is required"
            )
        }

        val phone = phoneNormalizer.normalize(
            request.primaryPhone,
            null
        ).e164

        val email = request.primaryEmail
            ?.trim()
            ?.lowercase()
            ?.takeIf(String::isNotBlank)

        val created = map {
            authenticationSql.registerCustomerUser(
                phone,
                firstName,
                lastName,
                email
            )
        } ?: throw ConflictException(
            "Customer could not be provisioned"
        )

        setDemo(
            created.userId,
            SetDemoCustomerRequest(true),
            actor
        )

        return lookup(phone, actor)
            ?: throw ConflictException(
                "Provisioned customer could not be loaded"
            )
    }

    private fun DemoCustomerRow.toDto(): DemoCustomerDto =
        DemoCustomerDto(
            userId = userId,
            displayName = displayName,
            primaryEmail = primaryEmail,
            primaryPhone = primaryPhone,
            isDemo = demo,
            otpDeliveryMode = otpDeliveryMode
        )

    private fun DemoCustomerListRow.toDto(): DemoCustomerDto =
        DemoCustomerDto(
            userId = userId,
            displayName = displayName,
            primaryEmail = primaryEmail,
            primaryPhone = primaryPhone,
            isDemo = demo,
            otpDeliveryMode = otpDeliveryMode
        )

    private fun required(value: String): String =
        value.trim().takeIf {
            it.isNotEmpty() && it.length <= 64
        } ?: throw BadRequestException(
            "Identifier is required"
        )

    private fun <T> map(action: () -> T): T =
        try {
            action()
        } catch (error: Exception) {

            val postgres = generateSequence<Throwable>(error) {
                it.cause
            }.filterIsInstance<PSQLException>().firstOrNull()

            when (postgres?.sqlState) {

                "42501" -> throw ForbiddenException(
                    "Platform DEMO customer administration is not permitted"
                )

                "P0002" -> throw NotFoundException(
                    "Customer was not found"
                )

                "23505" -> throw ConflictException(
                    postgres.serverErrorMessage?.message
                        ?: "Customer cannot be designated DEMO"
                )

                "22023" -> throw BadRequestException(
                    postgres.serverErrorMessage?.message
                        ?: "Invalid customer"
                )

                else -> throw error
            }
        }
}
