import java.net.URI
import java.nio.charset.StandardCharsets
import java.util.Base64
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

val releaseBuildRequested = gradle.startParameter.taskNames.any { taskName ->
    val task = taskName.substringAfterLast(':').lowercase()
    task == "assemble" || task == "build" || task.contains("release")
}

fun configuredValue(name: String): String? =
    providers.gradleProperty(name)
        .orElse(providers.environmentVariable(name))
        .orNull
        ?.trim()
        ?.takeIf { it.isNotEmpty() }

val configuredApplicationId = configuredValue("TICKETIN_APPLICATION_ID")
    ?: throw GradleException(
        "TICKETIN_APPLICATION_ID wajib diisi dari environment atau -P untuk setiap Android build."
    )
val canonicalApplicationId = "com.mhhanif.ticketin"

val applicationIdPattern = Regex("^[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)+$")
if (!applicationIdPattern.matches(configuredApplicationId)) {
    throw GradleException("TICKETIN_APPLICATION_ID bukan application ID Android yang valid.")
}
if (configuredApplicationId == "com.example" ||
    configuredApplicationId.startsWith("com.example.")) {
    throw GradleException("TICKETIN_APPLICATION_ID tidak boleh menggunakan com.example.*.")
}
if (configuredApplicationId != canonicalApplicationId) {
    throw GradleException(
        "TICKETIN_APPLICATION_ID harus menggunakan canonical value $canonicalApplicationId."
    )
}

fun decodeDartDefine(name: String): String? {
    val encodedDefines = providers.gradleProperty("dart-defines").orNull ?: return null
    return encodedDefines
        .split(',')
        .asSequence()
        .mapNotNull { encoded ->
            runCatching {
                String(Base64.getDecoder().decode(encoded), StandardCharsets.UTF_8)
            }.getOrNull()
        }
        .firstOrNull { define -> define.startsWith("$name=") }
        ?.substringAfter('=')
        ?.trim()
        ?.takeIf { it.isNotEmpty() }
}

if (releaseBuildRequested) {
    val releaseApiBaseUrl = decodeDartDefine("API_BASE_URL")
    val parsedUrl = releaseApiBaseUrl?.let { value ->
        runCatching { URI(value) }.getOrNull()
    }
    val host = parsedUrl?.host?.lowercase()
    val localHosts = setOf("localhost", "127.0.0.1", "::1", "10.0.2.2", "10.0.3.2")
    if (parsedUrl == null ||
        parsedUrl.scheme != "https" ||
        host.isNullOrBlank() ||
        host in localHosts) {
        throw GradleException(
            "Release API_BASE_URL wajib diberikan via --dart-define, memakai HTTPS, dan tidak boleh menuju host lokal atau emulator."
        )
    }
}

val signingProperties = Properties()
val signingPropertiesFile = rootProject.file("key.properties")
if (signingPropertiesFile.isFile) {
    signingPropertiesFile.inputStream().use(signingProperties::load)
}

fun signingValue(environmentName: String, propertyName: String): String? =
    configuredValue(environmentName)
        ?: signingProperties.getProperty(propertyName)
            ?.trim()
            ?.takeIf { it.isNotEmpty() }

val releaseStoreFilePath = signingValue("TICKETIN_SIGNING_STORE_FILE", "storeFile")
val releaseStorePassword = signingValue("TICKETIN_SIGNING_STORE_PASSWORD", "storePassword")
val releaseKeyAlias = signingValue("TICKETIN_SIGNING_KEY_ALIAS", "keyAlias")
val releaseKeyPassword = signingValue("TICKETIN_SIGNING_KEY_PASSWORD", "keyPassword")
val releaseSigningConfigured = !releaseStoreFilePath.isNullOrBlank() &&
    !releaseStorePassword.isNullOrBlank() &&
    !releaseKeyAlias.isNullOrBlank() &&
    !releaseKeyPassword.isNullOrBlank()

if (releaseBuildRequested) {
    if (!releaseSigningConfigured) {
        throw GradleException(
            "Release signing belum dikonfigurasi. Sediakan android/key.properties (ignored) atau TICKETIN_SIGNING_STORE_FILE, TICKETIN_SIGNING_STORE_PASSWORD, TICKETIN_SIGNING_KEY_ALIAS, dan TICKETIN_SIGNING_KEY_PASSWORD."
        )
    }
    val storeFileName = rootProject.file(releaseStoreFilePath!!).name.lowercase()
    if (releaseKeyAlias.equals("AndroidDebugKey", ignoreCase = true) ||
        storeFileName == "debug.keystore") {
        throw GradleException("Release signing tidak boleh memakai debug keystore atau alias debug.")
    }
    if (!rootProject.file(releaseStoreFilePath!!).isFile) {
        throw GradleException("File keystore release tidak ditemukan pada TICKETIN_SIGNING_STORE_FILE/key.properties.")
    }
}

android {
    namespace = "com.ticketin.eventgate"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = configuredApplicationId
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            if (releaseSigningConfigured) {
                storeFile = rootProject.file(releaseStoreFilePath!!)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
