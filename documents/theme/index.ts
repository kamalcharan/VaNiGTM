// src/utils/theme.ts

// ✅ FIXED: Use correct theme names from config/theme/index.ts
import { BharathaVarshaTheme } from '@/config/theme/themes/bharathavarshaTheme';
import { ClassicElegantTheme } from '@/config/theme/themes/classicElegantTheme';
import { PurpleToneTheme } from '@/config/theme/themes/purpleToneTheme';

// ✅ CORRECTED: Import all new themes with correct names
import { ContractNestTheme } from '@/config/theme/themes/contractNest';
import { ModernBoldTheme } from '@/config/theme/themes/modernBold';
import { ModernBusinessTheme } from '@/config/theme/themes/modernBusiness';
import { ProfessionalRedefinedTheme } from '@/config/theme/themes/professionalRedefined';
import { SleekCoolTheme } from '@/config/theme/themes/sleekCool';
import { TechAITheme } from '@/config/theme/themes/techAI';
import { TechFutureTheme } from '@/config/theme/themes/techFuture';
import { TechySimpleTheme } from '@/config/theme/themes/techySimple';
import { VikunaBlackTheme } from '@/config/theme/themes/vikunaBlack';
import { ThemeName } from '@/contexts/ThemeContext';

/**
 * ✅ CORRECTED: Theme registry with actual theme names from config/theme/index.ts
 */
const THEME_REGISTRY = {
  // Original themes
  'BharathaVarshaTheme': BharathaVarshaTheme,
  'ClassicElegantTheme': ClassicElegantTheme,
  'PurpleToneTheme': PurpleToneTheme,
  // ✅ CORRECTED: New themes with proper names
  'ContractNestTheme': ContractNestTheme,
  'ModernBoldTheme': ModernBoldTheme,
  'ModernBusinessTheme': ModernBusinessTheme,
  'ProfessionalRedefinedTheme': ProfessionalRedefinedTheme,
  'SleekCoolTheme': SleekCoolTheme,
  'TechAITheme': TechAITheme,
  'TechFutureTheme': TechFutureTheme,
  'TechySimpleTheme': TechySimpleTheme,
  'VikunaBlackTheme': VikunaBlackTheme,
} as const;

/**
 * ✅ ENHANCED: Type-safe theme names
 */
export type AvailableThemes = keyof typeof THEME_REGISTRY;

/**
 * ✅ ENHANCED: Get all available theme names
 * @returns Array of all available theme names
 */
export function getAvailableThemes(): AvailableThemes[] {
  return Object.keys(THEME_REGISTRY) as AvailableThemes[];
}

/**
 * ✅ ENHANCED: Check if a theme exists
 * @param themeName The theme name to check
 * @returns Boolean indicating if the theme exists
 */
export function isValidTheme(themeName: string): themeName is AvailableThemes {
  return themeName in THEME_REGISTRY;
}

/**
 * ✅ ENHANCED: Get theme configuration safely
 * @param themeName The theme name
 * @returns Theme configuration or null if not found
 */
export function getThemeConfig(themeName: ThemeName) {
  if (!isValidTheme(themeName)) {
    console.warn(`Theme "${themeName}" not found, falling back to ClassicElegantTheme`);
    return THEME_REGISTRY.ClassicElegantTheme;
  }
  return THEME_REGISTRY[themeName];
}

/**
 * ✅ ENHANCED: Get colors for the current theme and mode with better error handling
 * @param themeName The current theme name
 * @param isDarkMode Whether dark mode is enabled
 * @returns Theme colors object
 */
export function getThemeColors(themeName: ThemeName, isDarkMode: boolean): any {
  const themeConfig = getThemeConfig(themeName);
  
  try {
    if (isDarkMode && themeConfig.darkMode?.colors) {
      return themeConfig.darkMode.colors;
    }
    return themeConfig.colors || themeConfig;
  } catch (error) {
    console.error(`Error getting colors for theme "${themeName}":`, error);
    // Fallback to ClassicElegantTheme
    const fallbackTheme = THEME_REGISTRY.ClassicElegantTheme;
    return isDarkMode ? fallbackTheme.darkMode?.colors || fallbackTheme.colors : fallbackTheme.colors;
  }
}

