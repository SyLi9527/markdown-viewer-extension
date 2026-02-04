export function getPdfExportCss({ pageSize, margin }: { pageSize: string; margin: string }): string {
  return `
@page { size: ${pageSize}; margin: ${margin}; }
[data-export="pdf"] { zoom: 1 !important; }
[data-export="pdf"] img { max-width: 100%; }
[data-export="pdf"] pre, [data-export="pdf"] blockquote, [data-export="pdf"] table {
  break-inside: avoid;
}
`;
}
