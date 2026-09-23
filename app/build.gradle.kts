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
        versionCode = 17
        versionName = "1.7.0"


        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        manifestPlaceholders["appName"] = "Missed Call Auto SMS"
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
        create("standard") {
            dimension = "edition"
            buildConfigField("boolean", "IS_PRO_EDITION", "false")
            buildConfigField("String", "EDITION_NAME", "\"Flagship Edition\"")
            manifestPlaceholders["appName"] = "Missed Call Auto-SMS"
        }
        create("pro") {
            dimension = "edition"
            buildConfigField("boolean", "IS_PRO_EDITION", "true")
            buildConfigField("String", "EDITION_NAME", "\"Pro Automation Edition\"")
            manifestPlaceholders["appName"] = "Missed Call Auto-SMS Pro"
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
