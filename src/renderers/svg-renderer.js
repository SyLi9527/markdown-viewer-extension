/**
 * SVG Renderer
 * 
 * Renders SVG code blocks to PNG images
 */
import { BaseRenderer } from './base-renderer.js';

export class SvgRenderer extends BaseRenderer {
  constructor() {
    super('svg');
  }

  /**
   * Validate SVG input
   */
  validateInput(input) {
    if (!input || typeof input !== 'string') {
      throw new Error('SVG input must be a non-empty string');
    }
    if (!input.includes('<svg')) {
      throw new Error('Invalid SVG: missing <svg> tag');
    }
    return true;
  }

  /**
   * Override render to convert SVG to PNG
   * @param {string} svg - SVG content
   * @param {object} themeConfig - Theme configuration
   * @param {object} extraParams - Extra parameters
   * @returns {Promise<{base64: string, width: number, height: number}>}
   */
  async render(svg, themeConfig, extraParams = {}) {
    // Validate input
    this.validateInput(svg);
    
    const container = this.getContainer();
    container.innerHTML = svg;
    container.style.cssText = 'display: inline-block; background: transparent; padding: 0; margin: 0;';

    const svgEl = container.querySelector('svg');
    if (!svgEl) {
      throw new Error('No SVG element found in rendered output');
    }

    // Wait for layout completion
    container.offsetHeight;
    svgEl.getBoundingClientRect();
    await new Promise(resolve => setTimeout(resolve, 100));

    // Wait for fonts to load if needed
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    // Force another reflow after font loading
    container.offsetHeight;
    svgEl.getBoundingClientRect();
    await new Promise(resolve => setTimeout(resolve, 50));

    // Get SVG dimensions from viewBox or attributes
    const viewBox = svgEl.getAttribute('viewBox');
    let captureWidth, captureHeight;

    if (viewBox) {
      const parts = viewBox.split(/\s+/);
      captureWidth = Math.ceil(parseFloat(parts[2]));
      captureHeight = Math.ceil(parseFloat(parts[3]));
    } else {
      captureWidth = Math.ceil(parseFloat(svgEl.getAttribute('width')) || 800);
      captureHeight = Math.ceil(parseFloat(svgEl.getAttribute('height')) || 600);
    }

    // Set container size to match SVG intrinsic size
    container.style.width = `${captureWidth}px`;
    container.style.height = `${captureHeight}px`;

    // Calculate scale
    const scale = this.calculateCanvasScale(themeConfig);

    // Capture using html2canvas
    if (typeof html2canvas === 'undefined') {
      throw new Error('html2canvas not loaded');
    }

    const canvas = await html2canvas(container, {
      backgroundColor: null,
      scale: scale,
      logging: false,
      useCORS: true,
      allowTaint: true,
      width: captureWidth,
      height: captureHeight,
      windowWidth: captureWidth,
      windowHeight: captureHeight,
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
      onclone: (clonedDoc, element) => {
        // Set willReadFrequently for better performance
        const canvases = clonedDoc.getElementsByTagName('canvas');
        for (let canvas of canvases) {
          if (canvas.getContext) {
            canvas.getContext('2d', { willReadFrequently: true });
          }
        }
      }
    });

    const pngDataUrl = canvas.toDataURL('image/png', 1.0);
    const base64Data = pngDataUrl.replace(/^data:image\/png;base64,/, '');

    // Cleanup
    container.innerHTML = '';
    container.style.cssText = 'display: block; background: transparent;';

    return {
      base64: base64Data,
      width: canvas.width,
      height: canvas.height
    };
  }
}
