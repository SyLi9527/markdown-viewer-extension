/**
 * Settings Type Definitions
 * 
 * Unified types for settings management across all platforms.
 */

/**
 * All available setting keys
 */
export type SettingKey = 
  | 'themeId'
  | 'tableMergeEmpty'
  | 'tableAlignment'
  | 'tableStyleOverride'
  | 'frontmatterDisplay'
  | 'preferredLocale'
  | 'docxHrDisplay'
  | 'docxEmojiStyle'
  | 'docxHeadingScalePct'
  | 'docxHeadingSpacingBeforePt'
  | 'docxHeadingSpacingAfterPt'
  | 'docxHeadingAlignment'
  | 'docxCodeFontSizePt'
  | 'docxTableBorderWidthPt'
  | 'docxTableCellPaddingPt';

export type TableAlignment = 'left' | 'center' | 'right' | 'justify';
export type TableStyleOverride = 'theme' | string;

/**
 * Setting value types mapped by key
 */
export interface SettingTypes {
  themeId: string;
  tableMergeEmpty: boolean;
  tableAlignment: TableAlignment;
  tableStyleOverride: TableStyleOverride;
  frontmatterDisplay: 'hide' | 'table' | 'raw';
  preferredLocale: string;
  docxHrDisplay: 'pageBreak' | 'line' | 'hide';
  docxEmojiStyle: 'native' | 'twemoji';
  docxHeadingScalePct: number | null;
  docxHeadingSpacingBeforePt: number | null;
  docxHeadingSpacingAfterPt: number | null;
  docxHeadingAlignment: TableAlignment | null;
  docxCodeFontSizePt: number | null;
  docxTableBorderWidthPt: number | null;
  docxTableCellPaddingPt: number | null;
}

/**
 * Default values for all settings
 */
export const DEFAULT_SETTINGS: SettingTypes = {
  themeId: 'default',
  tableMergeEmpty: true,
  tableAlignment: 'center',
  tableStyleOverride: 'theme',
  frontmatterDisplay: 'hide',
  preferredLocale: 'auto',
  docxHrDisplay: 'hide',
  docxEmojiStyle: 'twemoji',
  docxHeadingScalePct: null,
  docxHeadingSpacingBeforePt: null,
  docxHeadingSpacingAfterPt: null,
  docxHeadingAlignment: null,
  docxCodeFontSizePt: null,
  docxTableBorderWidthPt: null,
  docxTableCellPaddingPt: null,
};

/**
 * Options for setting a value
 */
export interface SetSettingOptions {
  /**
   * Whether to trigger a refresh/re-render after the setting is changed.
   * Default: false
   */
  refresh?: boolean;
}

/**
 * Unified settings service interface.
 * 
 * Business code should use this service to read/write settings.
 * Direct access to storage APIs is not allowed.
 */
export interface ISettingsService {
  /**
   * Get a setting value by key.
   * @param key - The setting key
   * @returns The setting value, or the default value if not set
   */
  get<K extends SettingKey>(key: K): Promise<SettingTypes[K]>;

  /**
   * Set a setting value.
   * @param key - The setting key
   * @param value - The new value
   * @param options - Options including whether to trigger refresh
   */
  set<K extends SettingKey>(
    key: K,
    value: SettingTypes[K],
    options?: SetSettingOptions
  ): Promise<void>;

  /**
   * Get all settings.
   * @returns All settings with their current values
   */
  getAll(): Promise<SettingTypes>;

  /**
   * Subscribe to setting changes.
   * @param listener - Callback when a setting changes
   * @returns Unsubscribe function
   */
  onChange?(listener: (key: SettingKey, value: unknown) => void): () => void;
}
