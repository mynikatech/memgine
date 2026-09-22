import org.gradle.api.initialization.resolve.RepositoriesMode
pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        maven {
            url = uri("https://nexus.poynt.com/content/repositories/releases")
        }
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)

    repositories {
        google()
        mavenCentral()
        maven {
            url = uri("https://nexus.poynt.com/content/repositories/releases")
        }
    }
}

rootProject.name = "Memgine"

include(":server")
include(":DB")
include(":lambda:email-processor")
include(":lambda:whatsapp-processor")
include(":lambda:sms-processor")
include(":poynt-app")
