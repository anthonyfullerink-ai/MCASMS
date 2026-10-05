plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
    alias(libs.plugins.google.services)
}

android {
    namespace = "com.missedcall.autotext"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.missedcall.autotext"
        minSdk = 26
        targetSdk = 35
        versionCode = 41
        versionName = "2.0.1"


        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        val agencyAppName = (project.findProperty("agencyAppName") as? String)?.ifBlank { null }
        val agencyId = (project.findProperty("agencyId") as? String)?.ifBlank { null } ?: "default"
        val agencySupportEmail = (project.findProperty("agencySupportEmail") as? String)?.ifBlank { null } ?: "support@missedcallautosms.com"
        val agencyPrivacyUrl = (project.findProperty("agencyPrivacyUrl") as? String)?.ifBlank { null } ?: "https://missedcallautosms.com/privacy.html"
        val agencyTermsUrl = (project.findProperty("agencyTermsUrl") as? String)?.ifBlank { null } ?: "https://missedcallautosms.com/terms.html"
        val agencyStripeDescriptor = (project.findProperty("agencyStripeDescriptor") as? String)?.ifBlank { null } ?: "Voice Hub Network"

        manifestPlaceholders["appName"] = agencyAppName ?: "Missed Call Auto SMS"

        buildConfigField("String", "AGENCY_ID", "\"$agencyId\"")
        buildConfigField("String", "AGENCY_SUPPORT_EMAIL", "\"$agencySupportEmail\"")
        buildConfigField("String", "AGENCY_PRIVACY_URL", "\"$agencyPrivacyUrl\"")
        buildConfigField("String", "AGENCY_TERMS_URL", "\"$agencyTermsUrl\"")
        buildConfigField("String", "STRIPE_DESCRIPTOR", "\"$agencyStripeDescriptor\"")
    }

    signingConfigs {
        create("release") {
            storeFile = file("${rootDir}/keystore/release.jks")
            storePassword = "MissedCallAutoText2026!"
            keyAlias = "missedcallkey"
            keyPassword = "MissedCallAutoText2026!"
            enableV1Signing = true
            enableV2Signing = true
        }
    }

    flavorDimensions += "edition"
    productFlavors {
        val agencyAppName = (project.findProperty("agencyAppName") as? String)?.ifBlank { null }
        create("standard") {
            dimension = "edition"
            val displayName = agencyAppName ?: "Missed Call Auto-SMS"
            buildConfigField("boolean", "IS_PRO_EDITION", "false")
            buildConfigField("String", "EDITION_NAME", "\"Flagship Edition\"")
            buildConfigField("String", "APP_DISPLAY_NAME", "\"$displayName\"")
            manifestPlaceholders["appName"] = displayName
        }
        create("pro") {
            dimension = "edition"
            val displayName = agencyAppName?.let { "$it Pro" } ?: "Missed Call Auto-SMS Pro"
            buildConfigField("boolean", "IS_PRO_EDITION", "true")
            buildConfigField("String", "EDITION_NAME", "\"Pro Automation Edition\"")
            buildConfigField("String", "APP_DISPLAY_NAME", "\"$displayName\"")
            manifestPlaceholders["appName"] = displayName
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("release")
        }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }

    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    
    val composeBom = platform(libs.androidx.compose.bom)
    implementation(composeBom)
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.material.icons.extended)

    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)

    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.gson)
    implementation("org.nanohttpd:nanohttpd:2.3.1")
    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
    implementation("com.google.firebase:firebase-messaging")
    testImplementation("junit:junit:4.13.2")
}
