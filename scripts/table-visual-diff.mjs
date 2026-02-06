import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const fixturesDir = path.join(repoRoot, 'fixtures', 'tables');
const diffDir = path.join(repoRoot, 'temp', 'table-diff');

const options = parseArgs(process.argv.slice(2));

const fixtureFiles = await listFixtures(fixturesDir, options.fixture);
if (fixtureFiles.length === 0) {
  console.error('No fixtures found in fixtures/tables.');
  process.exit(1);
}

await fs.mkdir(diffDir, { recursive: true });

const browser = await chromium.launch({ headless: !options.headed });
const page = await browser.newPage({
  viewport: { width: 1600, height: 1200 },
  deviceScaleFactor: options.captureScale
});

let failures = 0;

for (const file of fixtureFiles) {
  const fixtureName = path.basename(file);
  const fixtureHtml = await fs.readFile(file, 'utf8');
  const wrappedHtml = `<div class="fixture-root">${fixtureHtml}</div>`;

  await page.setContent(buildPageHtml(fixtureHtml), { waitUntil: 'load' });

  const legacy = await page.evaluate(async ({ html, themeConfig }) => {
    function sanitizeHtml(input) {
      try {
        const container = document.createElement('div');
        container.innerHTML = input;
        sanitizeNodeTree(container);
        return container.innerHTML;
      } catch {
        return input;
      }
    }

    function sanitizeNodeTree(root) {
      const blockedTags = new Set(['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'AUDIO', 'VIDEO']);
      const stack = [];

      Array.from(root.childNodes).forEach((child) => {
        if (child.nodeType === Node.ELEMENT_NODE) {
          stack.push(child);
        } else if (child.nodeType === Node.COMMENT_NODE) {
          child.remove();
        }
      });

      while (stack.length > 0) {
        const node = stack.pop();
        if (blockedTags.has(node.tagName)) {
          node.remove();
          continue;
        }

        const attributes = Array.from(node.attributes || []);
        for (const attr of attributes) {
          if (attr.name.startsWith('on') || (attr.name === 'href' && attr.value.trim().toLowerCase().startsWith('javascript:'))) {
            node.removeAttribute(attr.name);
          }
        }

        Array.from(node.childNodes).forEach((child) => {
          if (child.nodeType === Node.ELEMENT_NODE) {
            stack.push(child);
          } else if (child.nodeType === Node.COMMENT_NODE) {
            child.remove();
          }
        });
      }
    }

    function hasHtmlContent(sanitizedHtml) {
      const temp = document.createElement('div');
      temp.innerHTML = sanitizedHtml;
      return temp.textContent.trim().length > 0 || temp.querySelector('*') !== null;
    }

    function calculateCanvasScale(config) {
      const baseFontSize = 12;
      const themeFontSize = config?.fontSize || baseFontSize;
      return (themeFontSize / baseFontSize) * 4.0;
    }

    async function renderHtmlToPng(htmlContent, themeConfig) {
      const sanitizedHtml = sanitizeHtml(htmlContent);
      if (!hasHtmlContent(sanitizedHtml)) {
        return null;
      }

      const fontFamily = themeConfig?.fontFamily || "'SimSun', 'Times New Roman', Times, serif";
      const scale = calculateCanvasScale(themeConfig);
      const svgNS = 'http://www.w3.org/2000/svg';
      const bigWidth = 2000 * scale;
      const bigHeight = 2000 * scale;

      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('xmlns', svgNS);
      svg.setAttribute('width', String(bigWidth));
      svg.setAttribute('height', String(bigHeight));

      const fo = document.createElementNS(svgNS, 'foreignObject');
      fo.setAttribute('width', String(bigWidth));
      fo.setAttribute('height', String(bigHeight));

      const wrapper = document.createElement('div');
      wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
      wrapper.style.cssText = `display: inline-block; overflow: hidden; outline: 1px solid #ff0000; outline-offset: 0; transform: scale(${scale}); transform-origin: top left;`;

      const container = document.createElement('div');
      container.style.cssText = `display: inline-block; font-family: ${fontFamily};`;
      container.innerHTML = sanitizedHtml;

      wrapper.appendChild(container);
      fo.appendChild(wrapper);
      svg.appendChild(fo);

      const svgString = new XMLSerializer().serializeToString(svg);
      const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);

      const img = new Image();
      img.src = dataUrl;
      await img.decode();

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = img.naturalWidth;
      tempCanvas.height = img.naturalHeight;
      const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
      if (!tempCtx) {
        throw new Error('Failed to get canvas 2D context');
      }
      tempCtx.drawImage(img, 0, 0);

      const w = tempCanvas.width;
      const h = tempCanvas.height;
      const firstRow = tempCtx.getImageData(0, 0, w, 1).data;
      let rightEdge = 1;
      for (let x = w - 1; x >= 0; x--) {
        const idx = x * 4;
        if (firstRow[idx] > 200 && firstRow[idx + 1] < 50 && firstRow[idx + 2] < 50) {
          rightEdge = x;
          break;
        }
      }

      const firstCol = tempCtx.getImageData(0, 0, 1, h).data;
      let bottomEdge = 1;
      for (let y = h - 1; y >= 0; y--) {
        const idx = y * 4;
        if (firstCol[idx] > 200 && firstCol[idx + 1] < 50 && firstCol[idx + 2] < 50) {
          bottomEdge = y;
          break;
        }
      }

      const outlineWidth = Math.ceil(scale);
      const contentWidth = Math.max(1, rightEdge - outlineWidth);
      const contentHeight = Math.max(1, bottomEdge - outlineWidth);

      const canvas = document.createElement('canvas');
      canvas.width = contentWidth;
      canvas.height = contentHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to get canvas 2D context');
      }
      ctx.drawImage(tempCanvas, 0, 0, contentWidth, contentHeight, 0, 0, contentWidth, contentHeight);

      const base64Data = canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
      return {
        base64: base64Data,
        width: canvas.width,
        height: canvas.height
      };
    }

    return await renderHtmlToPng(html, themeConfig);
  }, { html: wrappedHtml, themeConfig: options.themeConfig });

  if (!legacy) {
    failures += 1;
    console.error(`[FAIL] ${fixtureName}: legacy renderer returned null`);
    continue;
  }

  await page.evaluate(({ base64, width, height }) => {
    const legacyRoot = document.getElementById('legacy-root');
    if (!legacyRoot) {
      return;
    }
    const img = document.createElement('img');
    img.id = 'legacy-image';
    img.src = `data:image/png;base64,${base64}`;
    img.width = Math.round(width / 4);
    img.height = Math.round(height / 4);
    img.style.display = 'block';
    legacyRoot.replaceChildren(img);
  }, legacy);

  await page.waitForFunction(() => {
    const img = document.getElementById('legacy-image');
    return img && img.complete;
  });

  const domBuffer = await page.locator('#dom-root').screenshot({ type: 'png' });
  const legacyBuffer = await page.locator('#legacy-image').screenshot({ type: 'png' });

  const comparison = await page.evaluate(async ({
    domBase64,
    legacyBase64,
    perChannelTolerance,
    maxDiffRatio,
    collectDiff,
    trimBottom,
    captureScale,
    comparisonScale
  }) => {
    const loadImage = (src) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (event) => reject(event);
      img.src = src;
    });

    const domImg = await loadImage(`data:image/png;base64,${domBase64}`);
    const legacyImg = await loadImage(`data:image/png;base64,${legacyBase64}`);

    const downscaleImage = (img, scale) => {
      const ratio = scale && scale > 1 ? scale : 1;
      const width = Math.max(1, Math.round(img.width / ratio));
      const height = Math.max(1, Math.round(img.height / ratio));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to get canvas 2D context');
      }
      ctx.drawImage(img, 0, 0, width, height);
      return { canvas, ctx, width, height };
    };

    const domCanvas = downscaleImage(domImg, captureScale);
    const legacyCanvas = downscaleImage(legacyImg, captureScale);

    let domWidth = domCanvas.width;
    let domHeight = domCanvas.height;
    let legacyWidth = legacyCanvas.width;
    let legacyHeight = legacyCanvas.height;
    let trimApplied = false;

    if (trimBottom > 0 && domWidth === legacyWidth) {
      const diff = legacyHeight - domHeight;
      if (diff > 0 && diff <= trimBottom) {
        legacyHeight = domHeight;
        trimApplied = true;
      }
    }

    if (domWidth !== legacyWidth || domHeight !== legacyHeight) {
      return {
        ok: false,
        reason: 'size-mismatch',
        dom: { width: domWidth, height: domHeight },
        legacy: { width: legacyWidth, height: legacyHeight },
        trimApplied
      };
    }

    const width = domWidth;
    const height = domHeight;
    const compareScale = comparisonScale && comparisonScale > 0 && comparisonScale < 1 ? comparisonScale : 1;
    const compareWidth = Math.max(1, Math.round(width * compareScale));
    const compareHeight = Math.max(1, Math.round(height * compareScale));
    const canvas = document.createElement('canvas');
    canvas.width = compareWidth;
    canvas.height = compareHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { ok: false, reason: 'no-canvas-context' };
    }

    ctx.clearRect(0, 0, compareWidth, compareHeight);
    ctx.drawImage(domCanvas.canvas, 0, 0, compareWidth, compareHeight);
    const domData = ctx.getImageData(0, 0, compareWidth, compareHeight).data;

    ctx.clearRect(0, 0, compareWidth, compareHeight);
    ctx.drawImage(legacyCanvas.canvas, 0, 0, compareWidth, compareHeight);
    const legacyData = ctx.getImageData(0, 0, compareWidth, compareHeight).data;

    let diffPixels = 0;
    let diffImageData = null;
    if (collectDiff) {
      diffImageData = ctx.createImageData(width, height);
    }

    for (let i = 0; i < domData.length; i += 4) {
      const dr = Math.abs(domData[i] - legacyData[i]);
      const dg = Math.abs(domData[i + 1] - legacyData[i + 1]);
      const db = Math.abs(domData[i + 2] - legacyData[i + 2]);
      const da = Math.abs(domData[i + 3] - legacyData[i + 3]);
      const isDiff = dr > perChannelTolerance ||
        dg > perChannelTolerance ||
        db > perChannelTolerance ||
        da > perChannelTolerance;
      if (isDiff) {
        diffPixels += 1;
        if (diffImageData) {
          diffImageData.data[i] = 255;
          diffImageData.data[i + 1] = 0;
          diffImageData.data[i + 2] = 0;
          diffImageData.data[i + 3] = 255;
        }
      } else if (diffImageData) {
        diffImageData.data[i + 3] = 0;
      }
    }

    const diffRatio = diffPixels / (compareWidth * compareHeight);
    let diffDataUrl = null;
    if (collectDiff && diffImageData) {
      ctx.putImageData(diffImageData, 0, 0);
      diffDataUrl = canvas.toDataURL('image/png');
    }

    return {
      ok: diffRatio <= maxDiffRatio,
      diffRatio,
      diffPixels,
      width: compareWidth,
      height: compareHeight,
      diffDataUrl,
      trimApplied
    };
  }, {
    domBase64: domBuffer.toString('base64'),
    legacyBase64: legacyBuffer.toString('base64'),
    perChannelTolerance: options.tolerance,
    maxDiffRatio: options.threshold,
    collectDiff: true,
    trimBottom: options.trimBottom,
    captureScale: options.captureScale,
    comparisonScale: options.comparisonScale
  });

  if (!comparison.ok) {
    failures += 1;
    const reason = comparison.reason ? ` reason=${comparison.reason}` : '';
    const diffPixels = typeof comparison.diffPixels === 'number' ? comparison.diffPixels : 0;
    const trimmed = comparison.trimApplied ? ' trim=bottom' : '';
    console.error(`[FAIL] ${fixtureName}: diffRatio=${formatRatio(comparison.diffRatio)} (${diffPixels} px)${reason}${trimmed}`);
    if (comparison.reason === 'size-mismatch') {
      console.error(`       dom=${comparison.dom?.width}x${comparison.dom?.height} legacy=${comparison.legacy?.width}x${comparison.legacy?.height}`);
    }
    if (comparison.diffDataUrl) {
      const diffPath = path.join(diffDir, `${fixtureName.replace(/\.html$/, '')}-diff.png`);
      const diffBase64 = comparison.diffDataUrl.split(',')[1] || '';
      await fs.writeFile(diffPath, Buffer.from(diffBase64, 'base64'));
      console.error(`       diff: ${diffPath}`);
    }
    continue;
  }

  const trimmed = comparison.trimApplied ? ' trim=bottom' : '';
  console.log(`[PASS] ${fixtureName}: diffRatio=${formatRatio(comparison.diffRatio)}${trimmed}`);
}

