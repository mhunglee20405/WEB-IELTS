const fs = require("fs");
const path = require("path");

const srcDir = path.resolve(__dirname, "../node_modules/tinymce");
const destDir = path.resolve(__dirname, "../public/tinymce");

if (!fs.existsSync(srcDir)) {
  console.warn("[copy-tinymce] TinyMCE package not found in node_modules, skipping copy.");
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });

const items = ["tinymce.min.js", "skins", "themes", "models", "icons", "plugins"];

for (const item of items) {
  const src = path.join(srcDir, item);
  const dest = path.join(destDir, item);
  if (fs.existsSync(src)) {
    fs.cpSync(src, dest, { recursive: true });
  }
}

console.log("[copy-tinymce] Successfully copied TinyMCE assets to public/tinymce");
