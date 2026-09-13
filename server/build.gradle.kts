plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ktor.io)
    alias(libs.plugins.liquibase.gradle)
}

dependencies {

    // -------------------------
    // Ktor
    // -------------------------

    implementation(libs.ktor.server.netty)
    implementation(libs.ktor.server.core)
    implementation(libs.ktor.server.hsts)
    implementation(libs.ktor.server.content.negotiation)
    implementation(libs.ktor.serialization.kotlinx.json)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.ktor.server.call.logging)
    implementation(libs.ktor.server.forwarded.header)
    implementation(libs.ktor.server.call.id)
    implementation(libs.ktor.server.status.pages)

    // Ktor client
    implementation(libs.ktor.client.core)
    implementation(libs.ktor.client.cio)
    implementation(libs.ktor.client.content.negotiation)

    // -------------------------
    // Logging
    // -------------------------

    implementation(libs.logback.classic)

    // -------------------------
    // Database
    // -------------------------

    implementation(libs.postgresql)
    implementation(libs.hikari)

    // -------------------------
    // JDBI
    // -------------------------

    implementation(libs.jdbi.core)
    implementation(libs.jdbi.kotlin)
    implementation(libs.jdbi.sqlobject)
    implementation(libs.jdbi.kotlin.sqlobject)

    // -------------------------
    // Liquibase
    // -------------------------

    implementation(libs.liquibase)

    // -------------------------
    // AWS
    // -------------------------

    implementation(libs.aws.sns)
    implementation(libs.aws.sqs)
    implementation(libs.aws.ses)

    // -------------------------
    // Tests
    // -------------------------

    testImplementation(kotlin("test"))
}

kotlin {
    jvmToolchain(21)
}

application {
    mainClass.set("com.mynikatech.memgine.server.ApplicationKt")

    applicationDefaultJvmArgs = listOf(
        "-Dio.ktor.development=true"
    )
}

tasks.shadowJar {
    archiveFileName.set("memgine-server.jar")
    mergeServiceFiles()
}