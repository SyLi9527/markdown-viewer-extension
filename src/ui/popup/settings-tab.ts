/**
 * Settings Tab Manager
 * Manages settings panel functionality including themes and cache settings
 */

import Localization, { DEFAULT_SETTING_LOCALE } from '../../utils/localization';
import { translate, applyI18nText, getUiLocale } from './i18n-helpers';
import { storageGet, storageSet } from './storage-helper';
import type { EmojiStyle } from '../../types/docx.js';
import type { TableAlignment } from '../../types/settings';
import type { CustomThemeBundle, Theme, LayoutScheme, ColorScheme, TableStyleConfig, CodeThemeConfig } from '../../types/index';
import { mergeCustomTheme, validateCustomThemeInputs } from '../../utils/custom-theme';

// Helper: Send message compatible with both Chrome and Firefox
function safeSendMessage(message: unknown): void {
  try {
    const result = chrome.runtime.sendMessage(message);
    // Chrome returns Promise, Firefox MV2 returns undefined
    if (result && typeof result.catch === 'function') {
      result.catch(() => { /* ignore */ });
    }
  } catch {
    // Ignore errors
  }
}

// Helper: Send message to tab compatible with both Chrome and Firefox
function safeSendTabMessage(tabId: number, message: unknown): void {
  try {
    const result = chrome.tabs.sendMessage(tabId, message);
    if (result && typeof result.catch === 'function') {
      result.catch(() => { /* ignore */ });
    }
  } catch {
    // Ignore errors for non-markdown tabs
  }
}

// Helper: Query tabs compatible with both Chrome and Firefox
async function safeQueryTabs(query: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
  return new Promise((resolve) => {
    try {
      // Chrome MV3 may return Promise, MV2/Firefox uses callback
      const maybePromise = chrome.tabs.query(query, (tabs) => {
        resolve(tabs || []);
      }) as unknown;
      // Check if result is a Promise (Chrome MV3)
      if (maybePromise && typeof (maybePromise as Promise<chrome.tabs.Tab[]>).then === 'function') {
        (maybePromise as Promise<chrome.tabs.Tab[]>).then(resolve).catch(() => resolve([]));
      }
    } catch {
      resolve([]);
    }
  });
}

/**
 * Notify all tabs that a setting has changed, triggering re-render
 */
async function notifySettingChanged(key: string, value: unknown): Promise<void> {
  try {
    const tabs = await safeQueryTabs({});
    tabs.forEach(tab => {
      if (tab.id) {
        safeSendTabMessage(tab.id, {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          type: 'SETTING_CHANGED',
          payload: { key, value },
          timestamp: Date.now(),
          source: 'popup-settings',
        });
      }
    });
  } catch {
    // Ignore errors
  }
}

/**
 * Theme info from registry
 */
interface ThemeRegistryInfo {
  id: string;
  file: string;
  category: string;
  featured?: boolean;
}

/**
 * Theme definition loaded from preset file
 */
interface ThemeDefinition {
  id: string;
  name: string;
  name_en: string;
  description: string;
  description_en: string;
  category: string;
  featured: boolean;
  layoutScheme?: string;
  colorScheme?: string;
  tableStyle?: string;
  codeTheme?: string;
}

/**
 * Theme category info
 */
interface ThemeCategoryInfo {
  name: string;
  name_en: string;
  order?: number;
}

/**
 * Theme registry structure
 */
interface ThemeRegistry {
  categories: Record<string, ThemeCategoryInfo>;
  themes: ThemeRegistryInfo[];
}

/**
 * Table style registry info
 */
interface TableStyleRegistryInfo {
  id: string;
  file: string;
}

/**
 * Table style definition loaded from table style file
 */
interface TableStyleDefinition {
  id: string;
  name: string;
  name_en: string;
  description: string;
  description_en: string;
}

/**
 * Table style registry structure
 */
interface TableStyleRegistry {
  version: string;
  styles: TableStyleRegistryInfo[];
}

/**
 * Locale info from registry
 */
interface LocaleInfo {
  code: string;
  name: string;
}

/**
 * Locale registry structure
 */
interface LocaleRegistry {
  version: string;
  locales: LocaleInfo[];
}

interface ThemeBundle {
  theme: Theme;
  layout: LayoutScheme;
  color: ColorScheme;
  table: TableStyleConfig;
  code: CodeThemeConfig;
}

/**
 * Supported file extensions
 */
interface SupportedExtensions {
  mermaid: boolean;
  vega: boolean;
  vegaLite: boolean;
  dot: boolean;
  infographic: boolean;
  canvas: boolean;
  drawio: boolean;
}

/**
 * Frontmatter display mode
 */
export type FrontmatterDisplay = 'hide' | 'table' | 'raw';

/**
 * User settings structure
 */
interface Settings {
  maxCacheItems: number;
  preferredLocale: string;
  docxHrDisplay: 'pageBreak' | 'line' | 'hide';
  docxEmojiStyle?: EmojiStyle;
  docxHeadingScalePct?: number | null;
  docxHeadingSpacingBeforePt?: number | null;
  docxHeadingSpacingAfterPt?: number | null;
  docxHeadingAlignment?: TableAlignment | null;
  docxCodeFontSizePt?: number | null;
  docxTableBorderWidthPt?: number | null;
  docxTableCellPaddingPt?: number | null;
  supportedExtensions?: SupportedExtensions;
  frontmatterDisplay?: FrontmatterDisplay;
  tableMergeEmpty?: boolean;
  tableAlignment?: TableAlignment;
  tableStyleOverride?: string;
}

/**
 * Settings tab manager options
 */
interface SettingsTabManagerOptions {
  showMessage: (message: string, type: 'success' | 'error' | 'info') => void;
  showConfirm: (title: string, message: string) => Promise<boolean>;
  onReloadCacheData?: () => void;
}

/**
 * Settings tab manager interface
 */
export interface SettingsTabManager {
  loadSettings: () => Promise<void>;
  loadSettingsUI: () => void;
  saveSettings: () => Promise<void>;
  resetSettings: () => Promise<void>;
  getSettings: () => Settings;
  loadThemes: () => Promise<void>;
}

/**
 * Create a settings tab manager
 * @param options - Configuration options
 * @returns Settings tab manager instance
 */
