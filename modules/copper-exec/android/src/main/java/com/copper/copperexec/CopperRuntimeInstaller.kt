package com.copper.copperexec

import android.content.Context
import android.os.Build
import android.system.Os
import android.system.OsConstants
import java.io.BufferedReader
import java.security.DigestInputStream
import java.security.MessageDigest
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.io.InputStreamReader
import java.nio.charset.StandardCharsets
import java.util.Properties
import java.util.zip.ZipInputStream

/**
 * Installs a Copper-prefix runtime bootstrap into app-private executable
 * storage. It deliberately never extracts a runtime to /storage: shared and
 * removable Android volumes are noexec and do not provide the Unix filesystem
 * features required by APT packages.
 *
 * The archive is supplied by the reproducible Copper Runtime build pipeline as
 * an Android asset. Until that verified asset is included in a build, status
 * remains `bundle_missing` and installation is refused; there is no fallback to
 * an upstream com.termux bootstrap.
 */
internal object CopperRuntimeInstaller {
  private const val COPPER_PACKAGE_ID = "com.copper.chat"
  private const val BOOTSTRAP_ASSET_AARCH64 = "copper-runtime/copper-runtime-bootstrap-aarch64.zip"
  private const val BOOTSTRAP_MANIFEST_AARCH64 = "$BOOTSTRAP_ASSET_AARCH64.json"
  private const val QUOTA_BYTES = 2L * 1024L * 1024L * 1024L
  private const val MIN_FREE_HEADROOM_BYTES = 64L * 1024L * 1024L
  private const val METADATA_DIRECTORY = "copper-runtime"
  private const val METADATA_FILE = "installation.properties"
  private const val PREFIX_DIRECTORY = "usr"
  private const val STAGING_DIRECTORY = "usr-staging"
  private const val PREVIOUS_DIRECTORY = "usr-previous"
  private const val HOME_DIRECTORY = "home"
  private val installLock = Any()

  private data class Symlink(val target: String, val path: File)
  private data class BootstrapAsset(val archivePath: String, val expectedSha256: String)

  fun status(context: Context): Map<String, Any?> {
    val layout = layout(context)
    val bundleAvailable = bootstrapAssetForCurrentAbi(context) != null
    val prefixReady = isRuntimeReady(layout.prefix)
    val prefixExists = layout.prefix.exists()
    val bytesUsed = runtimeBytes(layout)
    val state = when {
      context.packageName != COPPER_PACKAGE_ID -> "package_mismatch"
      !bundleAvailable -> "bundle_missing"
      prefixReady -> "ready"
      prefixExists -> "repair_required"
      else -> "not_installed"
    }

    return mapOf(
      "state" to state,
      "ready" to (prefixReady && context.packageName == COPPER_PACKAGE_ID),
      "bundleAvailable" to bundleAvailable,
      "supportedAbi" to (Build.SUPPORTED_ABIS.firstOrNull() ?: "unknown"),
      "runtimePrefix" to layout.prefix.absolutePath,
      "runtimeHome" to layout.home.absolutePath,
      "persistentBytes" to bytesUsed,
      "quotaBytes" to QUOTA_BYTES,
      "remainingBytes" to (QUOTA_BYTES - bytesUsed).coerceAtLeast(0),
      "freeDeviceBytes" to context.filesDir.usableSpace,
      "packageName" to context.packageName,
      "expectedPackageName" to COPPER_PACKAGE_ID
    )
  }

  /** Atomically install/reinstall the verified bundled bootstrap. */
  fun install(context: Context, replaceExisting: Boolean): Map<String, Any?> = synchronized(installLock) {
    requireCopperPackage(context)
    val layout = layout(context)
    val asset = bootstrapAssetForCurrentAbi(context)
      ?: throw IllegalStateException("Copper Runtime bootstrap and signed build manifest are not bundled for this device ABI. Install a Copper build containing the verified arm64 runtime bundle.")

    if (isRuntimeReady(layout.prefix) && !replaceExisting) return status(context)
    if (runtimeBytes(layout) > QUOTA_BYTES) {
      throw IllegalStateException("Copper Runtime already exceeds its 2 GiB storage limit. Remove packages or clear the runtime before repairing it.")
    }
    if (context.filesDir.usableSpace < MIN_FREE_HEADROOM_BYTES) {
      throw IllegalStateException("Not enough free internal storage to safely install Copper Runtime. Keep at least 64 MiB free in addition to the bootstrap extraction size.")
    }

    deleteTree(layout.staging)
    deleteTree(layout.previous)
    require(layout.staging.mkdirs() || layout.staging.isDirectory) {
      "Could not create Copper Runtime staging directory."
    }

    try {
      verifyBootstrapAssetDigest(context, asset)
      val extracted = extractBootstrap(context, asset.archivePath, layout.staging, layout.home)
      if (runtimeBytes(layout, includePrefix = false) > QUOTA_BYTES) {
        throw IllegalStateException("Copper Runtime bootstrap exceeds the configured 2 GiB runtime storage limit.")
      }
      verifyPrefix(layout.staging)
      promoteStaging(layout)
      ensureHome(layout.home)
      writeMetadata(layout, asset, extracted)
      status(context)
    } catch (error: Exception) {
      deleteTree(layout.staging)
      // The old prefix is restored by promoteStaging() if promotion itself fails.
      throw error
    }
  }

