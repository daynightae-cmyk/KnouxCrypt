plugins { kotlin("jvm") }

// The developer machine provides JDK 21; compile portable Java 17 bytecode
// without requiring a second JDK toolchain installation.
kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}
java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

dependencies {
    // Pure-Java Argon2id (RFC 9106). No native ABI, so every Android ABI is
    // covered; the APK size increase is recorded in mission 37 evidence.
    implementation("org.bouncycastle:bcprov-jdk18on:1.78.1")
    testImplementation("junit:junit:4.13.2")
}
tasks.test { useJUnit() }
