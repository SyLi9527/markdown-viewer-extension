/**
 * Custom theme bundle helpers
 * - Validate bundle shape
 * - Deep-merge bundle overrides into base theme + schemes
 */

import type {
  Theme,
  LayoutScheme,
  ColorScheme,
  TableStyleConfig,
  CodeThemeConfig,
  PlatformAPI
} from '../types/index';
import { fetchJSON } from './fetch-utils';

export interface CustomThemeBundle {
  basePresetId: string;
  overrides?: {
    fontScheme?: Theme['fontScheme'];
    diagramStyle?: Theme['diagramStyle'];
  };
  schemes?: {
    layoutScheme?: Partial<LayoutScheme>;
    colorScheme?: Partial<ColorScheme>;
    tableStyle?: Partial<TableStyleConfig>;
    codeTheme?: Partial<CodeThemeConfig>;
  };
}

export interface CustomThemeMergeResult {
  theme: Theme;
  layout: LayoutScheme;
  color: ColorScheme;
  table: TableStyleConfig;
  code: CodeThemeConfig;
}

export function validateCustomThemeBundle(bundle: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!bundle || typeof bundle !== 'object') {
    return { ok: false, errors: ['bundle must be an object'] };
  }
  const obj = bundle as Record<string, unknown>;
  if (typeof obj.basePresetId !== 'string' || obj.basePresetId.trim() === '') {
    errors.push('basePresetId is required');
  }
  return { ok: errors.length === 0, errors };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function deepMerge<T>(base: T, override?: Partial<T>): T {
  if (!override) return cloneValue(base);
  const result = cloneValue(base) as Record<string, unknown>;
  const merge = (target: Record<string, unknown>, source: Record<string, unknown>): void => {
    Object.keys(source).forEach((key) => {
      const src = source[key];
      const tgt = target[key];
      if (isObject(src) && isObject(tgt)) {
        merge(tgt, src);
      } else {
        target[key] = src;
      }
    });
  };
  if (isObject(override)) merge(result, override);
  return result as T;
}

export function mergeCustomTheme(
  baseTheme: Theme,
  baseLayout: LayoutScheme,
  baseColor: ColorScheme,
  baseTable: TableStyleConfig,
  baseCode: CodeThemeConfig,
  bundle: CustomThemeBundle
): CustomThemeMergeResult {
  const theme = deepMerge(baseTheme, bundle.overrides as Partial<Theme> | undefined);
  const layout = deepMerge(baseLayout, bundle.schemes?.layoutScheme);
  const color = deepMerge(baseColor, bundle.schemes?.colorScheme);
  const table = deepMerge(baseTable, bundle.schemes?.tableStyle);
  const code = deepMerge(baseCode, bundle.schemes?.codeTheme);
  return { theme, layout, color, table, code };
}

export async function resolveCustomTheme(platform: PlatformAPI): Promise<CustomThemeMergeResult> {
  const stored = await platform.storage.get(['customThemeBundle']);
  const bundle = stored.customThemeBundle as CustomThemeBundle | undefined;
  const validation = validateCustomThemeBundle(bundle);
  if (!validation.ok) {
    throw new Error(`Invalid custom theme bundle: ${validation.errors.join(', ')}`);
  }

  const basePresetId = bundle!.basePresetId;
  const theme = await fetchJSON(platform.resource.getURL(`themes/presets/${basePresetId}.json`)) as Theme;

  const layout = await fetchJSON(
    platform.resource.getURL(`themes/layout-schemes/${theme.layoutScheme}.json`)
  ) as LayoutScheme;
  const color = await fetchJSON(
    platform.resource.getURL(`themes/color-schemes/${theme.colorScheme}.json`)
  ) as ColorScheme;
  const table = await fetchJSON(
    platform.resource.getURL(`themes/table-styles/${theme.tableStyle}.json`)
  ) as TableStyleConfig;
  const code = await fetchJSON(
    platform.resource.getURL(`themes/code-themes/${theme.codeTheme}.json`)
  ) as CodeThemeConfig;

  return mergeCustomTheme(theme, layout, color, table, code, bundle!);
}
