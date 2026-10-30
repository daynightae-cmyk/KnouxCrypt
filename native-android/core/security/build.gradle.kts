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

dependencies { testImplementation("junit:junit:4.13.2") }
tasks.test { useJUnit() }
