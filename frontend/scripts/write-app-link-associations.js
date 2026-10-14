const fs = require("fs");
const path = require("path");

const outputDirectory = process.argv[2];

if (!outputDirectory) {
  throw new Error("Usage: write-app-link-associations.js <output-directory>");
}

const value = (name) => process.env[name]?.trim() || undefined;
const list = (name) =>
  (value(name) || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
const associationDirectory = path.join(outputDirectory, ".well-known");
const assetLinksPath = path.join(associationDirectory, "assetlinks.json");
const appleAssociationPath = path.join(
  associationDirectory,
  "apple-app-site-association",
);

fs.rmSync(assetLinksPath, { force: true });
fs.rmSync(appleAssociationPath, { force: true });

const androidPackage = value("EXPO_PUBLIC_ANDROID_APP_LINK_PACKAGE");
const androidFingerprints = list(
  "EXPO_PUBLIC_ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS",
);
const appleAppIds = list("EXPO_PUBLIC_IOS_APP_LINK_APP_IDS");

if (
  androidFingerprints.some(
    (fingerprint) =>
      !/^(?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/.test(fingerprint),
  )
) {
  throw new Error(
    "EXPO_PUBLIC_ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS must contain comma-separated SHA-256 fingerprints.",
  );
}

if (
  appleAppIds.some(
    (appId) => !/^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/.test(appId),
  )
) {
  throw new Error(
    "EXPO_PUBLIC_IOS_APP_LINK_APP_IDS must contain comma-separated Apple Team ID and bundle ID values.",
  );
}

if (androidPackage && androidFingerprints.length > 0) {
  fs.mkdirSync(associationDirectory, { recursive: true });
  fs.writeFileSync(
    assetLinksPath,
    `${JSON.stringify(
      [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: androidPackage,
            sha256_cert_fingerprints: androidFingerprints,
          },
        },
      ],
      null,
      2,
    )}\n`,
  );
} else {
  console.warn(
    "Skipping Android Digital Asset Links: package or signing fingerprint is not configured.",
  );
}

if (appleAppIds.length > 0) {
  fs.mkdirSync(associationDirectory, { recursive: true });
  fs.writeFileSync(
    appleAssociationPath,
    `${JSON.stringify(
      {
        applinks: {
          apps: [],
          details: [
            {
              appIDs: appleAppIds,
              components: [
                { "/": "/qr/*" },
                { "/": "/discover/*" },
                { "/": "/join" },
                { "/": "/join/*" },
              ],
            },
          ],
        },
      },
      null,
      2,
    )}\n`,
  );
} else {
  console.warn(
    "Skipping Apple App Site Association: Apple application identifier is not configured.",
  );
}
