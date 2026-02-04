import { getPdfExportCss } from './pdf-export-styles';

export async function buildPdfExportHtml(
  rawHtml: string,
  options: { pageSize: string; margin: string }
): Promise<string> {
  const css = getPdfExportCss(options);
  return `<!doctype html><html><head><style>${css}</style></head><body data-export="pdf">${rawHtml}</body></html>`;
}
