plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "com.mynikatech.memgine.poynt"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.mynikatech.memgine.poynt"
        minSdk = 23
        targetSdk = 24
        versionCode = 1
        versionName = "0.1.0"
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        debug {
            buildConfigField(
                "String",
                "MEMGINE_BASE_URL",
                "\"${providers.gradleProperty("memgineBaseUrl").orElse("").get()}\""
            )
        }
        release {
            buildConfigField(
                "String",
                "MEMGINE_BASE_URL",
                "\"${providers.gradleProperty("memgineBaseUrl").orElse("").get()}\""
            )
        }
    }
}

dependencies {
    implementation("co.poynt.api:android-api-model:1.2.288@jar")
    implementation("co.poynt.android.sdk:poynt-sdk:1.3.19@aar")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
}
