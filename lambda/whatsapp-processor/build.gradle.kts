plugins { alias(libs.plugins.kotlin.jvm); alias(libs.plugins.kotlin.serialization) }
dependencies {
    implementation(libs.kotlinx.serialization.json)
    implementation("com.amazonaws:aws-lambda-java-core:1.2.3")
    implementation("com.amazonaws:aws-lambda-java-events:3.11.4")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.slf4j:slf4j-api:2.0.13")
    implementation(libs.logback.classic)
}
tasks.jar { duplicatesStrategy = DuplicatesStrategy.EXCLUDE; from({ configurations.runtimeClasspath.get().filter { it.name.endsWith("jar") }.map { zipTree(it) } }); manifest { attributes["Main-Class"] = "com.mynikatech.memgine.lambda.whatsapp.WhatsAppProcessorHandler" }; archiveFileName.set("memgine-whatsapp-processor.jar") }