/**
 * ✅ ENHANCED: Create toast styles based on current theme with better fallbacks
 * @param themeName Current theme name
 * @param isDarkMode Whether dark mode is enabled
 * @returns Object with styled toast variants
 */
export function getToastStyles(themeName: ThemeName, isDarkMode: boolean) {
  const colors = getThemeColors(themeName, isDarkMode);
  
  // Common style attributes
  const baseStyle = {
    padding: '16px',
    borderRadius: '8px',
    fontSize: '16px',
    minWidth: '300px',
    fontWeight: '500',
    transition: 'all 0.2s ease-in-out'
  };
  
  // ✅ ENHANCED: Better fallback colors if semantic colors are missing
  const fallbackColors = {
    error: '#EF4444',
    success: '#10B981', 
    warning: '#F59E0B',
    info: '#3B82F6'
  };
  
  // Style variants for different toast types
  return {
    error: {
      ...baseStyle,
      background: colors.semantic?.error || fallbackColors.error,
      color: '#FFFFFF',
      border: `1px solid ${colors.semantic?.error || fallbackColors.error}20`
    },
    success: {
      ...baseStyle,
      background: colors.semantic?.success || fallbackColors.success,
      color: '#FFFFFF',
      border: `1px solid ${colors.semantic?.success || fallbackColors.success}20`
    },
    warning: {
      ...baseStyle,
      background: colors.semantic?.warning || fallbackColors.warning,
      color: isDarkMode ? '#000000' : '#000000',
      border: `1px solid ${colors.semantic?.warning || fallbackColors.warning}20`
    },
    info: {
      ...baseStyle,
      background: colors.semantic?.info || fallbackColors.info,
      color: '#FFFFFF',
      border: `1px solid ${colors.semantic?.info || fallbackColors.info}20`
    },
    loading: {
      ...baseStyle,
      background: isDarkMode 
        ? colors.utility?.secondaryBackground || '#1F2937'
        : colors.utility?.primaryBackground || '#FFFFFF',
      color: colors.utility?.primaryText || (isDarkMode ? '#FFFFFF' : '#000000'),
      border: `1px solid ${isDarkMode ? '#374151' : '#E5E7EB'}`
    }
  };
}

/**
 * ✅ ENHANCED: Get a specific semantic color from the current theme with fallbacks
 * @param themeName Current theme name
 * @param isDarkMode Whether dark mode is enabled
 * @param colorName Name of the semantic color to get
 * @returns The color value as hex string
 */
export function getSemanticColor(
  themeName: ThemeName, 
  isDarkMode: boolean, 
  colorName: 'success' | 'error' | 'warning' | 'info'
): string {
  const colors = getThemeColors(themeName, isDarkMode);
  
  // ✅ ENHANCED: Fallback colors if theme doesn't have semantic colors
  const fallbackColors = {
    success: '#10B981',
    error: '#EF4444', 
    warning: '#F59E0B',
    info: '#3B82F6'
  };
  
  return colors.semantic?.[colorName] || fallbackColors[colorName];
}

/**
 * ✅ ENHANCED: Get a specific brand color from the current theme with fallbacks
 * @param themeName Current theme name
 * @param isDarkMode Whether dark mode is enabled
 * @param colorName Name of the brand color to get
 * @returns The color value as hex string
 */
export function getBrandColor(
  themeName: ThemeName,
  isDarkMode: boolean,
  colorName: 'primary' | 'secondary' | 'tertiary' | 'alternate'
): string {
  const colors = getThemeColors(themeName, isDarkMode);
  
  // ✅ ENHANCED: Fallback colors based on ClassicElegantTheme
  const fallbackColors = {
    primary: '#2563EB',
    secondary: '#7C3AED',
    tertiary: '#059669',
    alternate: '#DC2626'
  };
  
  return colors.brand?.[colorName] || fallbackColors[colorName];
}

