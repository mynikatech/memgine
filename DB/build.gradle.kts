plugins {
    alias(libs.plugins.liquibase.gradle)
}

dependencies {
    liquibaseRuntime(libs.liquibase)
    liquibaseRuntime(libs.postgresql)
    liquibaseRuntime(libs.picocli)
}

val dbEnvironment = (
    project.findProperty("dbEnvironment")?.toString()
        ?: "local"
    ).lowercase()

val supportedEnvironments = setOf(
    "local",
    "dev",
    "prod"
)

if (dbEnvironment !in supportedEnvironments) {
    throw GradleException(
        "Unsupported DB environment '$dbEnvironment'. " +
            "Expected one of: ${supportedEnvironments.joinToString(", ")}"
    )
}

val environmentDirectory = rootProject.file(
    "DB/env/$dbEnvironment"
)

val propertiesFile = environmentDirectory.resolve(
    "liquibase.$dbEnvironment.properties"
)

val masterChangelogFile = environmentDirectory.resolve(
    "db.changelog-master.$dbEnvironment.yaml"
)

if (!propertiesFile.exists()) {
    throw GradleException(
        "Liquibase properties file not found: " +
            propertiesFile.absolutePath
    )
}

if (!masterChangelogFile.exists()) {
    throw GradleException(
        "Liquibase master changelog not found: " +
            masterChangelogFile.absolutePath
    )
}

val liquibaseProperties = java.util.Properties()

propertiesFile.inputStream().use {
    liquibaseProperties.load(it)
}

fun requiredProperty(name: String): String {
    return liquibaseProperties.getProperty(name)
        ?: throw GradleException(
            "Required Liquibase property '$name' is missing from " +
                propertiesFile.absolutePath
        )
}

/*
 * Password resolution:
 *
 * Local:
 *   password comes from liquibase.local.properties
 *
 * DEV / PROD:
 *   password can be supplied securely through
 *   LIQUIBASE_PASSWORD or -PliquibasePassword.
 *
 * The properties-file password remains available as a fallback,
 * which is useful for local development.
 */
val liquibasePassword =
    project.findProperty("liquibasePassword")?.toString()
        ?: System.getenv("LIQUIBASE_PASSWORD")
        ?: requiredProperty("password")

liquibase {
    activities {
        create("main") {
            arguments = mapOf(
                "url" to requiredProperty("url"),
                "username" to requiredProperty("username"),
                "password" to liquibasePassword,
                "defaultSchemaName" to requiredProperty(
                    "defaultSchemaName"
                ),
                "liquibaseSchemaName" to requiredProperty(
                    "liquibase.liquibaseSchemaName"
                ),
                "changelogFile" to masterChangelogFile.relativeTo(
                    rootProject.file("DB")
                ).path,
                "classpath" to rootProject.file("DB").absolutePath,
                "logLevel" to (
                    liquibaseProperties.getProperty("logLevel")
                        ?: "info"
                    )
            )
        }
    }

    runList = "main"
}