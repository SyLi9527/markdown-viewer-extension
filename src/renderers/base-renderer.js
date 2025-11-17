/**
 * Base Renderer for diagrams and charts
 * 
 * Each renderer handles one diagram type (mermaid, vega, html, svg, etc.)
 */
export class BaseRenderer {
  /**
   * @param {string} type - Render type identifier (e.g., 'mermaid', 'vega')
   */
  constructor(type) {
    this.type = type;
    this._initialized = false;
  }

  /**
   * Get the render container element
   * All renderers share the same container since rendering is serialized
   * @returns {HTMLElement} Render container element
   */
  getContainer() {
    const container = document.getElementById('render-container');
    if (!container) {
      throw new Error('Render container not found');
    }
    return container;
  }

  /**
   * Initialize renderer (load dependencies, setup environment)
   * Called once before first render
   * Subclasses can override to perform async initialization
   * @param {object} themeConfig - Theme configuration
   * @returns {Promise<void>}
   */
  async initialize(themeConfig = null) {
    this._initialized = true;
  }

  /**
   * Check if renderer is initialized
   * @returns {boolean} True if initialized
   */
  isInitialized() {
    return this._initialized;
  }

  /**
   * Main render method - must be implemented by subclasses
   * @param {string|object} input - Input data for rendering
   * @param {object} themeConfig - Theme configuration
   * @param {object} extraParams - Additional type-specific parameters
   * @returns {Promise<{base64: string, width: number, height: number}>}
   */
  async render(input, themeConfig, extraParams = {}) {
    throw new Error('render() must be implemented by subclass');
  }

  /**
   * Validate input data
   * @param {any} input - Input to validate
   * @throws {Error} If input is invalid
   */
  validateInput(input) {
    if (!input || (typeof input === 'string' && input.trim() === '')) {
      throw new Error(`Empty ${this.type} input provided`);
    }
  }

  /**
   * Preprocess input before rendering (can be overridden)
   * @param {any} input - Raw input
   * @param {object} extraParams - Extra parameters
   * @returns {any} Processed input
   */
  preprocessInput(input, extraParams) {
    return input;
  }

  /**
   * Calculate scale for html2canvas rendering
   * This is used by renderers that use html2canvas directly (Mermaid, HTML)
   * PNG size will be divided by 4 in DOCX, so we multiply by 4 here
   * Formula: (14/16) * (themeFontSize/12) * 4
   * @param {object} themeConfig - Theme configuration
   * @returns {number} Scale factor for html2canvas
   */
  calculateCanvasScale(themeConfig) {
    const baseFontSize = 12;
    const themeFontSize = themeConfig?.fontSize || baseFontSize;
    return (14.0 / 16.0) * (themeFontSize / baseFontSize) * 4.0;
  }
}