/**
 * ✅ ENHANCED: Get utility colors (backgrounds, text, borders) from current theme
 * @param themeName Current theme name
 * @param isDarkMode Whether dark mode is enabled
 * @param colorName Name of the utility color to get
 * @returns The color value as hex string
 */
export function getUtilityColor(
  themeName: ThemeName,
  isDarkMode: boolean,
  colorName: 'primaryBackground' | 'secondaryBackground' | 'primaryText' | 'secondaryText' | 'border' | 'accent'
): string {
  const colors = getThemeColors(themeName, isDarkMode);
  
  // ✅ NEW: Fallback utility colors
  const fallbackColors = isDarkMode ? {
    primaryBackground: '#111827',
    secondaryBackground: '#1F2937',
    primaryText: '#F9FAFB',
    secondaryText: '#D1D5DB',
    border: '#374151',
    accent: '#4B5563'
  } : {
    primaryBackground: '#FFFFFF',
    secondaryBackground: '#F9FAFB',
    primaryText: '#111827',
    secondaryText: '#6B7280',
    border: '#E5E7EB', 
    accent: '#F3F4F6'
  };
  
  return colors.utility?.[colorName] || fallbackColors[colorName];
}

/**
 * ✅ ENHANCED: Check if a color is light (to determine text color) with better validation
 * @param color Hex color string (e.g. #FFFFFF)
 * @returns Boolean indicating if the color is light
 */
export function isLightColor(color: string): boolean {
  if (!color || typeof color !== 'string') {
    return false;
  }
  
  // Remove the hash if it exists and handle short hex codes
  let hex = color.replace('#', '');
  
  // Convert 3-digit hex to 6-digit
  if (hex.length === 3) {
    hex = hex.split('').map(char => char + char).join('');
  }
  
  // Validate hex format
  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) {
    console.warn(`Invalid hex color format: ${color}`);
    return false;
  }
  
  // Convert to RGB
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // Calculate perceived brightness using the sRGB formula
  // https://www.w3.org/TR/AERT/#color-contrast
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  
  // Return true if the color is light (brightness > 125)
  return brightness > 125;
}

/**
 * ✅ ENHANCED: Get contrasting text color for a given background color
 * @param bgColor Background color hex string
 * @returns White or black color for optimal contrast
 */
export function getContrastColor(bgColor: string): string {
  return isLightColor(bgColor) ? '#000000' : '#FFFFFF';
}

/**
 * ✅ NEW: Generate CSS custom properties for a theme
 * @param themeName Theme name
 * @param isDarkMode Whether dark mode is enabled
 * @returns CSS custom properties object
 */
export function generateThemeCSSProperties(themeName: ThemeName, isDarkMode: boolean): Record<string, string> {
  const colors = getThemeColors(themeName, isDarkMode);
  const properties: Record<string, string> = {};
  
  // Brand colors
  if (colors.brand) {
    Object.entries(colors.brand).forEach(([key, value]) => {
      properties[`--brand-${key}`] = value as string;
    });
  }
  
  // Semantic colors
  if (colors.semantic) {
    Object.entries(colors.semantic).forEach(([key, value]) => {
      properties[`--semantic-${key}`] = value as string;
    });
  }
  
  // Utility colors
  if (colors.utility) {
    Object.entries(colors.utility).forEach(([key, value]) => {
      properties[`--utility-${key}`] = value as string;
    });
  }
  
  return properties;
}

/**
 * ✅ NEW: Apply theme CSS properties to document
 * @param themeName Theme name
 * @param isDarkMode Whether dark mode is enabled
 */
