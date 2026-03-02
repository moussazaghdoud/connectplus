#!/usr/bin/env node
/**
 * Postinstall script: copies the Rainbow Web SDK UMD bundle to public/lib/
 * so it can be loaded via <Script> tag, avoiding Turbopack bundling issues.
 *
 * Falls back gracefully if the package isn't installed yet.
 */

const fs = require("fs");
const path = require("path");

const candidates = [
  // npm package if installed
  path.join(__dirname, "..", "node_modules", "rainbow-web-sdk", "dist", "rainbow-sdk.min.js"),
  path.join(__dirname, "..", "node_modules", "rainbow-web-sdk", "rainbow-sdk.min.js"),
];

const dest = path.join(__dirname, "..", "public", "lib", "rainbow-sdk.min.js");

// Ensure output dir exists
fs.mkdirSync(path.dirname(dest), { recursive: true });

for (const src of candidates) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`[copy-rainbow-web-sdk] Copied ${src} → ${dest}`);
    process.exit(0);
  }
}

// If the file already exists in public/lib, keep it
if (fs.existsSync(dest)) {
  console.log("[copy-rainbow-web-sdk] Using existing public/lib/rainbow-sdk.min.js");
  process.exit(0);
}

// Create a stub that logs a warning (agent page will still load)
const stub = `
// Rainbow Web SDK stub — install rainbow-web-sdk or place the real SDK here.
// Download from: https://hub.openrainbow.com/doc/sdk/web/guides
console.warn("[Rainbow] Web SDK not found. WebRTC mode will not work. Install rainbow-web-sdk or place the UMD bundle at public/lib/rainbow-sdk.min.js");
`;
fs.writeFileSync(dest, stub.trim() + "\n");
console.log("[copy-rainbow-web-sdk] Created stub at", dest);