  /** Reinstall the runtime prefix while retaining terminal settings in $HOME. */
  fun repair(context: Context): Map<String, Any?> = install(context, replaceExisting = true)

  /**
   * Remove the executable/package prefix. `preserveHome` keeps shell settings
   * only; it does not keep installed packages because packages belong in usr.
   */
  fun remove(context: Context, preserveHome: Boolean): Map<String, Any?> = synchronized(installLock) {
    requireCopperPackage(context)
    val layout = layout(context)
    deleteTree(layout.staging)
    deleteTree(layout.previous)
    deleteTree(layout.prefix)
    deleteTree(layout.metadataDirectory)
    if (!preserveHome) deleteTree(layout.home)
    status(context)
  }

  private data class Layout(
    val files: File,
    val prefix: File,
    val staging: File,
    val previous: File,
    val home: File,
    val metadataDirectory: File
  )

  private fun layout(context: Context): Layout {
    val files = context.filesDir.canonicalFile
    return Layout(
      files = files,
      prefix = File(files, PREFIX_DIRECTORY),
      staging = File(files, STAGING_DIRECTORY),
      previous = File(files, PREVIOUS_DIRECTORY),
      home = File(files, HOME_DIRECTORY),
      metadataDirectory = File(files, METADATA_DIRECTORY)
    )
  }

  private fun requireCopperPackage(context: Context) {
    check(context.packageName == COPPER_PACKAGE_ID) {
      "Copper Runtime binaries are compiled for $COPPER_PACKAGE_ID, but this build is ${context.packageName}. Refusing to install an incompatible prefix."
    }
  }

  private fun bootstrapAssetForCurrentAbi(context: Context): BootstrapAsset? {
    val isArm64 = Build.SUPPORTED_ABIS.any { it == "arm64-v8a" }
    if (!isArm64) return null
    return try {
      context.assets.open(BOOTSTRAP_ASSET_AARCH64).close()
      val manifest = context.assets.open(BOOTSTRAP_MANIFEST_AARCH64)
        .bufferedReader(StandardCharsets.UTF_8)
        .use { it.readText() }
      val hash = Regex("\\\"sha256\\\"\\s*:\\s*\\\"([a-fA-F0-9]{64})\\\"")
        .find(manifest)
        ?.groupValues
        ?.getOrNull(1)
        ?.lowercase()
        ?: return null
      BootstrapAsset(BOOTSTRAP_ASSET_AARCH64, hash)
    } catch (_: Exception) {
      null
    }
  }

  private fun verifyBootstrapAssetDigest(context: Context, asset: BootstrapAsset) {
    val digest = MessageDigest.getInstance("SHA-256")
    DigestInputStream(context.assets.open(asset.archivePath), digest).use { input ->
      val buffer = ByteArray(32 * 1024)
      while (input.read(buffer) >= 0) {
        // DigestInputStream updates the digest during reads.
      }
    }
    val actual = digest.digest().joinToString(separator = "") { byte -> "%02x".format(byte.toInt() and 0xff) }
    if (!actual.equals(asset.expectedSha256, ignoreCase = true)) {
      throw SecurityException("Copper Runtime bootstrap integrity check failed. The bundled archive does not match its verified build manifest.")
    }
  }

