import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

// release 签名：keystore 文件不入库（gitignore），密码用环境变量覆盖
val releaseStoreFile = file("keystore/musicstorm-release.jks")
val releaseStorePassword = providers.gradleProperty("MUSICSTORM_STORE_PASSWORD")
    .orElse(providers.environmentVariable("MUSICSTORM_STORE_PASSWORD"))
    .orElse("lekAsQhDYXHxahrTpDHBAoiw")
val releaseKeyAlias = "com.yuinijika.musicstorm"
val releaseKeyPassword = providers.gradleProperty("MUSICSTORM_KEY_PASSWORD")
    .orElse(providers.environmentVariable("MUSICSTORM_KEY_PASSWORD"))
    .orElse("lekAsQhDYXHxahrTpDHBAoiw")

android {
    compileSdk = 36
    namespace = "com.yuinijika.musicstorm"
    // release 签名配置：keystore 存在时启用，缺失时退回 unsigned（便于 CI/调试）
    signingConfigs {
        if (releaseStoreFile.exists()) {
            create("release") {
                storeFile = releaseStoreFile
                storePassword = releaseStorePassword.get()
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword.get()
            }
        }
    }
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "com.yuinijika.musicstorm"
        minSdk = 24
        targetSdk = 36
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = System.getenv("ANDROID_VERSION_NAME") ?: tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            // 暂时关闭 R8/ProGuard minify：默认 minify=true 但 tauri Android 模板
            // 没带 keep 规则，会误移除 Rust.shouldOverride / MainActivity / PluginManager
            // 等关键 JNI 入口，导致 release 闪退。后续引入 tauri 官方 proguard 后再开。
            isMinifyEnabled = false
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
            if (releaseStoreFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }
}

rust {
    rootDirRel = "../../../"
}

// Windows 修复：tauri CLI（cargo-mobile2）用 symlink 链接 .so 到 jniLibs，
// 但 Windows 打包 APK 时 symlink 会被当成 0 字节文件 → 启动闪退。
// 这里在打包前把 symlink 替换为真实文件（从 cargo release 产物复制）。
tasks.configureEach {
    if (name.startsWith("mergeUniversalReleaseJniLibFolders") ||
        name.startsWith("mergeUniversalDebugJniLibFolders")) {
        doFirst {
            val abiToTarget = mapOf(
                "arm64-v8a" to "aarch64-linux-android",
                "armeabi-v7a" to "armv7-linux-androideabi",
                "x86" to "i686-linux-android",
                "x86_64" to "x86_64-linux-android",
            )
            for ((abi, target) in abiToTarget) {
                val jniFile = file("src/main/jniLibs/$abi/libmusic_storm_lib.so")
                val cargoSo = file("../../../target/$target/release/libmusic_storm_lib.so")
                if (jniFile.exists() && cargoSo.exists()) {
                    cargoSo.copyTo(jniFile, overwrite = true)
                    println("Replaced jniLibs $abi with real file (${cargoSo.length()} bytes)")
                }
            }
        }
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.documentfile:documentfile:1.0.1")
    implementation("androidx.media:media:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = "tauri.build.gradle.kts")