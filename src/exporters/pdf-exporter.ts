import { getPdfExportCss } from './pdf-export-styles';

function collectStyleMarkup(): string {
  const styles = Array.from(document.querySelectorAll('style'))
    .map(style => style.outerHTML)
    .join('\n');
  const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .map(link => link.outerHTML)
    .join('\n');
  return `${links}\n${styles}`;
}

export async function buildPdfExportHtml(
  rawHtml: string,
  options: { pageSize: string; margin: string }
): Promise<string> {
  const css = getPdfExportCss(options);
  const styles = collectStyleMarkup();
  return `<!doctype html><html><head>${styles}<style>${css}</style></head><body data-export="pdf">${rawHtml}</body></html>`;
}

export async function exportPdfFromPreview(options: {
  filename: string;
  containerId?: string;
  pageSize?: string;
  margin?: string;
}): Promise<void> {
  const { filename, containerId = 'markdown-page', pageSize = 'A4', margin = '18mm' } = options;
  const container = document.getElementById(containerId) || document.getElementById('markdown-content');
  if (!container) {
    throw new Error('Preview container not found');
  }

  const html = await buildPdfExportHtml(container.outerHTML, { pageSize, margin });
  const printWindow = window.open('', '_blank', 'noopener,noreferrer');
  if (!printWindow) {
    throw new Error('Unable to open print window');
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.document.title = filename;

  await new Promise<void>((resolve) => {
    printWindow.addEventListener('load', () => resolve(), { once: true });
  });

  printWindow.focus();
  printWindow.print();
}
