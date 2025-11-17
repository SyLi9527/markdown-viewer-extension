// Vega/Vega-Lite Renderer using BaseRenderer architecture
import { BaseRenderer } from './base-renderer.js';
import embed from 'vega-embed';
import { expressionInterpreter } from 'vega-interpreter';

/**
 * Vega/Vega-Lite Renderer implementation
 * Handles both Vega and Vega-Lite specifications
 */
export class VegaRenderer extends BaseRenderer {
  constructor(mode = 'vega-lite') {
    super(mode); // Type is either 'vega' or 'vega-lite'
    this.mode = mode;
  }

  /**
   * Validate Vega/Vega-Lite specification
   */
  validateInput(spec) {
    if (!spec) {
      throw new Error(`Empty ${this.mode} specification provided`);
    }
    return true;
  }

  /**
   * Preprocess input - parse JSON string if needed
   */
  preprocessInput(spec, extraParams) {
    // Parse spec if it's a string
    let vegaSpec = spec;
    if (typeof spec === 'string') {
      try {
        vegaSpec = JSON.parse(spec);
      } catch (e) {
        throw new Error(`Invalid JSON in ${this.mode} specification: ${e.message}`);
      }
    }

    // Validate spec structure
    if (!vegaSpec || typeof vegaSpec !== 'object') {
      throw new Error(`Invalid ${this.mode} specification: must be an object`);
    }

    // Disable auto-sorting for vega-lite specs (recursively handle all views)
    if (this.mode === 'vega-lite') {
      this.disableAutoSortRecursive(vegaSpec);
    }

    return vegaSpec;
  }

  /**
   * Recursively disable automatic sorting in vega-lite specs
   * Handles: single views, layers, concat, facet, repeat
   */
  disableAutoSortRecursive(spec) {
    if (!spec || typeof spec !== 'object') {
      return;
    }

    // Handle encoding in current spec
    if (spec.encoding) {
      this.disableAutoSort(spec.encoding);
    }

    // Handle layer compositions
    if (Array.isArray(spec.layer)) {
      spec.layer.forEach(layerSpec => this.disableAutoSortRecursive(layerSpec));
    }

    // Handle concat compositions (hconcat, vconcat, concat)
    ['hconcat', 'vconcat', 'concat'].forEach(concatType => {
      if (Array.isArray(spec[concatType])) {
        spec[concatType].forEach(subSpec => this.disableAutoSortRecursive(subSpec));
      }
    });

    // Handle facet compositions
    if (spec.facet) {
      // Facet can have encoding
      if (spec.facet.encoding) {
        this.disableAutoSort(spec.facet.encoding);
      }
      // Nested spec in facet
      if (spec.spec) {
        this.disableAutoSortRecursive(spec.spec);
      }
    }

    // Handle repeat compositions
    if (spec.repeat) {
      if (spec.spec) {
        this.disableAutoSortRecursive(spec.spec);
      }
    }
  }

  /**
   * Disable automatic sorting in encoding channels
   */
  disableAutoSort(encoding) {
    if (!encoding || typeof encoding !== 'object') {
      return;
    }

    // Iterate through all encoding channels (x, y, color, size, row, column, etc.)
    for (const channel in encoding) {
      const channelDef = encoding[channel];
      
      if (channelDef && typeof channelDef === 'object' && !Array.isArray(channelDef)) {
        // Only set sort to null if it's not explicitly defined
        if (!channelDef.hasOwnProperty('sort')) {
          channelDef.sort = null;
        }
      }
    }
  }

  /**
   * Render Vega/Vega-Lite specification to SVG string
   */
  async renderToSvg(vegaSpec, themeConfig) {
    // Store theme config for use in calculateScale
    this.themeConfig = themeConfig;
    
    // Get font family from theme config
    const fontFamily = themeConfig?.fontFamily || "'SimSun', 'Times New Roman', Times, serif";
    
    // Use shared container (safe because processAsyncTasks ensures serial execution)
    const container = this.getContainer();
    
    container.innerHTML = '';
    container.style.cssText = 'display: inline-block; background: transparent; padding: 0; margin: 0;';

    // Prepare embed options with autosize for responsive layout
    const embedOptions = {
      mode: this.mode,
      actions: false, // Hide action links
      renderer: 'svg', // Use SVG renderer
      ast: true, // Use AST mode to avoid eval
      expr: expressionInterpreter, // Use expression interpreter instead of eval
      config: {
        background: null, // Transparent background
        font: fontFamily,
        view: {
          stroke: null // Remove border
        },
        axis: {
          labelFontSize: 11,
          titleFontSize: 12
        },
        legend: {
          labelFontSize: 11,
          titleFontSize: 12
        },
        // Let Vega-Lite use its default step-based sizing for better automatic layout
        mark: {
          tooltip: true
        }
      }
    };

    // Render the spec using vega-embed
    const result = await embed(container, vegaSpec, embedOptions);
    
    // Get SVG directly from the view object instead of DOM query
    // This is thread-safe and doesn't depend on DOM state
    const svgString = await result.view.toSVG();

    // Validate SVG content
    if (!svgString || svgString.length < 100) {
      throw new Error('Generated SVG is too small or empty');
    }

    // Cleanup
    container.innerHTML = '';

    return svgString;
  }

  /**
   * Calculate scale based on theme font size
   */
  calculateScale(themeConfig, extraParams) {
    const baseFontSize = 12; // pt
    const themeFontSize = themeConfig?.fontSize || baseFontSize;
    return themeFontSize / baseFontSize;
  }

  /**
   * Cleanup on error
   */
  cleanup() {
    try {
      const container = this.getContainer();
      container.innerHTML = '';
    } catch (e) {
      // Container might not exist, ignore
    }
  }
}