export function applyThemeToDom(themeName: ThemeName, isDarkMode: boolean): void {
  const properties = generateThemeCSSProperties(themeName, isDarkMode);
  const root = document.documentElement;
  
  // Apply each CSS custom property
  Object.entries(properties).forEach(([property, value]) => {
    root.style.setProperty(property, value);
  });
  
  // Add theme class to body for additional styling
  document.body.className = document.body.className
    .replace(/theme-\w+/g, '') // Remove existing theme classes
    .replace(/\s+/g, ' ') // Clean up spaces
    .trim();
  
  document.body.classList.add(`theme-${themeName.toLowerCase()}`);
  
  if (isDarkMode) {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
}

/**
 * ✅ NEW: Get theme metadata (name, description, category)
 * @param themeName Theme name
 * @returns Theme metadata object
 */
export function getThemeMetadata(themeName: ThemeName) {
  const themeConfig = getThemeConfig(themeName);
  
  return {
    name: themeName,
    displayName: themeConfig.displayName || themeName,
    description: themeConfig.description || 'A beautiful theme for your application',
    category: themeConfig.category || 'general',
    author: themeConfig.author || 'ContractNest',
    version: themeConfig.version || '1.0.0',
    tags: themeConfig.tags || [],
    preview: themeConfig.preview || null,
    supportsDarkMode: !!(themeConfig.darkMode),
  };
}

/**
 * ✅ NEW: Get all themes with their metadata
 * @returns Array of theme metadata objects
 */
export function getAllThemesMetadata() {
  return getAvailableThemes().map(themeName => getThemeMetadata(themeName));
}

/**
 * ✅ NEW: Calculate color contrast ratio between two colors
 * @param color1 First color (hex)
 * @param color2 Second color (hex)
 * @returns Contrast ratio (1-21)
 */
export function getContrastRatio(color1: string, color2: string): number {
  const getLuminance = (color: string): number => {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;
    
    const sRGB = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    
    return 0.2126 * sRGB(r) + 0.7152 * sRGB(g) + 0.0722 * sRGB(b);
  };
  
  const lum1 = getLuminance(color1);
  const lum2 = getLuminance(color2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  
  return (brightest + 0.05) / (darkest + 0.05);
}

/**
 * ✅ NEW: Check if color combination meets accessibility standards
 * @param backgroundColor Background color (hex)
 * @param textColor Text color (hex)
 * @param level AA or AAA compliance level
 * @returns Boolean indicating if combination meets standards
 */
export function meetsAccessibilityStandards(
  backgroundColor: string, 
  textColor: string, 
  level: 'AA' | 'AAA' = 'AA'
): boolean {
  const ratio = getContrastRatio(backgroundColor, textColor);
  return level === 'AA' ? ratio >= 4.5 : ratio >= 7;
}

/**
 * ✅ NEW: Darken a color by a percentage
 * @param color Hex color string
 * @param percent Percentage to darken (0-100)
 * @returns Darkened hex color
 */
export function darkenColor(color: string, percent: number): string {
  const hex = color.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  const factor = (100 - percent) / 100;
  
  const newR = Math.round(r * factor);
  const newG = Math.round(g * factor);
  const newB = Math.round(b * factor);
  
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

/**
 * ✅ NEW: Lighten a color by a percentage
 * @param color Hex color string
 * @param percent Percentage to lighten (0-100)
 * @returns Lightened hex color
 */
export function lightenColor(color: string, percent: number): string {
  const hex = color.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  const factor = percent / 100;
  
  const newR = Math.round(r + (255 - r) * factor);
  const newG = Math.round(g + (255 - g) * factor);
  const newB = Math.round(b + (255 - b) * factor);
  
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

/**
 * ✅ NEW: Convert hex color to RGB
 * @param hex Hex color string
 * @returns RGB object {r, g, b}
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

/**
 * ✅ NEW: Convert RGB to hex color
 * @param r Red (0-255)
 * @param g Green (0-255)
 * @param b Blue (0-255)
 * @returns Hex color string
 */
export function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

// ✅ Export everything for easy access
export default {
  getThemeColors,
  getToastStyles,
  getSemanticColor,
  getBrandColor,
  getUtilityColor,
  isLightColor,
  getContrastColor,
  getAvailableThemes,
  isValidTheme,
  getThemeConfig,
  getThemeMetadata,
  getAllThemesMetadata,
  generateThemeCSSProperties,
  applyThemeToDom,
  getContrastRatio,
  meetsAccessibilityStandards,
  darkenColor,
  lightenColor,
  hexToRgb,
  rgbToHex
};
export { themes };
export { defaultTheme };
export type { ThemeConfig };