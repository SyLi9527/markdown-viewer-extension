import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const VERSION_URL = 'https://fibjs.org/dist/version.txt';
const DIST_BASE_URL = 'https://fibjs.org/dist';
const MIN_BINARY_BYTES = 1024 * 1024;

function mapPlatform() {
  let os;
  switch (process.platform) {
    case 'darwin':
      os = 'darwin';
      break;
    case 'linux':
      os = 'linux';
      break;
    case 'win32':
      os = 'win32';
      break;
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }

  let arch;
  switch (process.arch) {
    case 'x64':
      arch = 'x64';
      break;
    case 'arm64':
      arch = 'arm64';
      break;
    case 'arm':
      arch = 'arm';
      break;
    case 'ia32':
      arch = 'ia32';
      break;
    case 'ppc64':
      arch = 'ppc64';
      break;
    case 'mips64el':
      arch = 'mips64';
      break;
    default:
      throw new Error(`Unsupported architecture: ${process.arch}`);
  }

  return { os, arch, ext: process.platform === 'win32' ? '.exe' : '' };
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(fetchText(res.headers.location));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Failed to fetch ${url}: ${res.statusCode}`));
        }
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => resolve(data.trim()));
      })
      .on('error', reject);
  });
}

function getStream(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(getStream(res.headers.location));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Failed to download ${url}: ${res.statusCode}`));
        }
        resolve(res);
      })
      .on('error', reject);
  });
}

async function ensureFibjsBinary() {
  const pkgPath = require.resolve('fibjs/package.json', { paths: [process.cwd()] });
  const pkgDir = path.dirname(pkgPath);
  const binDir = path.join(pkgDir, 'bin');
  const binName = process.platform === 'win32' ? 'fibjs.exe' : 'fibjs';
  const binPath = path.join(binDir, binName);

  try {
    const stat = await fsp.stat(binPath);
    if (stat.size > MIN_BINARY_BYTES) {
      return;
    }
  } catch (error) {
    // Continue to download if missing or invalid.
  }

  await fsp.mkdir(binDir, { recursive: true });

  const version = await fetchText(VERSION_URL);
  if (!version) {
    throw new Error('Failed to determine fibjs version.');
  }

  const { os, arch, ext } = mapPlatform();
  const filename = `fibjs-${version}-${os}-${arch}${ext}`;
  const url = `${DIST_BASE_URL}/${version}/${filename}`;

  const response = await getStream(url);
  const tempPath = `${binPath}.download`;
  const fileStream = fs.createWriteStream(tempPath);
  await pipeline(response, fileStream);
  await fsp.rename(tempPath, binPath);
  if (process.platform !== 'win32') {
    await fsp.chmod(binPath, 0o755);
  }

  const finalStat = await fsp.stat(binPath);
  if (finalStat.size < MIN_BINARY_BYTES) {
    throw new Error(`Downloaded fibjs binary looks too small (${finalStat.size} bytes).`);
  }
}

ensureFibjsBinary().catch((error) => {
  console.error('[fibjs] install failed:', error);
  process.exitCode = 1;
});
