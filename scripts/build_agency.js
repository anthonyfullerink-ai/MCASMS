#!/usr/bin/env node

/**
 * 🚀 White-Label Agency Build & Distribution CLI
 *
 * Compiles custom-branded, signed APKs for partner agencies with
 * automated asset overlays, Gradle property injection, and segmented OTA manifests.
 *
 * Usage:
 *   node scripts/build_agency.js --agency <agency_id> [--flavor <standard|pro>]
 *   node scripts/build_agency.js --list
 *   node scripts/build_agency.js --all
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const AGENCIES_CONFIG_PATH = path.join(ROOT_DIR, 'agencies', 'agencies.json');
const DIST_DIR = path.join(ROOT_DIR, 'dist', 'agencies');
const OTA_DIR = path.join(ROOT_DIR, 'ota');

function loadAgencies() {
  if (!fs.existsSync(AGENCIES_CONFIG_PATH)) {
    console.error(`❌ [ERROR] Configuration file not found at: ${AGENCIES_CONFIG_PATH}`);
    process.exit(1);
  }
  try {
    const raw = fs.readFileSync(AGENCIES_CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed.agencies || {};
  } catch (err) {
    console.error(`❌ [ERROR] Failed to parse agencies.json:`, err.message);
    process.exit(1);
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    agencyId: null,
    flavor: 'standard',
    buildAll: false,
    list: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--agency' && args[i + 1]) {
      options.agencyId = args[++i];
    } else if (arg === '--flavor' && args[i + 1]) {
      options.flavor = args[++i].toLowerCase();
    } else if (arg === '--all') {
      options.buildAll = true;
    } else if (arg === '--list') {
      options.list = true;
    }
  }

  return options;
}

function readVersionInfo() {
  const gradlePath = path.join(ROOT_DIR, 'app', 'build.gradle.kts');
  const content = fs.readFileSync(gradlePath, 'utf8');
  const codeMatch = content.match(/versionCode\s*=\s*(\d+)/);
  const nameMatch = content.match(/versionName\s*=\s*"([^"]+)"/);
  return {
    versionCode: codeMatch ? parseInt(codeMatch[1], 10) : 39,
    versionName: nameMatch ? nameMatch[1] : '1.9.3'
  };
}

function buildAgency(agencyId, agencyConfig, flavor = 'standard') {
  console.log(`\n============================================================`);
  console.log(`🏢 [AGENCY BUILD] Building: ${agencyConfig.appName} (${agencyId})`);
  console.log(`📦 Flavor: ${flavor.toUpperCase()} | Descriptor: ${agencyConfig.stripeDescriptor || 'Voice Hub Network'}`);
  console.log(`============================================================\n`);

  const taskName = flavor === 'pro' ? 'assembleProRelease' : 'assembleStandardRelease';
  const gradlewCmd = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';

  // Gradle parameter injection
  const gradleArgs = [
    taskName,
    `-PagencyId="${agencyId}"`,
    `-PagencyAppName="${agencyConfig.appName}"`,
    `-PagencySupportEmail="${agencyConfig.supportEmail || 'support@missedcallautosms.com'}"`,
    `-PagencyPrivacyUrl="${agencyConfig.privacyPolicyUrl || 'https://missedcallautosms.com/privacy.html'}"`,
    `-PagencyTermsUrl="${agencyConfig.termsUrl || 'https://missedcallautosms.com/terms.html'}"`,
    `-PagencyStripeDescriptor="${agencyConfig.stripeDescriptor || 'Voice Hub Network'}"`
  ];

  const fullCmd = `${gradlewCmd} ${gradleArgs.join(' ')}`;
  console.log(`⚙️ Executing Gradle: ${fullCmd}`);

  try {
    execSync(fullCmd, { cwd: ROOT_DIR, stdio: 'inherit' });
  } catch (err) {
    console.error(`❌ [BUILD FAILED] Gradle build failed for agency "${agencyId}".`);
    throw err;
  }

  // Locate built APK
  const outputFlavorDir = flavor === 'pro' ? 'proRelease' : 'standardRelease';
  const builtApkPath = path.join(ROOT_DIR, 'app', 'build', 'outputs', 'apk', flavor, 'release', `app-${flavor}-release.apk`);

  if (!fs.existsSync(builtApkPath)) {
    console.error(`❌ [ERROR] Expected APK not found at: ${builtApkPath}`);
    throw new Error('Built APK file missing');
  }

  // Ensure output directory exists
  const agencyDistDir = path.join(DIST_DIR, agencyId);
  fs.mkdirSync(agencyDistDir, { recursive: true });

  const safeAppName = agencyConfig.appName.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const targetApkName = `${safeAppName}-${flavor}.apk`;
  const targetApkPath = path.join(agencyDistDir, targetApkName);

  fs.copyFileSync(builtApkPath, targetApkPath);
  const apkStats = fs.statSync(targetApkPath);
  const sizeMb = (apkStats.size / (1024 * 1024)).toFixed(2);

  console.log(`✅ [OUTPUT APK] Copied to: ${targetApkPath} (${sizeMb} MB)`);

  // Generate / Update Segmented OTA descriptor
  const agencyOtaDir = path.join(OTA_DIR, agencyId);
  fs.mkdirSync(agencyOtaDir, { recursive: true });

  const versionInfo = readVersionInfo();
  const otaManifestPath = path.join(agencyOtaDir, 'version.json');
  const otaApkPath = path.join(agencyOtaDir, targetApkName);

  // Copy APK to OTA folder for live HTTP distribution
  fs.copyFileSync(targetApkPath, otaApkPath);

  const otaData = {
    agencyId: agencyId,
    appName: agencyConfig.appName,
    versionCode: versionInfo.versionCode,
    versionName: versionInfo.versionName,
    downloadUrl: `https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/ota/${agencyId}/${encodeURIComponent(targetApkName)}`,
    releaseNotes: `🚀 Welcome to ${agencyConfig.appName} (v${versionInfo.versionName})\n• 24/7 Inbound Call Protection & Auto SMS\n• Dedicated Voice Receptionist & Smart Routing\n• Google Calendar Instant Scheduling`,
    mandatory: false,
    minSupportedVersion: 1,
    updatedAt: new Date().toISOString()
  };

  fs.writeFileSync(otaManifestPath, JSON.stringify(otaData, null, 2), 'utf8');
  console.log(`📡 [OTA SYNC] Updated OTA manifest at: ${otaManifestPath}`);
  console.log(`🎉 [SUCCESS] Agency ${agencyConfig.appName} ready for distribution!`);
}

function main() {
  const options = parseArgs();
  const agencies = loadAgencies();

  if (options.list) {
    console.log(`\n📋 Registered Partner Agencies in agencies.json:`);
    console.log(`------------------------------------------------------------`);
    for (const [id, cfg] of Object.entries(agencies)) {
      console.log(`• ID: "${id}"`);
      console.log(`  Name: ${cfg.appName}`);
      console.log(`  Support: ${cfg.supportEmail || 'N/A'}`);
      console.log(`  Stripe Descriptor: ${cfg.stripeDescriptor || 'Voice Hub Network'}\n`);
    }
    return;
  }

  if (options.buildAll) {
    console.log(`🚀 Starting batch build for ALL ${Object.keys(agencies).length} registered agencies...`);
    for (const [id, cfg] of Object.entries(agencies)) {
      buildAgency(id, cfg, options.flavor);
    }
    console.log(`\n🎉 [ALL COMPLETE] All agency builds finished successfully.`);
    return;
  }

  if (!options.agencyId) {
    console.log(`\n💡 Usage:`);
    console.log(`  node scripts/build_agency.js --agency <agency_id> [--flavor <standard|pro>]`);
    console.log(`  node scripts/build_agency.js --list`);
    console.log(`  node scripts/build_agency.js --all\n`);
    process.exit(1);
  }

  const targetAgency = agencies[options.agencyId];
  if (!targetAgency) {
    console.error(`❌ [ERROR] Agency ID "${options.agencyId}" was not found in agencies/agencies.json.`);
    console.log(`Run 'node scripts/build_agency.js --list' to view available IDs.`);
    process.exit(1);
  }

  buildAgency(options.agencyId, targetAgency, options.flavor);
}

main();