  private fun extractBootstrap(context: Context, asset: String, staging: File, home: File): Long {
    val finalPrefix = layout(context).prefix
    val symlinks = mutableListOf<Symlink>()
    val seenEntries = mutableSetOf<String>()
    var extractedBytes = 0L

    context.assets.open(asset).use { assetStream ->
      ZipInputStream(assetStream).use { zip ->
        while (true) {
          val entry = zip.nextEntry ?: break
          val name = entry.name
          if (!seenEntries.add(name)) throw IllegalStateException("Bootstrap archive contains a duplicate entry: $name")

          if (name == "SYMLINKS.txt") {
            parseSymlinks(zip, staging, finalPrefix, symlinks)
            zip.closeEntry()
            continue
          }

          val output = safeChild(staging, name)
          if (entry.isDirectory) {
            require(output.mkdirs() || output.isDirectory) { "Could not create runtime directory: $name" }
          } else {
            val parent = output.parentFile ?: throw IllegalStateException("Bootstrap entry has no parent: $name")
            require(parent.mkdirs() || parent.isDirectory) { "Could not create runtime parent directory: $name" }
            FileOutputStream(output).use { destination ->
              extractedBytes += copyWithLimit(zip, destination, QUOTA_BYTES - runtimeBytes(layout(context), includePrefix = false))
            }
            if (needsExecutableMode(name)) Os.chmod(output.absolutePath, 0b111000000)
          }
          zip.closeEntry()
        }
      }
    }

    if (symlinks.isEmpty()) throw IllegalStateException("Bootstrap archive did not contain its required SYMLINKS.txt manifest.")
    for (symlink in symlinks) {
      val targetPath = if (File(symlink.target).isAbsolute) {
        File(symlink.target).canonicalFile
      } else {
        File(symlink.path.parentFile, symlink.target).canonicalFile
      }
      // Pinned upstream bootstraps contain both relative links and absolute
      // links under the final TERMUX_PREFIX. The latter intentionally point to
      // the promoted prefix rather than the temporary staging directory.
      if (!isInside(staging, targetPath) && !isInside(finalPrefix, targetPath)) {
        throw IllegalStateException("Bootstrap symlink escapes Copper Runtime: ${symlink.path.name}")
      }
      Os.symlink(symlink.target, symlink.path.absolutePath)
    }
    ensureHome(home)
    return extractedBytes
  }

  private fun parseSymlinks(input: InputStream, staging: File, finalPrefix: File, symlinks: MutableList<Symlink>) {
    // Do not close this reader: it wraps the ZipInputStream used for the next
    // archive entry.
    val reader = BufferedReader(InputStreamReader(input, StandardCharsets.UTF_8))
    while (true) {
      val line = reader.readLine() ?: break
      val separator = line.indexOf('←')
      if (separator <= 0 || separator != line.lastIndexOf('←') || separator == line.lastIndex) {
        throw IllegalStateException("Malformed bootstrap symlink entry.")
      }
      val target = line.substring(0, separator)
      if (File(target).isAbsolute) {
        val absoluteTarget = File(target).canonicalFile
        if (absoluteTarget == finalPrefix.canonicalFile || !isInside(finalPrefix, absoluteTarget)) {
          throw IllegalStateException("Bootstrap symlink target escapes Copper Runtime.")
        }
      }
      val link = safeChild(staging, line.substring(separator + 1))
      val parent = link.parentFile ?: throw IllegalStateException("Bootstrap symlink has no parent.")
      require(parent.mkdirs() || parent.isDirectory) { "Could not create bootstrap symlink parent." }
      symlinks += Symlink(target, link)
    }
  }

  private fun copyWithLimit(input: InputStream, output: FileOutputStream, remainingQuota: Long): Long {
    if (remainingQuota <= 0) throw IllegalStateException("Copper Runtime reached its 2 GiB storage limit during bootstrap extraction.")
    val buffer = ByteArray(16 * 1024)
    var total = 0L
    while (true) {
      val read = input.read(buffer)
      if (read < 0) break
      total += read
      if (total > remainingQuota) {
        throw IllegalStateException("Copper Runtime bootstrap exceeds its 2 GiB storage limit.")
      }
      output.write(buffer, 0, read)
    }
    return total
  }

  private fun promoteStaging(layout: Layout) {
    if (layout.previous.exists()) deleteTree(layout.previous)
    val hadExisting = layout.prefix.exists()
    if (hadExisting && !layout.prefix.renameTo(layout.previous)) {
      throw IllegalStateException("Could not preserve the existing Copper Runtime before replacement.")
    }
    if (!layout.staging.renameTo(layout.prefix)) {
      if (hadExisting && layout.previous.exists()) layout.previous.renameTo(layout.prefix)
      throw IllegalStateException("Could not promote the verified Copper Runtime staging directory.")
    }
    if (hadExisting) deleteTree(layout.previous)
  }