await browser.close();

if (failures > 0) {
  process.exit(1);
}

console.log('All table fixtures matched legacy image rendering.');

function parseArgs(args) {
  const options = {
    threshold: 0.16,
    tolerance: 50,
    fixture: null,
    headed: false,
    themeConfig: {
      fontFamily: "'Times New Roman', Times, serif",
      fontSize: 12
    },
    trimBottom: 0,
    captureScale: 4,
    comparisonScale: 0.5
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--headed') {
      options.headed = true;
    } else if (arg === '--fixture' && args[i + 1]) {
      options.fixture = args[i + 1];
      i += 1;
    } else if (arg.startsWith('--threshold=')) {
      const value = Number(arg.split('=')[1]);
      if (Number.isFinite(value)) {
        options.threshold = value;
      }
    } else if (arg.startsWith('--tolerance=')) {
      const value = Number(arg.split('=')[1]);
      if (Number.isFinite(value)) {
        options.tolerance = value;
      }
    } else if (arg.startsWith('--trim-bottom=')) {
      const value = Number(arg.split('=')[1]);
      if (Number.isFinite(value)) {
        options.trimBottom = value;
      }
    } else if (arg.startsWith('--capture-scale=')) {
      const value = Number(arg.split('=')[1]);
      if (Number.isFinite(value) && value > 0) {
        options.captureScale = value;
      }
    } else if (arg.startsWith('--compare-scale=')) {
      const value = Number(arg.split('=')[1]);
      if (Number.isFinite(value) && value > 0 && value <= 1) {
        options.comparisonScale = value;
      }
    }
  }

  if (!Number.isFinite(options.trimBottom) || options.trimBottom <= 0) {
    const fontSize = options.themeConfig?.fontSize || 12;
    options.trimBottom = Math.ceil((fontSize / 12) * 4.0);
  }

  return options;
}

async function listFixtures(dir, filterName) {
  const entries = await fs.readdir(dir);
  const files = entries
    .filter((entry) => entry.endsWith('.html'))
    .map((entry) => path.join(dir, entry))
    .sort();

  if (!filterName) {
    return files;
  }

  const filtered = files.filter((file) => path.basename(file) === filterName || path.basename(file, '.html') === filterName);
  return filtered;
}

function buildPageHtml(fixtureHtml) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        background: #ffffff;
      }
      body {
        display: inline-block;
      }
      #dom-root,
      #legacy-root {
        display: inline-block;
      }
      #legacy-root {
        margin-top: 16px;
      }
      #legacy-root img {
        display: block;
      }
    </style>
  </head>
  <body>
    <div id="dom-root" class="fixture-root">${fixtureHtml}</div>
    <div id="legacy-root"></div>
  </body>
</html>`;
}

function formatRatio(value) {
  if (typeof value !== 'number') {
    return 'n/a';
  }
  return value.toFixed(6);
}
