const fs = require('node:fs');
const path = require('node:path');

function readLocalEnv(envPath) {
  if (!fs.existsSync(envPath)) return {};

  return Object.fromEntries(
    fs.readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/))
      .filter(Boolean)
      .map(([, key, rawValue]) => [key, rawValue.replace(/^(['"])(.*)\1$/, '$2')]),
  );
}

const localEnv = readLocalEnv(path.join(__dirname, '.env'));
const apiUrl = (process.env.INVENTORY_API_URL || localEnv.INVENTORY_API_URL || 'https://inventory-management-iuz7.onrender.com').trim();

let parsedUrl;
try {
  parsedUrl = new URL(apiUrl);
} catch {
  throw new Error('INVENTORY_API_URL must be a valid absolute URL.');
}

if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
  throw new Error('INVENTORY_API_URL must use http:// or https://.');
}

const output = `window.INVENTORY_API_URL = ${JSON.stringify(parsedUrl.origin)};\n`;
fs.writeFileSync(path.join(__dirname, 'runtime-config.js'), output, 'utf8');
console.log(`Frontend API configured: ${parsedUrl.origin}`);