  private fun verifyPrefix(prefix: File) {
    // termux-exec 2.x intentionally provides an LD_PRELOAD helper/library,
    // not the obsolete bin/termux-exec command. Keep this device-side check
    // aligned with the CI bootstrap contract so a valid archive cannot install
    // successfully and then be silently reported as never-ready.
    val requiredExecutables = listOf(
      "bin/bash",
      "bin/apt",
      "bin/pkg",
      "bin/termux-setup-storage",
      "bin/termux-exec-ld-preload-lib"
    )
    for (relativePath in requiredExecutables) {
      val entry = File(prefix, relativePath)
      if (!entry.isFile) throw IllegalStateException("Copper Runtime bootstrap is missing $relativePath.")
      if (!entry.canExecute()) throw IllegalStateException("Copper Runtime bootstrap entry is not executable: $relativePath.")
    }

    // isFile() follows the bootstrap-restored libtermux-exec.so symlink and
    // therefore proves its target exists too. Shared libraries need not have
    // executable permission, unlike the shell and helper commands above.
    val preloadLibrary = File(prefix, "lib/libtermux-exec.so")
    if (!preloadLibrary.isFile) {
      throw IllegalStateException("Copper Runtime bootstrap is missing the termux-exec preload library.")
    }
  }

  private fun isRuntimeReady(prefix: File): Boolean = try {
    verifyPrefix(prefix)
    true
  } catch (_: Exception) {
    false
  }

  private fun ensureHome(home: File) {
    require(home.mkdirs() || home.isDirectory) { "Could not create Copper Runtime home directory." }
    Os.chmod(home.absolutePath, 0b111000000)
  }

  private fun writeMetadata(layout: Layout, asset: BootstrapAsset, bootstrapBytes: Long) {
    require(layout.metadataDirectory.mkdirs() || layout.metadataDirectory.isDirectory) {
      "Could not create Copper Runtime metadata directory."
    }
    val properties = Properties().apply {
      setProperty("product", "Copper Runtime")
      setProperty("asset", asset.archivePath)
      setProperty("bootstrapSha256", asset.expectedSha256)
      setProperty("bootstrapBytes", bootstrapBytes.toString())
      setProperty("runtimePrefix", layout.prefix.absolutePath)
      setProperty("runtimeHome", layout.home.absolutePath)
      setProperty("quotaBytes", QUOTA_BYTES.toString())
      setProperty("installedAtEpochMs", System.currentTimeMillis().toString())
    }
    FileOutputStream(File(layout.metadataDirectory, METADATA_FILE)).use { output ->
      properties.store(output, "Copper Runtime installation metadata")
    }
  }

  private fun needsExecutableMode(path: String): Boolean =
    path.startsWith("bin/") ||
      path.startsWith("libexec/") ||
      path == "lib/apt/apt-helper" ||
      path.startsWith("lib/apt/methods/")

  private fun safeChild(root: File, relativePath: String): File {
    require(relativePath.isNotBlank() && !File(relativePath).isAbsolute && !relativePath.contains('\u0000')) {
      "Unsafe bootstrap archive path."
    }
    val candidate = File(root, relativePath).canonicalFile
    require(isInside(root, candidate)) { "Bootstrap archive path escapes staging: $relativePath" }
    return candidate
  }

  private fun isInside(root: File, child: File): Boolean {
    val rootPath = root.canonicalPath.trimEnd(File.separatorChar)
    val childPath = child.canonicalPath
    return childPath == rootPath || childPath.startsWith(rootPath + File.separator)
  }

  private fun runtimeBytes(layout: Layout, includePrefix: Boolean = true): Long {
    val entries = buildList {
      if (includePrefix) add(layout.prefix)
      add(layout.staging)
      add(layout.previous)
      add(layout.home)
      add(layout.metadataDirectory)
    }
    return entries.sumOf(::treeBytes)
  }

  private fun treeBytes(file: File): Long {
    if (!file.exists() || isSymbolicLink(file)) return 0L
    if (file.isFile) return file.length()
    return file.listFiles()?.sumOf(::treeBytes) ?: 0L
  }

  private fun deleteTree(file: File) {
    if (!file.exists() && !isSymbolicLink(file)) return
    if (!isSymbolicLink(file) && file.isDirectory) {
      file.listFiles()?.forEach(::deleteTree)
    }
    if (file.exists() || isSymbolicLink(file)) {
      if (!file.delete()) throw IllegalStateException("Could not delete ${file.absolutePath}")
    }
  }

  private fun isSymbolicLink(file: File): Boolean = try {
    (Os.lstat(file.absolutePath).st_mode and OsConstants.S_IFMT) == OsConstants.S_IFLNK
  } catch (_: Exception) {
    false
  }
}
