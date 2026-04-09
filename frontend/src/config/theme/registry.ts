import { ThemeConfig } from './types';
import { BharathaVarshaTheme } from './themes/bharathavarshaTheme';
import { ClassicElegantTheme } from './themes/classicElegantTheme';
import { ContractNestTheme } from './themes/contractNest';
import { HeritageTheme } from './themes/heritage';
import { JadeThornTheme } from './themes/jadeThorn';
import { ModernBoldTheme } from './themes/modernBold';
import { ModernBusinessTheme } from './themes/modernBusiness';
import { ProfessionalRedefinedTheme } from './themes/professionalRedefined';
import { PurpleToneTheme } from './themes/purpleToneTheme';
import { SleekCoolTheme } from './themes/sleekCool';
import { TechAITheme } from './themes/techAI';
import { TechFutureTheme } from './themes/techFuture';
import { TechySimpleTheme } from './themes/techySimple';
import { VikunaBlackTheme } from './themes/vikunaBlack';

export const themes: ThemeConfig[] = [
  JadeThornTheme,             // Default — listed first
  HeritageTheme,
  VikunaBlackTheme,
  ClassicElegantTheme,
  PurpleToneTheme,
  BharathaVarshaTheme,
  ContractNestTheme,
  ModernBoldTheme,
  ModernBusinessTheme,
  ProfessionalRedefinedTheme,
  SleekCoolTheme,
  TechAITheme,
  TechFutureTheme,
  TechySimpleTheme,
];

export const defaultTheme = JadeThornTheme;

export function getTheme(id: string): ThemeConfig {
  return themes.find(t => t.id === id) || defaultTheme;
}

export function getAllThemes(): { id: string; name: string }[] {
  return themes.map(t => ({ id: t.id, name: t.name }));
}

export type { ThemeConfig } from './types';