export function createSettingsTabManager({
  showMessage,
  showConfirm,
  onReloadCacheData
}: SettingsTabManagerOptions): SettingsTabManager {
  let settings: Settings = {
    maxCacheItems: 1000,
    preferredLocale: DEFAULT_SETTING_LOCALE,
    docxHrDisplay: 'hide',
    docxEmojiStyle: 'system',
    docxHeadingScalePct: null,
    docxHeadingSpacingBeforePt: null,
    docxHeadingSpacingAfterPt: null,
    docxHeadingAlignment: null,
    docxCodeFontSizePt: null,
    docxTableBorderWidthPt: null,
    docxTableCellPaddingPt: null,
    supportedExtensions: {
      mermaid: true,
      vega: true,
      vegaLite: true,
      dot: true,
      infographic: true,
      canvas: true,
      drawio: true,
    },
    frontmatterDisplay: 'hide',
    tableMergeEmpty: true,
    tableAlignment: 'center',
    tableStyleOverride: 'theme',
  };
  let currentTheme = 'default';
  let themes: ThemeDefinition[] = [];
  let registry: ThemeRegistry | null = null;
  let tableStyleRegistry: TableStyleRegistry | null = null;
  let tableStyles: TableStyleDefinition[] = [];
  let localeRegistry: LocaleRegistry | null = null;
  let customThemeBundle: CustomThemeBundle | null = null;
  let fontOptions: Array<{ id: string; label: string }> = [];
  let codeThemeOptions: Array<{ id: string; label: string }> = [];
  const themeBundleCache = new Map<string, ThemeBundle>();

  function parseOptionalNumber(value: unknown, min?: number): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    if (typeof min === 'number' && parsed < min) {
      return null;
    }
    return parsed;
  }

  function setNumberInputValue(el: HTMLInputElement, value: number | null | undefined): void {
    el.value = (typeof value === 'number' && Number.isFinite(value)) ? String(value) : '';
  }

  function normalizeTableStyleOverride(value: unknown): string {
    if (typeof value !== 'string') {
      return 'theme';
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : 'theme';
  }

  function normalizeHexColor(value: string | null | undefined): string | undefined {
    if (!value) {
      return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  }

  function stripPt(value: string | undefined): number | null {
    if (!value) {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const numeric = trimmed.endsWith('pt') ? trimmed.slice(0, -2) : trimmed;
    const parsed = Number(numeric);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function toPtString(value: number | null | undefined): string | undefined {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return undefined;
    }
    return `${value}pt`;
  }

  function getInputValue(id: string): string {
    const el = document.getElementById(id) as HTMLInputElement | null;
    return el?.value ?? '';
  }

  function getNumberValue(id: string): number | null {
    const value = getInputValue(id);
    if (!value) {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function getSelectValue(id: string): string {
    const el = document.getElementById(id) as HTMLSelectElement | null;
    return el?.value ?? '';
  }

  function getCheckboxValue(id: string): boolean {
    const el = document.getElementById(id) as HTMLInputElement | null;
    return Boolean(el?.checked);
  }

  function setInputValueById(id: string, value: string | null | undefined): void {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el) {
      el.value = value ?? '';
    }
  }

  function setNumberValueById(id: string, value: number | null | undefined): void {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el) {
      el.value = (typeof value === 'number' && Number.isFinite(value)) ? String(value) : '';
    }
  }

  function setSelectValueById(id: string, value: string | null | undefined): void {
    const el = document.getElementById(id) as HTMLSelectElement | null;
    if (el && typeof value === 'string') {
      el.value = value;
    }
  }

  function setCheckboxValueById(id: string, value: boolean | null | undefined): void {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el) {
      el.checked = Boolean(value);
    }
  }

  const headingLevels = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

  const codeTokenFields = [
    { id: 'custom-code-token-keyword', token: 'keyword' },
    { id: 'custom-code-token-string', token: 'string' },
    { id: 'custom-code-token-comment', token: 'comment' },
    { id: 'custom-code-token-number', token: 'number' },
    { id: 'custom-code-token-title', token: 'title' },
    { id: 'custom-code-token-attr', token: 'attr' },
    { id: 'custom-code-token-built-in', token: 'built_in' },
    { id: 'custom-code-token-literal', token: 'literal' },
    { id: 'custom-code-token-type', token: 'type' },
    { id: 'custom-code-token-variable', token: 'variable' },
    { id: 'custom-code-token-property', token: 'property' }
  ];

  async function loadCustomThemeBundle(): Promise<void> {
    try {
      const result = await storageGet(['customThemeBundle']);
      customThemeBundle = (result.customThemeBundle as CustomThemeBundle) || null;
    } catch (error) {
      console.error('Failed to load custom theme bundle:', error);
      customThemeBundle = null;
    }
  }

  async function fetchJson<T>(path: string): Promise<T> {
    const response = await fetch(chrome.runtime.getURL(path));
    return await response.json() as T;
  }

  async function fetchThemeBundle(themeId: string): Promise<ThemeBundle> {
    const cached = themeBundleCache.get(themeId);
    if (cached) {
      return cached;
    }
    const theme = await fetchJson<Theme>(`themes/presets/${themeId}.json`);
    const [layout, color, table, code] = await Promise.all([
      fetchJson<LayoutScheme>(`themes/layout-schemes/${theme.layoutScheme}.json`),
      fetchJson<ColorScheme>(`themes/color-schemes/${theme.colorScheme}.json`),
      fetchJson<TableStyleConfig>(`themes/table-styles/${theme.tableStyle}.json`),
      fetchJson<CodeThemeConfig>(`themes/code-themes/${theme.codeTheme}.json`)
    ]);
    const bundle = { theme, layout, color, table, code };
    themeBundleCache.set(themeId, bundle);
    return bundle;
  }

  async function loadFontOptions(): Promise<void> {
    if (fontOptions.length > 0) {
      return;
    }
    try {
      const fontConfig = await fetchJson<{ fonts: Record<string, { displayName?: string }> }>('themes/font-config.json');
      fontOptions = Object.keys(fontConfig.fonts).map((key) => ({
        id: key,
        label: fontConfig.fonts[key].displayName || key
      }));
    } catch (error) {
      console.error('Failed to load font config:', error);
      fontOptions = [];
    }
  }

  function populateFontSelect(selectEl: HTMLSelectElement, allowEmpty: boolean): void {
    selectEl.innerHTML = '';
    if (allowEmpty) {
      const emptyOption = document.createElement('option');
      emptyOption.value = '';
      emptyOption.textContent = '--';
      selectEl.appendChild(emptyOption);
    }
    fontOptions.forEach((font) => {
      const option = document.createElement('option');
      option.value = font.id;
      option.textContent = font.label;
      selectEl.appendChild(option);
    });
  }

  function populateFontSelects(): void {
    const selectIds = [
      { id: 'custom-font-body', allowEmpty: false },
      { id: 'custom-font-headings', allowEmpty: true },
      { id: 'custom-font-code', allowEmpty: false },
      { id: 'custom-font-h1', allowEmpty: true },
      { id: 'custom-font-h2', allowEmpty: true },
      { id: 'custom-font-h3', allowEmpty: true },
      { id: 'custom-font-h4', allowEmpty: true },
      { id: 'custom-font-h5', allowEmpty: true },
      { id: 'custom-font-h6', allowEmpty: true }
    ];
    selectIds.forEach(({ id, allowEmpty }) => {
      const el = document.getElementById(id) as HTMLSelectElement | null;
      if (el) {
        populateFontSelect(el, allowEmpty);
      }
    });
  }

  async function loadCodeThemeOptions(): Promise<void> {
    if (codeThemeOptions.length > 0) {
      return;
    }
    const ids = Array.from(
      new Set(themes.map((theme) => theme.codeTheme).filter((id): id is string => Boolean(id)))
    );
    const options: Array<{ id: string; label: string }> = [];
    for (const id of ids) {
      try {
        const codeTheme = await fetchJson<CodeThemeConfig & { name?: string }>(`themes/code-themes/${id}.json`);
        options.push({ id, label: codeTheme.name || id });
      } catch (error) {
        options.push({ id, label: id });
      }
    }
    codeThemeOptions = options;
  }

  function populateCodeThemeSelect(): void {
    const select = document.getElementById('custom-code-theme') as HTMLSelectElement | null;
    if (!select) {
      return;
    }
    select.innerHTML = '';
    codeThemeOptions.forEach((theme) => {
      const option = document.createElement('option');
      option.value = theme.id;
      option.textContent = theme.label;
      select.appendChild(option);
    });
  }

  function populateCustomThemeBaseSelect(): void {
    const select = document.getElementById('custom-theme-base') as HTMLSelectElement | null;
    if (!select) {
      return;
    }
    select.innerHTML = '';
    const locale = getUiLocale();
    const useEnglish = !locale.startsWith('zh');
    themes.forEach((theme) => {
      if (theme.id === 'custom') return;
      const option = document.createElement('option');
      option.value = theme.id;
      option.textContent = useEnglish ? theme.name_en : theme.name;
      select.appendChild(option);
    });
  }

  function setupAdvancedToggles(): void {
    document.querySelectorAll<HTMLButtonElement>('.custom-theme-advanced-toggle').forEach((button) => {
      if (button.dataset.listenerAdded) {
        return;
      }
      button.dataset.listenerAdded = 'true';
      button.addEventListener('click', () => {
        const targetId = button.dataset.target;
        if (!targetId) return;
        const target = document.getElementById(targetId);
        if (target) {
          target.classList.toggle('is-open');
        }
      });
    });
  }

  function setCustomThemeError(message: string): void {
    const errorEl = document.getElementById('custom-theme-error');
    if (errorEl) {
      errorEl.textContent = message;
    }
  }

  function applyThemeBundleToForm(bundle: ThemeBundle): void {
    const { theme, layout, color, table, code } = bundle;

    setSelectValueById('custom-font-body', theme.fontScheme.body.fontFamily);
    setSelectValueById('custom-font-headings', theme.fontScheme.headings?.fontFamily || '');
    setSelectValueById('custom-font-code', theme.fontScheme.code.fontFamily);
    headingLevels.forEach((level) => {
      const heading = theme.fontScheme.headings?.[level] as { fontFamily?: string } | undefined;
      setSelectValueById(`custom-font-${level}`, heading?.fontFamily || '');
    });

    setNumberValueById('custom-body-font-size', stripPt(layout.body.fontSize));
    setNumberValueById('custom-body-line-height', layout.body.lineHeight);
    setNumberValueById('custom-heading-h1-size', stripPt(layout.headings.h1.fontSize));
    setNumberValueById('custom-heading-h2-size', stripPt(layout.headings.h2.fontSize));
    headingLevels.forEach((level) => {
      const heading = layout.headings[level];
      setNumberValueById(`custom-heading-${level}-size`, stripPt(heading.fontSize));
      setNumberValueById(`custom-heading-${level}-before`, stripPt(heading.spacingBefore));
      setNumberValueById(`custom-heading-${level}-after`, stripPt(heading.spacingAfter));
      setSelectValueById(`custom-heading-${level}-align`, heading.alignment || 'left');
    });
    setNumberValueById('custom-code-font-size', stripPt(layout.code.fontSize));
    setNumberValueById('custom-block-paragraph-after', stripPt(layout.blocks.paragraph?.spacingAfter));
    setNumberValueById('custom-block-list-after', stripPt(layout.blocks.list?.spacingAfter));
    setNumberValueById('custom-block-list-item-after', stripPt(layout.blocks.listItem?.spacingAfter));
    setNumberValueById('custom-block-blockquote-before', stripPt(layout.blocks.blockquote?.spacingBefore));
    setNumberValueById('custom-block-blockquote-after', stripPt(layout.blocks.blockquote?.spacingAfter));
    setNumberValueById('custom-block-blockquote-pad-v', stripPt(layout.blocks.blockquote?.paddingVertical));
    setNumberValueById('custom-block-blockquote-pad-h', stripPt(layout.blocks.blockquote?.paddingHorizontal));
    setNumberValueById('custom-block-code-after', stripPt(layout.blocks.codeBlock?.spacingAfter));
    setNumberValueById('custom-block-table-after', stripPt(layout.blocks.table?.spacingAfter));
    setNumberValueById('custom-block-hr-before', stripPt(layout.blocks.horizontalRule?.spacingBefore));
    setNumberValueById('custom-block-hr-after', stripPt(layout.blocks.horizontalRule?.spacingAfter));

    setInputValueById('custom-color-text-primary', color.text.primary);
    setInputValueById('custom-color-text-secondary', color.text.secondary);
    setInputValueById('custom-color-text-muted', color.text.muted);
    setInputValueById('custom-color-link', color.accent.link);
    setInputValueById('custom-color-link-hover', color.accent.linkHover);
    setInputValueById('custom-color-code-bg', color.background.code);
    setInputValueById('custom-color-blockquote-border', color.blockquote.border);
    setInputValueById('custom-color-table-border', color.table.border);
    setInputValueById('custom-color-table-header-bg', color.table.headerBackground);
    setInputValueById('custom-color-table-header-text', color.table.headerText);
    setInputValueById('custom-color-table-zebra-even', color.table.zebraEven);
    setInputValueById('custom-color-table-zebra-odd', color.table.zebraOdd);
    headingLevels.forEach((level) => {
      setInputValueById(`custom-color-heading-${level}`, color.headings?.[level] || '');
    });

    setNumberValueById('custom-table-border-width', stripPt(table.border?.all?.width));
    setSelectValueById('custom-table-border-style', table.border?.all?.style || 'single');
    setCheckboxValueById('custom-table-header-bold', table.header?.fontWeight === 'bold');
    setNumberValueById('custom-table-cell-padding', stripPt(table.cell.padding));
    setCheckboxValueById('custom-table-zebra-enabled', Boolean(table.zebra?.enabled));
    setNumberValueById('custom-table-header-font-size', stripPt(table.header?.fontSize));
    setNumberValueById('custom-table-header-top-width', stripPt(table.border?.headerTop?.width));
    setSelectValueById('custom-table-header-top-style', table.border?.headerTop?.style || 'single');
    setNumberValueById('custom-table-header-bottom-width', stripPt(table.border?.headerBottom?.width));
    setSelectValueById('custom-table-header-bottom-style', table.border?.headerBottom?.style || 'single');
    setNumberValueById('custom-table-row-bottom-width', stripPt(table.border?.rowBottom?.width));
    setSelectValueById('custom-table-row-bottom-style', table.border?.rowBottom?.style || 'single');
    setNumberValueById('custom-table-last-row-bottom-width', stripPt(table.border?.lastRowBottom?.width));
    setSelectValueById('custom-table-last-row-bottom-style', table.border?.lastRowBottom?.style || 'single');

    const codeThemeId = (code as CodeThemeConfig & { id?: string }).id;
    setSelectValueById('custom-code-theme', codeThemeId || '');
    setInputValueById('custom-code-foreground', code.foreground || '');
    codeTokenFields.forEach(({ id, token }) => {
      setInputValueById(id, code.colors?.[token] || '');
    });

    setSelectValueById('custom-diagram-style', theme.diagramStyle || 'normal');
  }

  async function loadCustomThemeForm(bundle?: CustomThemeBundle | null): Promise<void> {
    const basePresetId = bundle?.basePresetId || currentTheme || 'default';
    setSelectValueById('custom-theme-base', basePresetId);
    const baseBundle = await fetchThemeBundle(basePresetId);
    const resolved = bundle
      ? mergeCustomTheme(baseBundle.theme, baseBundle.layout, baseBundle.color, baseBundle.table, baseBundle.code, bundle)
      : baseBundle;
    applyThemeBundleToForm(resolved);
  }

  function getHeadingConfigFromForm(level: typeof headingLevels[number]): Partial<LayoutScheme['headings'][typeof level]> | null {
    const size = getNumberValue(`custom-heading-${level}-size`);
    const before = getNumberValue(`custom-heading-${level}-before`);
    const after = getNumberValue(`custom-heading-${level}-after`);
    const align = getSelectValue(`custom-heading-${level}-align`);
    const heading: Partial<LayoutScheme['headings'][typeof level]> = {};
    if (size !== null) heading.fontSize = toPtString(size);
    if (before !== null) heading.spacingBefore = toPtString(before);
    if (after !== null) heading.spacingAfter = toPtString(after);
    if (align) heading.alignment = align as 'left' | 'center' | 'right';
    return Object.keys(heading).length > 0 ? heading : null;
  }

  function getBlockConfigFromForm(prefix: string): Partial<LayoutScheme['blocks'][keyof LayoutScheme['blocks']]> | null {
    const before = getNumberValue(`${prefix}-before`);
    const after = getNumberValue(`${prefix}-after`);
    const padV = getNumberValue(`${prefix}-pad-v`);
    const padH = getNumberValue(`${prefix}-pad-h`);
    const block: Partial<LayoutScheme['blocks'][keyof LayoutScheme['blocks']]> = {};
    if (before !== null) block.spacingBefore = toPtString(before);
    if (after !== null) block.spacingAfter = toPtString(after);
    if (padV !== null) block.paddingVertical = toPtString(padV);
    if (padH !== null) block.paddingHorizontal = toPtString(padH);
    return Object.keys(block).length > 0 ? block : null;
  }

  async function buildCustomThemeBundleFromForm(): Promise<CustomThemeBundle | null> {
    const basePresetId = getSelectValue('custom-theme-base') || 'default';

    const colors = {
      textPrimary: getInputValue('custom-color-text-primary'),
      textSecondary: getInputValue('custom-color-text-secondary'),
      textMuted: getInputValue('custom-color-text-muted'),
      link: getInputValue('custom-color-link'),
      linkHover: getInputValue('custom-color-link-hover'),
      codeBg: getInputValue('custom-color-code-bg'),
      blockquoteBorder: getInputValue('custom-color-blockquote-border'),
      tableBorder: getInputValue('custom-color-table-border'),
      tableHeaderBg: getInputValue('custom-color-table-header-bg'),
      tableHeaderText: getInputValue('custom-color-table-header-text'),
      tableZebraEven: getInputValue('custom-color-table-zebra-even'),
      tableZebraOdd: getInputValue('custom-color-table-zebra-odd'),
      headingH1: getInputValue('custom-color-heading-h1'),
      headingH2: getInputValue('custom-color-heading-h2'),
      headingH3: getInputValue('custom-color-heading-h3'),
      headingH4: getInputValue('custom-color-heading-h4'),
      headingH5: getInputValue('custom-color-heading-h5'),
      headingH6: getInputValue('custom-color-heading-h6'),
      codeForeground: getInputValue('custom-code-foreground'),
      codeKeyword: getInputValue('custom-code-token-keyword'),
      codeString: getInputValue('custom-code-token-string'),
      codeComment: getInputValue('custom-code-token-comment'),
      codeNumber: getInputValue('custom-code-token-number'),
      codeTitle: getInputValue('custom-code-token-title'),
      codeAttr: getInputValue('custom-code-token-attr'),
      codeBuiltIn: getInputValue('custom-code-token-built-in'),
      codeLiteral: getInputValue('custom-code-token-literal'),
      codeType: getInputValue('custom-code-token-type'),
      codeVariable: getInputValue('custom-code-token-variable'),
      codeProperty: getInputValue('custom-code-token-property')
    };

    const ptValues = {
      bodyFontSize: getNumberValue('custom-body-font-size'),
      headingH1Size: getNumberValue('custom-heading-h1-size'),
      headingH2Size: getNumberValue('custom-heading-h2-size'),
      headingH3Size: getNumberValue('custom-heading-h3-size'),
      headingH4Size: getNumberValue('custom-heading-h4-size'),
      headingH5Size: getNumberValue('custom-heading-h5-size'),
      headingH6Size: getNumberValue('custom-heading-h6-size'),
      headingH1Before: getNumberValue('custom-heading-h1-before'),
      headingH1After: getNumberValue('custom-heading-h1-after'),
      headingH2Before: getNumberValue('custom-heading-h2-before'),
      headingH2After: getNumberValue('custom-heading-h2-after'),
      headingH3Before: getNumberValue('custom-heading-h3-before'),
      headingH3After: getNumberValue('custom-heading-h3-after'),
      headingH4Before: getNumberValue('custom-heading-h4-before'),
      headingH4After: getNumberValue('custom-heading-h4-after'),
      headingH5Before: getNumberValue('custom-heading-h5-before'),
      headingH5After: getNumberValue('custom-heading-h5-after'),
      headingH6Before: getNumberValue('custom-heading-h6-before'),
      headingH6After: getNumberValue('custom-heading-h6-after'),
      codeFontSize: getNumberValue('custom-code-font-size'),
      blockParagraphAfter: getNumberValue('custom-block-paragraph-after'),
      blockListAfter: getNumberValue('custom-block-list-after'),
      blockListItemAfter: getNumberValue('custom-block-list-item-after'),
      blockBlockquoteBefore: getNumberValue('custom-block-blockquote-before'),
      blockBlockquoteAfter: getNumberValue('custom-block-blockquote-after'),
      blockBlockquotePadV: getNumberValue('custom-block-blockquote-pad-v'),
      blockBlockquotePadH: getNumberValue('custom-block-blockquote-pad-h'),
      blockCodeAfter: getNumberValue('custom-block-code-after'),
      blockTableAfter: getNumberValue('custom-block-table-after'),
      blockHrBefore: getNumberValue('custom-block-hr-before'),
      blockHrAfter: getNumberValue('custom-block-hr-after'),
      tableBorderWidth: getNumberValue('custom-table-border-width'),
      tableHeaderTopWidth: getNumberValue('custom-table-header-top-width'),
      tableHeaderBottomWidth: getNumberValue('custom-table-header-bottom-width'),
      tableRowBottomWidth: getNumberValue('custom-table-row-bottom-width'),
      tableLastRowBottomWidth: getNumberValue('custom-table-last-row-bottom-width'),
      tableCellPadding: getNumberValue('custom-table-cell-padding'),
      tableHeaderFontSize: getNumberValue('custom-table-header-font-size')
    };

    const validation = validateCustomThemeInputs({
      colors,
      ptValues,
      lineHeight: getNumberValue('custom-body-line-height')
    });

    if (!validation.ok) {
      setCustomThemeError(validation.errors.join('; '));
      return null;
    }

    setCustomThemeError('');

    const fontScheme: Theme['fontScheme'] = { body: { fontFamily: getSelectValue('custom-font-body') }, headings: {}, code: { fontFamily: getSelectValue('custom-font-code') } };
    const headingsFont = getSelectValue('custom-font-headings');
    if (headingsFont) {
      fontScheme.headings.fontFamily = headingsFont;
    }
    headingLevels.forEach((level) => {
      const font = getSelectValue(`custom-font-${level}`);
      if (font) {
        fontScheme.headings[level] = { fontFamily: font };
      }
    });

    const layoutScheme: Partial<LayoutScheme> = {};
    const bodyFontSize = getNumberValue('custom-body-font-size');
    const bodyLineHeight = getNumberValue('custom-body-line-height');
    if (bodyFontSize !== null || bodyLineHeight !== null) {
      const body: Partial<LayoutScheme['body']> = {};
      if (bodyFontSize !== null) {
        body.fontSize = toPtString(bodyFontSize);
      }
      if (bodyLineHeight !== null) {
        body.lineHeight = bodyLineHeight;
      }
      layoutScheme.body = body as LayoutScheme['body'];
    }
    const headings: Partial<LayoutScheme['headings']> = {};
    headingLevels.forEach((level) => {
      const heading = getHeadingConfigFromForm(level);
      if (heading) {
        headings[level] = heading;
      }
    });
    if (Object.keys(headings).length > 0) {
      layoutScheme.headings = headings as LayoutScheme['headings'];
    }
    const codeFontSize = getNumberValue('custom-code-font-size');
    if (codeFontSize !== null) {
      layoutScheme.code = { fontSize: toPtString(codeFontSize) || '10pt' };
    }
    const blocks: Partial<LayoutScheme['blocks']> = {};
    const paragraph = getBlockConfigFromForm('custom-block-paragraph');
    if (paragraph) blocks.paragraph = paragraph;
    const list = getBlockConfigFromForm('custom-block-list');
    if (list) blocks.list = list;
    const listItem = getBlockConfigFromForm('custom-block-list-item');
    if (listItem) blocks.listItem = listItem;
    const blockquote = getBlockConfigFromForm('custom-block-blockquote');
    if (blockquote) blocks.blockquote = blockquote;
    const codeBlock = getBlockConfigFromForm('custom-block-code');
    if (codeBlock) blocks.codeBlock = codeBlock;
    const tableBlock = getBlockConfigFromForm('custom-block-table');
    if (tableBlock) blocks.table = tableBlock;
    const hrBlock = getBlockConfigFromForm('custom-block-hr');
    if (hrBlock) blocks.horizontalRule = hrBlock;
    if (Object.keys(blocks).length > 0) {
      layoutScheme.blocks = blocks as LayoutScheme['blocks'];
    }

    const colorScheme: Partial<ColorScheme> = {};
    const text: Partial<ColorScheme['text']> = {};
    const textPrimary = normalizeHexColor(colors.textPrimary);
    const textSecondary = normalizeHexColor(colors.textSecondary);
    const textMuted = normalizeHexColor(colors.textMuted);
    if (textPrimary) text.primary = textPrimary;
    if (textSecondary) text.secondary = textSecondary;
    if (textMuted) text.muted = textMuted;
    if (Object.keys(text).length > 0) {
      colorScheme.text = text as ColorScheme['text'];
    }
    const accent: Partial<ColorScheme['accent']> = {};
    const link = normalizeHexColor(colors.link);
    const linkHover = normalizeHexColor(colors.linkHover);
    if (link) accent.link = link;
    if (linkHover) accent.linkHover = linkHover;
    if (Object.keys(accent).length > 0) {
      colorScheme.accent = accent as ColorScheme['accent'];
    }
    const background: Partial<ColorScheme['background']> = {};
    const codeBg = normalizeHexColor(colors.codeBg);
    if (codeBg) background.code = codeBg;
    if (Object.keys(background).length > 0) {
      colorScheme.background = background as ColorScheme['background'];
    }
    const blockquote: Partial<ColorScheme['blockquote']> = {};
    const blockquoteBorder = normalizeHexColor(colors.blockquoteBorder);
    if (blockquoteBorder) blockquote.border = blockquoteBorder;
    if (Object.keys(blockquote).length > 0) {
      colorScheme.blockquote = blockquote as ColorScheme['blockquote'];
    }
    const tableColors: Partial<ColorScheme['table']> = {};
    const tableBorder = normalizeHexColor(colors.tableBorder);
    const headerBg = normalizeHexColor(colors.tableHeaderBg);
    const headerText = normalizeHexColor(colors.tableHeaderText);
    const zebraEven = normalizeHexColor(colors.tableZebraEven);
    const zebraOdd = normalizeHexColor(colors.tableZebraOdd);
    if (tableBorder) tableColors.border = tableBorder;
    if (headerBg) tableColors.headerBackground = headerBg;
    if (headerText) tableColors.headerText = headerText;
    if (zebraEven) tableColors.zebraEven = zebraEven;
    if (zebraOdd) tableColors.zebraOdd = zebraOdd;
    if (Object.keys(tableColors).length > 0) {
      colorScheme.table = tableColors as ColorScheme['table'];
    }
    const headingColors: Partial<ColorScheme['headings']> = {};
    const headingColorMap: Record<string, string | undefined> = {
      h1: normalizeHexColor(colors.headingH1),
      h2: normalizeHexColor(colors.headingH2),
      h3: normalizeHexColor(colors.headingH3),
      h4: normalizeHexColor(colors.headingH4),
      h5: normalizeHexColor(colors.headingH5),
      h6: normalizeHexColor(colors.headingH6)
    };
    headingLevels.forEach((level) => {
      const color = headingColorMap[level];
      if (color) {
        headingColors[level] = color;
      }
    });
    if (Object.keys(headingColors).length > 0) {
      colorScheme.headings = headingColors as ColorScheme['headings'];
    }

    const tableStyle: Partial<TableStyleConfig> = {};
    const borderStyle = getSelectValue('custom-table-border-style');
    const borderWidth = getNumberValue('custom-table-border-width');
    if (borderWidth !== null) {
      tableStyle.border = {
        all: { width: toPtString(borderWidth) || '1pt', style: borderStyle || 'single' }
      };
    }
    const headerBold = getCheckboxValue('custom-table-header-bold');
    tableStyle.header = { fontWeight: headerBold ? 'bold' : 'normal' };
    const headerFontSize = getNumberValue('custom-table-header-font-size');
    if (headerFontSize !== null) {
      tableStyle.header.fontSize = toPtString(headerFontSize);
    }
    const cellPadding = getNumberValue('custom-table-cell-padding');
    if (cellPadding !== null) {
      tableStyle.cell = { padding: toPtString(cellPadding) || '8pt' };
    } else {
      tableStyle.cell = { padding: '8pt' };
    }
    tableStyle.zebra = { enabled: getCheckboxValue('custom-table-zebra-enabled') };
    const headerTopWidth = getNumberValue('custom-table-header-top-width');
    const headerTopStyle = getSelectValue('custom-table-header-top-style');
    if (headerTopWidth !== null) {
      tableStyle.border = { ...(tableStyle.border || {}), headerTop: { width: toPtString(headerTopWidth) || '1pt', style: headerTopStyle || 'single' } };
    }
    const headerBottomWidth = getNumberValue('custom-table-header-bottom-width');
    const headerBottomStyle = getSelectValue('custom-table-header-bottom-style');
    if (headerBottomWidth !== null) {
      tableStyle.border = { ...(tableStyle.border || {}), headerBottom: { width: toPtString(headerBottomWidth) || '1pt', style: headerBottomStyle || 'single' } };
    }
    const rowBottomWidth = getNumberValue('custom-table-row-bottom-width');
    const rowBottomStyle = getSelectValue('custom-table-row-bottom-style');
    if (rowBottomWidth !== null) {
      tableStyle.border = { ...(tableStyle.border || {}), rowBottom: { width: toPtString(rowBottomWidth) || '1pt', style: rowBottomStyle || 'single' } };
    }
    const lastRowWidth = getNumberValue('custom-table-last-row-bottom-width');
    const lastRowStyle = getSelectValue('custom-table-last-row-bottom-style');
    if (lastRowWidth !== null) {
      tableStyle.border = { ...(tableStyle.border || {}), lastRowBottom: { width: toPtString(lastRowWidth) || '1pt', style: lastRowStyle || 'single' } };
    }

    const codeThemeId = getSelectValue('custom-code-theme');
    let codeTheme: CodeThemeConfig = { colors: {}, foreground: '' };
    try {
      if (codeThemeId) {
        codeTheme = await fetchJson<CodeThemeConfig>(`themes/code-themes/${codeThemeId}.json`);
      }
    } catch (error) {
      console.warn('Failed to load code theme', codeThemeId, error);
    }
    const codeForeground = normalizeHexColor(colors.codeForeground);
    if (codeForeground) {
      codeTheme.foreground = codeForeground;
    }
    codeTokenFields.forEach(({ token, id }) => {
      const value = normalizeHexColor(getInputValue(id));
      if (value) {
        codeTheme.colors = { ...codeTheme.colors, [token]: value };
      }
    });

    const diagramStyle = getSelectValue('custom-diagram-style') as Theme['diagramStyle'];

    return {
      basePresetId,
      overrides: {
        fontScheme,
        diagramStyle
      },
      schemes: {
        layoutScheme,
        colorScheme,
        tableStyle,
        codeTheme
      }
    };
  }

  async function saveCustomThemeBundle(bundle: CustomThemeBundle, apply: boolean): Promise<void> {
    await storageSet({ customThemeBundle: bundle });
    customThemeBundle = bundle;
    if (apply) {
      await storageSet({ selectedTheme: 'custom' });
      currentTheme = 'custom';
      notifySettingChanged('themeId', 'custom');
      showMessage(translate('settings_custom_theme_applied'), 'success');
    } else {
      showMessage(translate('settings_custom_theme_saved'), 'success');
    }
    loadThemes();
  }

  async function initializeCustomThemeUI(): Promise<void> {
    const detailsEl = document.getElementById('custom-theme-details');
    if (!detailsEl) {
      return;
    }

    setupAdvancedToggles();
    await loadFontOptions();
    populateFontSelects();
    await loadCodeThemeOptions();
    populateCodeThemeSelect();
    populateCustomThemeBaseSelect();

    const baseSelect = document.getElementById('custom-theme-base') as HTMLSelectElement | null;
    if (baseSelect && !baseSelect.dataset.listenerAdded) {
      baseSelect.dataset.listenerAdded = 'true';
      baseSelect.addEventListener('change', async () => {
        const basePresetId = baseSelect.value || 'default';
        await loadCustomThemeForm({ basePresetId });
      });
    }

    const generateBtn = document.getElementById('custom-theme-generate') as HTMLButtonElement | null;
    if (generateBtn && !generateBtn.dataset.listenerAdded) {
      generateBtn.dataset.listenerAdded = 'true';
      generateBtn.addEventListener('click', async () => {
        if (currentTheme === 'custom' && customThemeBundle) {
          await loadCustomThemeForm(customThemeBundle);
        } else {
          await loadCustomThemeForm({ basePresetId: currentTheme || 'default' });
        }
      });
    }

    const applyBtn = document.getElementById('custom-theme-apply') as HTMLButtonElement | null;
    if (applyBtn && !applyBtn.dataset.listenerAdded) {
      applyBtn.dataset.listenerAdded = 'true';
      applyBtn.addEventListener('click', async () => {
        const bundle = await buildCustomThemeBundleFromForm();
        if (!bundle) return;
        await saveCustomThemeBundle(bundle, true);
      });
    }

    const saveBtn = document.getElementById('custom-theme-save') as HTMLButtonElement | null;
    if (saveBtn && !saveBtn.dataset.listenerAdded) {
      saveBtn.dataset.listenerAdded = 'true';
      saveBtn.addEventListener('click', async () => {
        const bundle = await buildCustomThemeBundleFromForm();
        if (!bundle) return;
        await saveCustomThemeBundle(bundle, false);
      });
    }

    const restoreBtn = document.getElementById('custom-theme-restore') as HTMLButtonElement | null;
    if (restoreBtn && !restoreBtn.dataset.listenerAdded) {
      restoreBtn.dataset.listenerAdded = 'true';
      restoreBtn.addEventListener('click', async () => {
        if (!customThemeBundle) {
          showMessage(translate('settings_custom_theme_restore_empty'), 'info');
          return;
        }
        await loadCustomThemeForm(customThemeBundle);
      });
    }

    if (customThemeBundle) {
      await loadCustomThemeForm(customThemeBundle);
    } else {
      await loadCustomThemeForm({ basePresetId: currentTheme || 'default' });
    }
  }

  /**
   * Load settings from storage
   */
  async function loadSettings(): Promise<void> {
    try {
      const result = await storageGet(['markdownViewerSettings']);
      if (result.markdownViewerSettings) {
        settings = { ...settings, ...result.markdownViewerSettings };
      }

      if (!settings.docxHrDisplay) {
        settings.docxHrDisplay = 'hide';
      }
      settings.docxHeadingScalePct = parseOptionalNumber(settings.docxHeadingScalePct, 1);
      settings.docxHeadingSpacingBeforePt = parseOptionalNumber(settings.docxHeadingSpacingBeforePt, 0);
      settings.docxHeadingSpacingAfterPt = parseOptionalNumber(settings.docxHeadingSpacingAfterPt, 0);
      settings.docxHeadingAlignment = (settings.docxHeadingAlignment === 'left' || settings.docxHeadingAlignment === 'center' ||
        settings.docxHeadingAlignment === 'right' || settings.docxHeadingAlignment === 'justify')
        ? settings.docxHeadingAlignment
        : null;
      settings.docxCodeFontSizePt = parseOptionalNumber(settings.docxCodeFontSizePt, 0);
      settings.docxTableBorderWidthPt = parseOptionalNumber(settings.docxTableBorderWidthPt, 0);
      settings.docxTableCellPaddingPt = parseOptionalNumber(settings.docxTableCellPaddingPt, 0);
      if (settings.tableAlignment !== 'left' && settings.tableAlignment !== 'center' &&
          settings.tableAlignment !== 'right' && settings.tableAlignment !== 'justify') {
        settings.tableAlignment = 'center';
      }
      settings.tableStyleOverride = normalizeTableStyleOverride(settings.tableStyleOverride);

      // Load selected theme
      const themeResult = await storageGet(['selectedTheme']);
      currentTheme = (themeResult.selectedTheme as string) || 'default';

      await loadCustomThemeBundle();
      if (currentTheme === 'custom' && !customThemeBundle) {
        currentTheme = 'default';
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  /**
   * Load settings into UI elements
   */
  function loadSettingsUI(): void {
    // Max cache items
    const maxCacheItemsEl = document.getElementById('max-cache-items') as HTMLSelectElement | null;
    if (maxCacheItemsEl) {
      maxCacheItemsEl.value = String(settings.maxCacheItems);
      
      // Add change listener for immediate save
      if (!maxCacheItemsEl.dataset.listenerAdded) {
        maxCacheItemsEl.dataset.listenerAdded = 'true';
        maxCacheItemsEl.addEventListener('change', async () => {
          const value = parseInt(maxCacheItemsEl.value, 10);
          if (!Number.isNaN(value)) {
            settings.maxCacheItems = value;
            await saveSettingsToStorage();
          }
        });
      }
    }

    // Locale selector
    const localeSelect = document.getElementById('interface-language') as HTMLSelectElement | null;
    if (localeSelect) {
      void loadLocalesIntoSelect(localeSelect);

      // Add change listener for immediate language change (only once)
      if (!localeSelect.dataset.listenerAdded) {
        localeSelect.dataset.listenerAdded = 'true';
        localeSelect.addEventListener('change', async (event) => {
          const target = event.target as HTMLSelectElement;
          const newLocale = target.value;
          try {
            settings.preferredLocale = newLocale;
            await storageSet({
              markdownViewerSettings: settings
            });

            await Localization.setPreferredLocale(newLocale);
            safeSendMessage({
              id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
              type: 'LOCALE_CHANGED',
              payload: { locale: newLocale },
              timestamp: Date.now(),
              source: 'popup-settings',
            });
            applyI18nText();

            // Reload themes and table styles to update names
            void loadThemes().then(() => initializeCustomThemeUI());
            void loadTableStyles();

            showMessage(translate('settings_language_changed'), 'success');
          } catch (error) {
            console.error('Failed to change language:', error);
            showMessage(translate('settings_save_failed'), 'error');
          }
        });
      }
    }

    // Load themes + table styles
    void loadThemes().then(() => initializeCustomThemeUI());
    void loadTableStyles();

    // DOCX: Horizontal rule display
    const docxHrDisplayEl = document.getElementById('docx-hr-display') as HTMLSelectElement | null;
    if (docxHrDisplayEl) {
      docxHrDisplayEl.value = settings.docxHrDisplay || 'hide';

      // Add change listener for immediate save
      if (!docxHrDisplayEl.dataset.listenerAdded) {
        docxHrDisplayEl.dataset.listenerAdded = 'true';
        docxHrDisplayEl.addEventListener('change', async () => {
          settings.docxHrDisplay = docxHrDisplayEl.value as Settings['docxHrDisplay'];
          await saveSettingsToStorage();
        });
      }
    }

    // DOCX: Emoji style
    const docxEmojiStyleEl = document.getElementById('docx-emoji-style') as HTMLSelectElement | null;
    if (docxEmojiStyleEl) {
        docxEmojiStyleEl.value = settings.docxEmojiStyle || 'system';
      if (!docxEmojiStyleEl.dataset.listenerAdded) {
        docxEmojiStyleEl.dataset.listenerAdded = 'true';
        docxEmojiStyleEl.addEventListener('change', async () => {
          settings.docxEmojiStyle = docxEmojiStyleEl.value as EmojiStyle;
          await saveSettingsToStorage();
        });
      }
    }

    // DOCX: Theme mapping overrides
    const docxHeadingScaleEl = document.getElementById('docx-heading-scale-pct') as HTMLInputElement | null;
    if (docxHeadingScaleEl) {
      setNumberInputValue(docxHeadingScaleEl, settings.docxHeadingScalePct);
      if (!docxHeadingScaleEl.dataset.listenerAdded) {
        docxHeadingScaleEl.dataset.listenerAdded = 'true';
        docxHeadingScaleEl.addEventListener('change', async () => {
          settings.docxHeadingScalePct = parseOptionalNumber(docxHeadingScaleEl.value, 1);
          await saveSettingsToStorage();
        });
      }
    }

    const docxHeadingSpacingBeforeEl = document.getElementById('docx-heading-spacing-before-pt') as HTMLInputElement | null;
    if (docxHeadingSpacingBeforeEl) {
      setNumberInputValue(docxHeadingSpacingBeforeEl, settings.docxHeadingSpacingBeforePt);
      if (!docxHeadingSpacingBeforeEl.dataset.listenerAdded) {
        docxHeadingSpacingBeforeEl.dataset.listenerAdded = 'true';
        docxHeadingSpacingBeforeEl.addEventListener('change', async () => {
          settings.docxHeadingSpacingBeforePt = parseOptionalNumber(docxHeadingSpacingBeforeEl.value, 0);
          await saveSettingsToStorage();
        });
      }
    }

    const docxHeadingSpacingAfterEl = document.getElementById('docx-heading-spacing-after-pt') as HTMLInputElement | null;
    if (docxHeadingSpacingAfterEl) {
      setNumberInputValue(docxHeadingSpacingAfterEl, settings.docxHeadingSpacingAfterPt);
      if (!docxHeadingSpacingAfterEl.dataset.listenerAdded) {
        docxHeadingSpacingAfterEl.dataset.listenerAdded = 'true';
        docxHeadingSpacingAfterEl.addEventListener('change', async () => {
          settings.docxHeadingSpacingAfterPt = parseOptionalNumber(docxHeadingSpacingAfterEl.value, 0);
          await saveSettingsToStorage();
        });
      }
    }

    const docxHeadingAlignmentEl = document.getElementById('docx-heading-alignment') as HTMLSelectElement | null;
    if (docxHeadingAlignmentEl) {
      docxHeadingAlignmentEl.value = settings.docxHeadingAlignment ?? '';
      if (!docxHeadingAlignmentEl.dataset.listenerAdded) {
        docxHeadingAlignmentEl.dataset.listenerAdded = 'true';
        docxHeadingAlignmentEl.addEventListener('change', async () => {
          const value = docxHeadingAlignmentEl.value;
          settings.docxHeadingAlignment = (value === 'left' || value === 'center' || value === 'right' || value === 'justify')
            ? value as TableAlignment
            : null;
          await saveSettingsToStorage();
        });
      }
    }

    const docxCodeFontSizeEl = document.getElementById('docx-code-font-size-pt') as HTMLInputElement | null;
    if (docxCodeFontSizeEl) {
      setNumberInputValue(docxCodeFontSizeEl, settings.docxCodeFontSizePt);
      if (!docxCodeFontSizeEl.dataset.listenerAdded) {
        docxCodeFontSizeEl.dataset.listenerAdded = 'true';
        docxCodeFontSizeEl.addEventListener('change', async () => {
          settings.docxCodeFontSizePt = parseOptionalNumber(docxCodeFontSizeEl.value, 0);
          await saveSettingsToStorage();
        });
      }
    }

    const docxTableBorderWidthEl = document.getElementById('docx-table-border-width-pt') as HTMLInputElement | null;
    if (docxTableBorderWidthEl) {
      setNumberInputValue(docxTableBorderWidthEl, settings.docxTableBorderWidthPt);
      if (!docxTableBorderWidthEl.dataset.listenerAdded) {
        docxTableBorderWidthEl.dataset.listenerAdded = 'true';
        docxTableBorderWidthEl.addEventListener('change', async () => {
          settings.docxTableBorderWidthPt = parseOptionalNumber(docxTableBorderWidthEl.value, 0);
          await saveSettingsToStorage();
        });
      }
    }

    const docxTableCellPaddingEl = document.getElementById('docx-table-cell-padding-pt') as HTMLInputElement | null;
    if (docxTableCellPaddingEl) {
      setNumberInputValue(docxTableCellPaddingEl, settings.docxTableCellPaddingPt);
      if (!docxTableCellPaddingEl.dataset.listenerAdded) {
        docxTableCellPaddingEl.dataset.listenerAdded = 'true';
        docxTableCellPaddingEl.addEventListener('change', async () => {
          settings.docxTableCellPaddingPt = parseOptionalNumber(docxTableCellPaddingEl.value, 0);
          await saveSettingsToStorage();
        });
      }
    }

    // Frontmatter display mode
    const frontmatterDisplayEl = document.getElementById('frontmatter-display') as HTMLSelectElement | null;
    if (frontmatterDisplayEl) {
      frontmatterDisplayEl.value = settings.frontmatterDisplay || 'hide';
      if (!frontmatterDisplayEl.dataset.listenerAdded) {
        frontmatterDisplayEl.dataset.listenerAdded = 'true';
        frontmatterDisplayEl.addEventListener('change', async () => {
          settings.frontmatterDisplay = frontmatterDisplayEl.value as FrontmatterDisplay;
          await saveSettingsToStorage();
          // Notify all tabs to re-render
          notifySettingChanged('frontmatterDisplay', settings.frontmatterDisplay);
        });
      }
    }

    // Table merge empty cells
    const tableMergeEmptyEl = document.getElementById('table-merge-empty') as HTMLInputElement | null;
    if (tableMergeEmptyEl) {
      tableMergeEmptyEl.checked = settings.tableMergeEmpty ?? true;
      if (!tableMergeEmptyEl.dataset.listenerAdded) {
        tableMergeEmptyEl.dataset.listenerAdded = 'true';
        tableMergeEmptyEl.addEventListener('change', async () => {
          settings.tableMergeEmpty = tableMergeEmptyEl.checked;
          await saveSettingsToStorage();
          // Notify all tabs to re-render
          notifySettingChanged('tableMergeEmpty', settings.tableMergeEmpty);
        });
      }
    }

    // Table alignment
    const tableAlignmentEl = document.getElementById('table-alignment') as HTMLSelectElement | null;
    if (tableAlignmentEl) {
      tableAlignmentEl.value = settings.tableAlignment || 'center';
      if (!tableAlignmentEl.dataset.listenerAdded) {
        tableAlignmentEl.dataset.listenerAdded = 'true';
        tableAlignmentEl.addEventListener('change', async () => {
          settings.tableAlignment = tableAlignmentEl.value as TableAlignment;
          await saveSettingsToStorage();
          // Notify all tabs to re-render
          notifySettingChanged('tableAlignment', settings.tableAlignment);
        });
      }
    }

    // Table style override
    const tableStyleOverrideEl = document.getElementById('table-style-override') as HTMLSelectElement | null;
    if (tableStyleOverrideEl) {
      if (!tableStyleOverrideEl.dataset.listenerAdded) {
        tableStyleOverrideEl.dataset.listenerAdded = 'true';
        tableStyleOverrideEl.addEventListener('change', async () => {
          settings.tableStyleOverride = normalizeTableStyleOverride(tableStyleOverrideEl.value);
          await saveSettingsToStorage();
          // Notify all tabs to re-render theme styles
          notifySettingChanged('tableStyleOverride', settings.tableStyleOverride);
        });
      }
    }

    // Auto Refresh settings (Chrome only)
    loadAutoRefreshSettingsUI();

    // Load supported file extensions checkboxes
    const ext = settings.supportedExtensions || {
      mermaid: true,
      vega: true,
      vegaLite: true,
      dot: true,
      infographic: true,
      canvas: true,
      drawio: true,
    };

    const supportMermaidEl = document.getElementById('support-mermaid') as HTMLInputElement | null;
    if (supportMermaidEl) {
      supportMermaidEl.checked = ext.mermaid;
      addExtensionChangeListener(supportMermaidEl, 'mermaid');
    }

    const supportVegaEl = document.getElementById('support-vega') as HTMLInputElement | null;
    if (supportVegaEl) {
      supportVegaEl.checked = ext.vega;
      addExtensionChangeListener(supportVegaEl, 'vega');
    }

    const supportVegaLiteEl = document.getElementById('support-vega-lite') as HTMLInputElement | null;
    if (supportVegaLiteEl) {
      supportVegaLiteEl.checked = ext.vegaLite;
      addExtensionChangeListener(supportVegaLiteEl, 'vegaLite');
    }

    const supportDotEl = document.getElementById('support-dot') as HTMLInputElement | null;
    if (supportDotEl) {
      supportDotEl.checked = ext.dot;
      addExtensionChangeListener(supportDotEl, 'dot');
    }

    const supportInfographicEl = document.getElementById('support-infographic') as HTMLInputElement | null;
    if (supportInfographicEl) {
      supportInfographicEl.checked = ext.infographic;
      addExtensionChangeListener(supportInfographicEl, 'infographic');
    }

    const supportCanvasEl = document.getElementById('support-canvas') as HTMLInputElement | null;
    if (supportCanvasEl) {
      supportCanvasEl.checked = ext.canvas;
      addExtensionChangeListener(supportCanvasEl, 'canvas');
    }

    const supportDrawioEl = document.getElementById('support-drawio') as HTMLInputElement | null;
    if (supportDrawioEl) {
      supportDrawioEl.checked = ext.drawio;
      addExtensionChangeListener(supportDrawioEl, 'drawio');
    }
  }

  async function loadLocalesIntoSelect(localeSelect: HTMLSelectElement): Promise<void> {
    try {
      if (!localeRegistry) {
        const url = chrome.runtime.getURL('_locales/registry.json');
        const response = await fetch(url);
        localeRegistry = (await response.json()) as LocaleRegistry;
      }

      // Rebuild options each time to ensure registry order is reflected.
      localeSelect.innerHTML = '';

      const autoOption = document.createElement('option');
      autoOption.value = 'auto';
      autoOption.setAttribute('data-i18n', 'settings_language_auto');
      localeSelect.appendChild(autoOption);

      (localeRegistry.locales || []).forEach((locale) => {
        const option = document.createElement('option');
        option.value = locale.code;
        option.textContent = locale.name;
        localeSelect.appendChild(option);
      });

      // Apply i18n to the auto option.
      applyI18nText();

      // Set selected value AFTER options exist.
      localeSelect.value = settings.preferredLocale || DEFAULT_SETTING_LOCALE;
    } catch (error) {
      console.error('Failed to load locale registry:', error);
      // Fallback: keep whatever is currently in the DOM
      localeSelect.value = settings.preferredLocale || DEFAULT_SETTING_LOCALE;
    }
  }

  /**
   * Add change listener for extension checkbox
   */
  function addExtensionChangeListener(el: HTMLInputElement, key: keyof SupportedExtensions): void {
    if (!el.dataset.listenerAdded) {
      el.dataset.listenerAdded = 'true';
      el.addEventListener('change', async () => {
        if (!settings.supportedExtensions) {
          settings.supportedExtensions = {
            mermaid: true,
            vega: true,
            vegaLite: true,
            dot: true,
            infographic: true,
            canvas: true,
            drawio: true,
          };
        }
        settings.supportedExtensions[key] = el.checked;
        await saveSettingsToStorage();
      });
    }
  }

  /**
   * Load and setup Auto Refresh settings UI (Chrome only feature)
   */
  function loadAutoRefreshSettingsUI(): void {
    const enabledEl = document.getElementById('auto-refresh-enabled') as HTMLInputElement | null;
    const intervalEl = document.getElementById('auto-refresh-interval') as HTMLSelectElement | null;

    // If elements don't exist (not Chrome), skip
    if (!enabledEl || !intervalEl) {
      return;
    }

    // Load current settings from background
    chrome.runtime.sendMessage(
      {
        id: `get-auto-refresh-${Date.now()}`,
        type: 'GET_AUTO_REFRESH_SETTINGS',
        payload: {},
      },
      (response) => {
        if (response && response.ok && response.data) {
          const settings = response.data as { enabled: boolean; intervalMs: number };
          enabledEl.checked = settings.enabled;
          intervalEl.value = String(settings.intervalMs);
        }
      }
    );

    // Setup change listeners
    if (!enabledEl.dataset.listenerAdded) {
      enabledEl.dataset.listenerAdded = 'true';
      enabledEl.addEventListener('change', () => {
        updateAutoRefreshSettings();
      });
    }

    if (!intervalEl.dataset.listenerAdded) {
      intervalEl.dataset.listenerAdded = 'true';
      intervalEl.addEventListener('change', () => {
        updateAutoRefreshSettings();
      });
    }

    function updateAutoRefreshSettings(): void {
      const enabled = enabledEl!.checked;
      const intervalMs = parseInt(intervalEl!.value, 10);

      // Save to storage and update tracker
      const newSettings = { enabled, intervalMs };
      
      chrome.storage.local.set({ autoRefreshSettings: newSettings });

      chrome.runtime.sendMessage(
        {
          id: `update-auto-refresh-${Date.now()}`,
          type: 'UPDATE_AUTO_REFRESH_SETTINGS',
          payload: newSettings,
        },
        (response) => {
          if (response && response.ok) {
            showMessage(translate('settings_save_success'), 'success');

            // Broadcast to all markdown tabs
            safeQueryTabs({}).then((tabs) => {
              tabs.forEach((tab) => {
                if (tab.id && tab.url && (tab.url.endsWith('.md') || tab.url.endsWith('.markdown'))) {
                  safeSendTabMessage(tab.id, {
                    type: 'AUTO_REFRESH_SETTINGS_CHANGED',
                    payload: newSettings,
                  });
                }
              });
            });
          }
        }
      );
    }
  }

  /**
   * Save settings to storage (internal helper)
   */
  async function saveSettingsToStorage(): Promise<void> {
    try {
      await storageSet({
        markdownViewerSettings: settings
      });
      showMessage(translate('settings_save_success'), 'success');
    } catch (error) {
      console.error('Failed to save settings:', error);
      showMessage(translate('settings_save_failed'), 'error');
    }
  }

  /**
   * Load available themes from registry
   */
  async function loadThemes(): Promise<void> {
    try {
      // Load theme registry
      const registryResponse = await fetch(chrome.runtime.getURL('themes/registry.json'));
      registry = await registryResponse.json();

      // Load all theme metadata
      const themePromises = registry!.themes.map(async (themeInfo) => {
        try {
          const response = await fetch(chrome.runtime.getURL(`themes/presets/${themeInfo.file}`));
          const theme = await response.json();

          return {
            id: theme.id,
            name: theme.name,
            name_en: theme.name_en,
            description: theme.description,
            description_en: theme.description_en,
            category: themeInfo.category,
            featured: themeInfo.featured || false,
            layoutScheme: theme.layoutScheme,
            colorScheme: theme.colorScheme,
            tableStyle: theme.tableStyle,
            codeTheme: theme.codeTheme
          } as ThemeDefinition;
        } catch (error) {
          console.error(`Failed to load theme ${themeInfo.id}:`, error);
          return null;
        }
      });

      themes = (await Promise.all(themePromises)).filter((t): t is ThemeDefinition => t !== null);

      // Populate theme selector with categories
      const themeSelector = document.getElementById('theme-selector') as HTMLSelectElement | null;
      if (themeSelector) {
        themeSelector.innerHTML = '';

        // Get current locale to determine which name to use
        const locale = getUiLocale();
        const useEnglish = !locale.startsWith('zh');

        if (customThemeBundle) {
          const customGroup = document.createElement('optgroup');
          customGroup.label = translate('settings_custom_theme_option');
          const customOption = document.createElement('option');
          customOption.value = 'custom';
          customOption.textContent = translate('settings_custom_theme_option');
          if (currentTheme === 'custom') {
            customOption.selected = true;
          }
          customGroup.appendChild(customOption);
          themeSelector.appendChild(customGroup);
        }

        // Group themes by category
        const themesByCategory: Record<string, ThemeDefinition[]> = {};
        themes.forEach(theme => {
          if (!themesByCategory[theme.category]) {
            themesByCategory[theme.category] = [];
          }
          themesByCategory[theme.category].push(theme);
        });

        // Sort categories by their order property
        const sortedCategoryIds = Object.keys(registry!.categories)
          .sort((a, b) => (registry!.categories[a].order || 0) - (registry!.categories[b].order || 0));

        // Add themes grouped by category (in sorted order)
        sortedCategoryIds.forEach(categoryId => {
          const categoryInfo = registry!.categories[categoryId];
          if (!categoryInfo) return;

          const categoryThemes = themesByCategory[categoryId];
          if (!categoryThemes || categoryThemes.length === 0) return;

          const categoryGroup = document.createElement('optgroup');
          categoryGroup.label = useEnglish ? categoryInfo.name_en : categoryInfo.name;

          categoryThemes.forEach(theme => {
            const option = document.createElement('option');
            option.value = theme.id;
            option.textContent = useEnglish ? theme.name_en : theme.name;

            if (theme.id === currentTheme) {
              option.selected = true;
            }

            categoryGroup.appendChild(option);
          });

          themeSelector.appendChild(categoryGroup);
        });

        // Update description
        updateThemeDescription(currentTheme);

        // Add change listener
        themeSelector.addEventListener('change', (event) => {
          const target = event.target as HTMLSelectElement;
          switchTheme(target.value);
        });

        populateCustomThemeBaseSelect();
        if (codeThemeOptions.length === 0) {
          void loadCodeThemeOptions().then(() => populateCodeThemeSelect());
        }
      }
    } catch (error) {
      console.error('Failed to load themes:', error);
    }
  }

  /**
   * Load available table styles from registry
   */
  async function loadTableStyles(): Promise<void> {
    try {
      if (!tableStyleRegistry) {
        const registryResponse = await fetch(chrome.runtime.getURL('themes/table-styles/registry.json'));
        tableStyleRegistry = await registryResponse.json();
      }

      if (tableStyles.length === 0 && tableStyleRegistry?.styles) {
        const stylePromises = tableStyleRegistry.styles.map(async (styleInfo) => {
          try {
            const response = await fetch(chrome.runtime.getURL(`themes/table-styles/${styleInfo.file}`));
            const style = await response.json();
            return {
              id: style.id,
              name: style.name,
              name_en: style.name_en,
              description: style.description,
              description_en: style.description_en
            } as TableStyleDefinition;
          } catch (error) {
            console.error(`Failed to load table style ${styleInfo.id}:`, error);
            return null;
          }
        });

        tableStyles = (await Promise.all(stylePromises)).filter((t): t is TableStyleDefinition => t !== null);
      }

      refreshTableStyleSelect();
    } catch (error) {
      console.error('Failed to load table styles:', error);
    }
  }

  function refreshTableStyleSelect(): void {
    const tableStyleSelect = document.getElementById('table-style-override') as HTMLSelectElement | null;
    if (!tableStyleSelect) {
      return;
    }

    tableStyleSelect.innerHTML = '';

    const followOption = document.createElement('option');
    followOption.value = 'theme';
    followOption.setAttribute('data-i18n', 'settings_table_style_follow_theme');
    followOption.textContent = translate('settings_table_style_follow_theme');
    tableStyleSelect.appendChild(followOption);

    const locale = getUiLocale();
    const useEnglish = !locale.startsWith('zh');
    tableStyles.forEach((style) => {
      const option = document.createElement('option');
      option.value = style.id;
      option.textContent = useEnglish ? style.name_en : style.name;
      tableStyleSelect.appendChild(option);
    });

    const availableIds = new Set(tableStyles.map((style) => style.id));
    const selected = settings.tableStyleOverride && settings.tableStyleOverride !== 'theme' && availableIds.has(settings.tableStyleOverride)
      ? settings.tableStyleOverride
      : 'theme';
    settings.tableStyleOverride = selected;
    tableStyleSelect.value = selected;

    applyI18nText();
  }

  /**
   * Update theme description display
   * @param themeId - Theme ID
   */
  function updateThemeDescription(themeId: string): void {
    const descEl = document.getElementById('theme-description');

    if (!descEl) {
      return;
    }

    if (themeId === 'custom' && customThemeBundle) {
      const baseTheme = themes.find(t => t.id === customThemeBundle?.basePresetId);
      const locale = getUiLocale();
      const useEnglish = !locale.startsWith('zh');
      const baseName = useEnglish ? (baseTheme?.name_en || customThemeBundle.basePresetId) : (baseTheme?.name || customThemeBundle.basePresetId);
      descEl.textContent = translate('settings_custom_theme_based_on', [baseName]);
      return;
    }

    const theme = themes.find(t => t.id === themeId);
    if (theme) {
      const locale = getUiLocale();
      const useEnglish = !locale.startsWith('zh');
      descEl.textContent = useEnglish ? theme.description_en : theme.description;
    } else {
      descEl.textContent = '';
    }
  }

  /**
   * Switch to a different theme
   * @param themeId - Theme ID to switch to
   */
  async function switchTheme(themeId: string): Promise<void> {
    try {
      if (themeId === 'custom' && !customThemeBundle) {
        showMessage(translate('settings_custom_theme_restore_empty'), 'error');
        return;
      }
      // Save theme selection
      await storageSet({ selectedTheme: themeId });
      currentTheme = themeId;

      // Update description
      updateThemeDescription(themeId);

      // Notify all tabs to reload theme
      notifySettingChanged('themeId', themeId);

      showMessage(translate('settings_theme_changed'), 'success');
    } catch (error) {
      console.error('Failed to switch theme:', error);
      showMessage('Failed to switch theme', 'error');
    }
  }

  /**
   * Save settings to storage
   */
  async function saveSettings(): Promise<void> {
    try {
      const maxCacheItemsEl = document.getElementById('max-cache-items') as HTMLInputElement | null;
      const maxCacheItems = parseInt(maxCacheItemsEl?.value || '1000', 10);

      if (Number.isNaN(maxCacheItems) || maxCacheItems < 100 || maxCacheItems > 5000) {
        showMessage(
          translate('settings_invalid_max_cache', ['100', '5000']),
          'error'
        );
        return;
      }

      settings.maxCacheItems = maxCacheItems;

      const docxHrDisplayEl = document.getElementById('docx-hr-display') as HTMLSelectElement | null;
      if (docxHrDisplayEl) {
        settings.docxHrDisplay = docxHrDisplayEl.value as Settings['docxHrDisplay'];
      }

      const docxEmojiStyleEl = document.getElementById('docx-emoji-style') as HTMLSelectElement | null;
      if (docxEmojiStyleEl) {
        settings.docxEmojiStyle = docxEmojiStyleEl.value as EmojiStyle;
      }

      const docxHeadingScaleEl = document.getElementById('docx-heading-scale-pct') as HTMLInputElement | null;
      if (docxHeadingScaleEl) {
        settings.docxHeadingScalePct = parseOptionalNumber(docxHeadingScaleEl.value, 1);
      }

      const docxHeadingSpacingBeforeEl = document.getElementById('docx-heading-spacing-before-pt') as HTMLInputElement | null;
      if (docxHeadingSpacingBeforeEl) {
        settings.docxHeadingSpacingBeforePt = parseOptionalNumber(docxHeadingSpacingBeforeEl.value, 0);
      }

      const docxHeadingSpacingAfterEl = document.getElementById('docx-heading-spacing-after-pt') as HTMLInputElement | null;
      if (docxHeadingSpacingAfterEl) {
        settings.docxHeadingSpacingAfterPt = parseOptionalNumber(docxHeadingSpacingAfterEl.value, 0);
      }

      const docxHeadingAlignmentEl = document.getElementById('docx-heading-alignment') as HTMLSelectElement | null;
      if (docxHeadingAlignmentEl) {
        const value = docxHeadingAlignmentEl.value;
        settings.docxHeadingAlignment = (value === 'left' || value === 'center' || value === 'right' || value === 'justify')
          ? value as TableAlignment
          : null;
      }

      const docxCodeFontSizeEl = document.getElementById('docx-code-font-size-pt') as HTMLInputElement | null;
      if (docxCodeFontSizeEl) {
        settings.docxCodeFontSizePt = parseOptionalNumber(docxCodeFontSizeEl.value, 0);
      }

      const docxTableBorderWidthEl = document.getElementById('docx-table-border-width-pt') as HTMLInputElement | null;
      if (docxTableBorderWidthEl) {
        settings.docxTableBorderWidthPt = parseOptionalNumber(docxTableBorderWidthEl.value, 0);
      }

      const docxTableCellPaddingEl = document.getElementById('docx-table-cell-padding-pt') as HTMLInputElement | null;
      if (docxTableCellPaddingEl) {
        settings.docxTableCellPaddingPt = parseOptionalNumber(docxTableCellPaddingEl.value, 0);
      }

      const tableAlignmentEl = document.getElementById('table-alignment') as HTMLSelectElement | null;
      if (tableAlignmentEl) {
        settings.tableAlignment = tableAlignmentEl.value as TableAlignment;
      }

      const tableStyleOverrideEl = document.getElementById('table-style-override') as HTMLSelectElement | null;
      if (tableStyleOverrideEl) {
        settings.tableStyleOverride = normalizeTableStyleOverride(tableStyleOverrideEl.value);
      }

      // Load supported file extensions from checkboxes
      const supportMermaidEl = document.getElementById('support-mermaid') as HTMLInputElement | null;
      const supportVegaEl = document.getElementById('support-vega') as HTMLInputElement | null;
      const supportVegaLiteEl = document.getElementById('support-vega-lite') as HTMLInputElement | null;
      const supportDotEl = document.getElementById('support-dot') as HTMLInputElement | null;
      const supportInfographicEl = document.getElementById('support-infographic') as HTMLInputElement | null;
      const supportCanvasEl = document.getElementById('support-canvas') as HTMLInputElement | null;
      const supportDrawioEl = document.getElementById('support-drawio') as HTMLInputElement | null;

      settings.supportedExtensions = {
        mermaid: supportMermaidEl?.checked ?? true,
        vega: supportVegaEl?.checked ?? true,
        vegaLite: supportVegaLiteEl?.checked ?? true,
        dot: supportDotEl?.checked ?? true,
        infographic: supportInfographicEl?.checked ?? true,
        canvas: supportCanvasEl?.checked ?? true,
        drawio: supportDrawioEl?.checked ?? true,
      };

      await storageSet({
        markdownViewerSettings: settings
      });

      if (onReloadCacheData) {
        onReloadCacheData();
      }

      // No need to update cacheManager.maxItems here
      // Background script will update it via storage.onChanged listener

      showMessage(translate('settings_save_success'), 'success');
    } catch (error) {
      console.error('Failed to save settings:', error);
      showMessage(translate('settings_save_failed'), 'error');
    }
  }

  /**
   * Reset settings to defaults
   */
  async function resetSettings(): Promise<void> {
    const confirmMessage = translate('settings_reset_confirm');
    const confirmed = await showConfirm(translate('settings_reset_btn'), confirmMessage);

    if (!confirmed) {
      return;
    }

    try {
      settings = {
        maxCacheItems: 1000,
        preferredLocale: DEFAULT_SETTING_LOCALE,
        docxHrDisplay: 'hide',
        docxEmojiStyle: 'system',
        docxHeadingScalePct: null,
        docxHeadingSpacingBeforePt: null,
        docxHeadingSpacingAfterPt: null,
        docxHeadingAlignment: null,
        docxCodeFontSizePt: null,
        docxTableBorderWidthPt: null,
        docxTableCellPaddingPt: null,
        supportedExtensions: {
          mermaid: true,
          vega: true,
          vegaLite: true,
          dot: true,
          infographic: true,
          canvas: true,
          drawio: true,
        },
        tableMergeEmpty: true,
        tableAlignment: 'center',
        tableStyleOverride: 'theme',
      };

      await storageSet({
        markdownViewerSettings: settings
      });

      await Localization.setPreferredLocale(DEFAULT_SETTING_LOCALE);
      safeSendMessage({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        type: 'LOCALE_CHANGED',
        payload: { locale: DEFAULT_SETTING_LOCALE },
        timestamp: Date.now(),
        source: 'popup-settings',
      });
      applyI18nText();

      if (onReloadCacheData) {
        onReloadCacheData();
      }

      loadSettingsUI();
      showMessage(translate('settings_reset_success'), 'success');
    } catch (error) {
      console.error('Failed to reset settings:', error);
      showMessage(translate('settings_reset_failed'), 'error');
    }
  }

  /**
   * Get current settings
   * @returns Current settings
   */
  function getSettings(): Settings {
    return { ...settings };
  }

  return {
    loadSettings,
    loadSettingsUI,
    saveSettings,
    resetSettings,
    getSettings,
    loadThemes
  };
}
