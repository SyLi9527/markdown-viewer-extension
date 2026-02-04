/**
 * Toolbar Manager
 * Handles toolbar initialization and button event handlers
 */

import { getFilenameFromURL, getDocumentFilename } from '../../../../src/core/document-utils';
import { applyZoom as applyZoomCore, exportPdfFlow } from '../../../../src/core/viewer/viewer-host';
import type {
  TranslateFunction,
  EscapeHtmlFunction,
  FileState,
  DocxExporter,
  LayoutConfig,
  ToolbarManagerOptions,
  ToolbarManagerInstance,
  GenerateToolbarHTMLOptions
} from '../../../../src/types/index';

// SVG icons for different layouts
export const layoutIcons: Record<string, string> = {
  normal: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor">
    <rect x="3" y="4" width="14" height="12" stroke-width="2" rx="1"/>
    <line x1="3" y1="7" x2="17" y2="7" stroke-width="2"/>
  </svg>`,
  fullscreen: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor">
    <rect x="2" y="2" width="16" height="16" stroke-width="2" rx="1"/>
    <line x1="2" y1="6" x2="18" y2="6" stroke-width="2"/>
  </svg>`,
  narrow: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor">
    <rect x="6" y="3" width="8" height="14" stroke-width="2" rx="1"/>
    <line x1="6" y1="6" x2="14" y2="6" stroke-width="2"/>
  </svg>`
};

/**
 * Creates a toolbar manager for handling toolbar functionality.
 * @param options - Configuration options
 * @returns Toolbar manager instance
 */
export function createToolbarManager(options: ToolbarManagerOptions): ToolbarManagerInstance {
  const {
    translate,
    escapeHtml,
    saveFileState,
    getFileState,
    rawMarkdown,
    docxExporter,
    cancelScrollRestore,
    updateActiveTocItem,
    toolbarPrintDisabledTitle,
    onBeforeZoom
  } = options;

  // Layout configurations
  const layoutTitles: Record<string, string> = {
    normal: translate('toolbar_layout_title_normal'),
    fullscreen: translate('toolbar_layout_title_fullscreen'),
    narrow: translate('toolbar_layout_title_narrow')
  };

  const layoutConfigs: Record<string, LayoutConfig> = {
    normal: { maxWidth: '1360px', icon: layoutIcons.normal, title: layoutTitles.normal },
    fullscreen: { maxWidth: '100%', icon: layoutIcons.fullscreen, title: layoutTitles.fullscreen },
    narrow: { maxWidth: '680px', icon: layoutIcons.narrow, title: layoutTitles.narrow }
  };

  // Global zoom state
  let currentZoomLevel = 100;
  let triggerExport: (() => void) | null = null;

  /**
   * Apply zoom level to content and update UI
   * @param newLevel - New zoom level percentage (e.g. 100, 150)
   * @param saveState - Whether to save state to storage
   */
  function applyZoom(newLevel: number, saveState = true): void {
    const oldLevel = currentZoomLevel;
    currentZoomLevel = Math.max(50, Math.min(400, newLevel));
    
    // Skip if no actual change
    if (oldLevel === currentZoomLevel) return;
    
    // Core rendering logic - use shared function
    // Note: onBeforeZoom locks scroll position, passed as scrollController.lock equivalent
    onBeforeZoom?.();
    applyZoomCore({ zoom: currentZoomLevel });
    
    // UI updates (Chrome-specific)
    const zoomLevelSpan = document.getElementById('zoom-level');
    if (zoomLevelSpan) {
      zoomLevelSpan.textContent = currentZoomLevel + '%';
    }
    
    // Update scroll-margin-top for all headings to account for zoom
    // Formula: 50px (toolbar height) / zoom ratio
    const contentDiv = document.getElementById('markdown-content');
    if (contentDiv) {
      const scrollMargin = 50 / (currentZoomLevel / 100);
      const headings = contentDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');
      headings.forEach(heading => {
        (heading as HTMLElement).style.scrollMarginTop = scrollMargin + 'px';
      });
    }
    
    // Save zoom level
    if (saveState) {
      saveFileState({ zoom: currentZoomLevel });
    }
    
    // Update TOC active state since zoom affects scroll positions
    updateActiveTocItem();
  }

  /**
   * Get current zoom level
   * @returns Current zoom level
   */
  function getZoomLevel(): number {
    return currentZoomLevel;
  }

  /**
   * Set initial zoom level without saving
   * @param level - Zoom level to set
   */
  function setInitialZoom(level: number): void {
    currentZoomLevel = level;
  }

  /**
   * Initialize toolbar with file name
   */
  function initializeToolbar(): void {
    // Set file name from URL
    const fileNameSpan = document.getElementById('file-name');
    if (fileNameSpan) {
      const fileName = getFilenameFromURL();
      fileNameSpan.textContent = fileName;
      
      // Click file name to scroll to top
      fileNameSpan.addEventListener('click', () => {
        cancelScrollRestore();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    // Setup toolbar button handlers
    setupToolbarButtons();
  }

  /**
   * Setup toolbar button event handlers
   */
  async function setupToolbarButtons(): Promise<void> {
    // Get saved state first
    const savedState = await getFileState();
    
    // Toggle TOC button
    const toggleTocBtn = document.getElementById('toggle-toc-btn');
    const tocDiv = document.getElementById('table-of-contents');
    const overlayDiv = document.getElementById('toc-overlay');

    if (toggleTocBtn && tocDiv && overlayDiv) {
      toggleTocBtn.addEventListener('click', () => {
        // If TOC has no content (no headings), do nothing
        if (tocDiv.style.display === 'none') {
          return;
        }
        
        const willBeHidden = !tocDiv.classList.contains('hidden');
        tocDiv.classList.toggle('hidden');
        document.body.classList.toggle('toc-hidden');
        overlayDiv.classList.toggle('hidden');
        
        // Save TOC visibility state
        saveFileState({
          tocVisible: !willBeHidden
        });
      });
    }

    // Zoom controls
    const zoomLevelSpan = document.getElementById('zoom-level');
    
    // Initialize zoom display
    if (zoomLevelSpan) {
      zoomLevelSpan.textContent = currentZoomLevel + '%';
    }

    // Click zoom level to reset to 100%
    if (zoomLevelSpan) {
      zoomLevelSpan.style.cursor = 'pointer';
      zoomLevelSpan.addEventListener('click', () => {
        applyZoom(100);
      });
    }

    const zoomInBtn = document.getElementById('zoom-in-btn');
    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', () => {
        applyZoom(currentZoomLevel + 10);
      });
    }

    const zoomOutBtn = document.getElementById('zoom-out-btn');
    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', () => {
        applyZoom(currentZoomLevel - 10);
      });
    }

    // Layout toggle button
    const layoutBtn = document.getElementById('layout-toggle-btn');
    const pageDiv = document.getElementById('markdown-page');
    let currentLayout = 'normal'; // normal, fullscreen, narrow
    const layoutSequence = ['normal', 'fullscreen', 'narrow'];

    if (layoutBtn && pageDiv) {
      const applyLayout = (layout: string, saveState = true): void => {
        const config = layoutConfigs[layout];
        if (!config) {
          return;
        }
        currentLayout = layout;
        pageDiv.style.maxWidth = config.maxWidth;
        layoutBtn.innerHTML = config.icon;
        layoutBtn.title = config.title;
        
        // Save layout mode
        if (saveState) {
          saveFileState({ layoutMode: layout });
        }
      };

      applyLayout('normal', false);

      layoutBtn.addEventListener('click', () => {
        if (!layoutSequence.includes(currentLayout)) {
          applyLayout(layoutSequence[0]);
          return;
        }

        const currentIndex = layoutSequence.indexOf(currentLayout);
        const nextLayout = layoutSequence[(currentIndex + 1) % layoutSequence.length];
        applyLayout(nextLayout);
      });
      
      // Restore layout and zoom state after toolbar setup
      (async () => {
        // Restore layout mode
        if (savedState.layoutMode && layoutConfigs[savedState.layoutMode]) {
          applyLayout(savedState.layoutMode, false);
        }
        
        // Restore zoom level
        if (savedState.zoom && typeof savedState.zoom === 'number') {
          applyZoom(savedState.zoom, false);
        }
      })();
    }

    type ExportFormat = 'docx' | 'pdf';
    let currentExportFormat: ExportFormat = savedState.exportFormat === 'pdf' ? 'pdf' : 'docx';

    const downloadBtn = document.getElementById('download-btn') as HTMLButtonElement | null;
    const exportMenuBtn = document.getElementById('export-menu-btn') as HTMLButtonElement | null;
    const exportMenu = document.getElementById('export-menu') as HTMLDivElement | null;
    const exportMenuItems = exportMenu?.querySelectorAll<HTMLButtonElement>('[data-format]') || [];

    const updateExportMenu = (): void => {
      exportMenuItems.forEach((item) => {
        const format = item.dataset.format as ExportFormat;
        const isActive = format === currentExportFormat;
        item.classList.toggle('active', isActive);
        item.setAttribute('aria-checked', isActive ? 'true' : 'false');
      });

      if (downloadBtn) {
        const label = currentExportFormat === 'pdf'
          ? translate('export_format_pdf')
          : translate('export_format_word');
        const baseTitle = translate('toolbar_download_title');
        downloadBtn.title = `${baseTitle} (${label})`;
      }
    };

    const setExportFormat = (format: ExportFormat): void => {
      currentExportFormat = format;
      saveFileState({ exportFormat: format });
      updateExportMenu();
    };

    const resetDownloadButton = (button: HTMLButtonElement, originalContent: string): void => {
      button.innerHTML = originalContent;
      button.disabled = false;
      button.classList.remove('downloading');
    };

    const runDocxExport = async (button: HTMLButtonElement): Promise<void> => {
      const originalContent = button.innerHTML;
      button.disabled = true;
      button.classList.add('downloading');
      const progressHTML = `
        <svg class="progress-circle" width="18" height="18" viewBox="0 0 18 18">
          <circle class="progress-circle-bg" cx="9" cy="9" r="7" stroke="currentColor" stroke-width="2" fill="none" opacity="0.3"/>
          <circle class="download-progress-circle" cx="9" cy="9" r="7" stroke="currentColor" stroke-width="2" fill="none"
                  stroke-dasharray="43.98" stroke-dashoffset="43.98" transform="rotate(-90 9 9)"/>
        </svg>
      `;
      button.innerHTML = progressHTML;

      const markdown = rawMarkdown;
      const filename = getDocumentFilename();
      const exportErrorFallback = translate('docx_export_failed_default');
      const result = await docxExporter.exportToDocx(markdown, filename, (completed, total) => {
        const progressCircle = button.querySelector('.download-progress-circle');
        if (progressCircle && total > 0) {
          const progress = completed / total;
          const circumference = 43.98;
          const offset = circumference * (1 - progress);
          (progressCircle as SVGCircleElement).style.strokeDashoffset = String(offset);
        }
      });

      if (!result.success) {
        throw new Error(result.error || exportErrorFallback);
      }

      resetDownloadButton(button, originalContent);
    };

    const runPdfExport = async (button: HTMLButtonElement): Promise<void> => {
      const originalContent = button.innerHTML;
      button.disabled = true;
      button.classList.add('downloading');
      const progressHTML = `
        <svg class="progress-circle" width="18" height="18" viewBox="0 0 18 18">
          <circle class="progress-circle-bg" cx="9" cy="9" r="7" stroke="currentColor" stroke-width="2" fill="none" opacity="0.3"/>
          <circle class="download-progress-circle" cx="9" cy="9" r="7" stroke="currentColor" stroke-width="2" fill="none"
                  stroke-dasharray="43.98" stroke-dashoffset="21.99" transform="rotate(-90 9 9)"/>
        </svg>
      `;
      button.innerHTML = progressHTML;

      await exportPdfFlow({
        filename: getFilenameFromURL(),
        onError: (error) => {
          throw new Error(error);
        },
      });

      resetDownloadButton(button, originalContent);
    };

    const runExport = async (format: ExportFormat): Promise<void> => {
      if (!downloadBtn) return;
      if (downloadBtn.disabled) return;

      try {
        if (format === 'pdf') {
          await runPdfExport(downloadBtn);
        } else {
          await runDocxExport(downloadBtn);
        }
      } catch (error) {
        console.error('Export error:', error);
        const alertDetail = (error as Error)?.message ? `: ${(error as Error).message}` : '';
        const alertKey = format === 'pdf' ? 'export_pdf_failed_alert' : 'docx_export_failed_alert';
        const alertMessage = translate(alertKey, [alertDetail]) || `Export failed${alertDetail}`;
        alert(alertMessage);
        const originalContent = `
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 3v10m0 0l-3-3m3 3l3-3M3 16h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        `;
        resetDownloadButton(downloadBtn, originalContent);
      }
    };

    triggerExport = () => {
      void runExport(currentExportFormat);
    };

    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        void runExport(currentExportFormat);
      });
    }

    if (exportMenuBtn && exportMenu) {
      exportMenuBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        exportMenu.classList.toggle('hidden');
      });
    }

    exportMenuItems.forEach((item) => {
      item.addEventListener('click', () => {
        const format = item.dataset.format as ExportFormat;
        setExportFormat(format);
        exportMenu?.classList.add('hidden');
        void runExport(format);
      });
    });

    document.addEventListener('click', (event) => {
      if (!exportMenu) return;
      const target = event.target as Node;
      if (exportMenu.contains(target) || exportMenuBtn?.contains(target)) {
        return;
      }
      exportMenu.classList.add('hidden');
    });

    updateExportMenu();

    // Print button
    setupPrintButton();
  }

  /**
   * Setup print button handler
   */
  function setupPrintButton(): void {
    const printBtn = document.getElementById('print-btn') as HTMLButtonElement | null;
    if (printBtn) {
      // Check if this is a remote file - disable print for remote files
      const isLocalFile = document.location.protocol === 'file:';
      
      if (!isLocalFile) {
        printBtn.disabled = true;
        printBtn.title = toolbarPrintDisabledTitle;
        printBtn.style.opacity = '0.5';
        printBtn.style.cursor = 'not-allowed';
      } else {
        printBtn.addEventListener('click', async () => {
          const contentDiv = document.getElementById('markdown-content');
          if (!contentDiv) {
            return;
          }

          try {
            if (printBtn.disabled) {
              return;
            }
            printBtn.disabled = true;

            // For local files, use simple browser print
            window.print();
          } catch (error) {
            console.error('Print request failed:', error);
            alert(`Failed to open print preview: ${(error as Error).message}`);
          } finally {
            printBtn.disabled = false;
          }
        });
      }
    }
  }

  /**
   * Setup global keyboard shortcuts
   */
  function setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      // Ctrl/Cmd + B: Toggle TOC
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        const tocDiv = document.getElementById('table-of-contents');
        const overlayDiv = document.getElementById('toc-overlay');
        if (tocDiv && overlayDiv) {
          const willBeHidden = !tocDiv.classList.contains('hidden');
          tocDiv.classList.toggle('hidden');
          document.body.classList.toggle('toc-hidden');
          overlayDiv.classList.toggle('hidden');
          
          // Save TOC visibility state
          saveFileState({
            tocVisible: !willBeHidden
          });
        }
        return;
      }

      // Ctrl/Cmd + S: Export using last selected format
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        triggerExport?.();
        return;
      }

      // Ctrl/Cmd + P: Print (browser default, but we ensure it's enabled)
      // No need to prevent default for print, browser handles it well
    });
  }

  return {
    layoutIcons,
    layoutConfigs,
    applyZoom,
    getZoomLevel,
    setInitialZoom,
    initializeToolbar,
    setupToolbarButtons,
    setupKeyboardShortcuts
  };
}

/**
 * Generate toolbar HTML
 * @param options - Options for toolbar generation
 * @returns Toolbar HTML
 */
export function generateToolbarHTML(options: GenerateToolbarHTMLOptions): string {
  const {
    translate,
    escapeHtml,
    initialTocClass,
    initialMaxWidth,
    initialZoom
  } = options;

  const toolbarLayoutTitleNormal = translate('toolbar_layout_title_normal');
  const toolbarToggleTocTitle = translate('toolbar_toggle_toc_title');
  const toolbarZoomOutTitle = translate('toolbar_zoom_out_title');
  const toolbarZoomInTitle = translate('toolbar_zoom_in_title');
  const toolbarDownloadTitle = translate('toolbar_download_title');
  const toolbarPrintTitle = translate('toolbar_print_title');
  const exportFormatWord = translate('export_format_word');
  const exportFormatPdf = translate('export_format_pdf');
  const exportFormatTitle = translate('export_format_title');

  const layoutTitleAttr = escapeHtml(toolbarLayoutTitleNormal);
  const toggleTocTitleAttr = escapeHtml(toolbarToggleTocTitle);
  const zoomOutTitleAttr = escapeHtml(toolbarZoomOutTitle);
  const zoomInTitleAttr = escapeHtml(toolbarZoomInTitle);
  const downloadTitleAttr = escapeHtml(toolbarDownloadTitle);
  const printTitleAttr = escapeHtml(toolbarPrintTitle);

  return `
  <div id="toolbar">
    <div class="toolbar-left">
      <button id="toggle-toc-btn" class="toolbar-btn" title="${toggleTocTitleAttr}">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
      <span id="file-name" class="file-name"></span>
      <div id="processing-indicator" class="processing-indicator hidden">
        <svg class="progress-circle" width="18" height="18" viewBox="0 0 18 18">
          <circle class="progress-circle-bg" cx="9" cy="9" r="7" stroke="#666" stroke-width="2" fill="none"/>
          <circle class="progress-circle-progress" cx="9" cy="9" r="7" stroke="#00d4aa" stroke-width="2" fill="none"
                  stroke-dasharray="43.98" stroke-dashoffset="43.98" transform="rotate(-90 9 9)"/>
        </svg>
      </div>
    </div>
    <div class="toolbar-center">
      <button id="zoom-out-btn" class="toolbar-btn" title="${zoomOutTitleAttr}">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path d="M5 10h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
      <span id="zoom-level" class="zoom-level">100%</span>
      <button id="zoom-in-btn" class="toolbar-btn" title="${zoomInTitleAttr}">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 5v10M5 10h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
      <button id="layout-toggle-btn" class="toolbar-btn" title="${layoutTitleAttr}">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor">
          <rect x="3" y="4" width="14" height="12" stroke-width="2" rx="1"/>
          <line x1="3" y1="7" x2="17" y2="7" stroke-width="2"/>
        </svg>
      </button>
    </div>
    <div class="toolbar-right">
      <div class="export-menu-wrapper">
        <button id="download-btn" class="toolbar-btn" title="${downloadTitleAttr}">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 3v10m0 0l-3-3m3 3l3-3M3 16h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button id="export-menu-btn" class="toolbar-btn export-menu-btn" title="${escapeHtml(exportFormatTitle)}">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <div id="export-menu" class="export-menu hidden" role="menu">
          <button class="export-menu-item" data-format="docx" role="menuitemradio">${escapeHtml(exportFormatWord)}</button>
          <button class="export-menu-item" data-format="pdf" role="menuitemradio">${escapeHtml(exportFormatPdf)}</button>
        </div>
      </div>
      <button id="print-btn" class="toolbar-btn" title="${printTitleAttr}">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path d="M5 7V3h10v4M5 14H3V9h14v5h-2M5 14v3h10v-3M5 14h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
  </div>
  <div id="table-of-contents" class="${initialTocClass}"></div>
  <div id="toc-overlay" class="hidden"></div>
  <div id="markdown-wrapper">
    <div id="markdown-page" style="max-width: ${initialMaxWidth};">
      <div id="markdown-content" style="zoom: ${initialZoom / 100};"></div>
    </div>
  </div>
`;
}
