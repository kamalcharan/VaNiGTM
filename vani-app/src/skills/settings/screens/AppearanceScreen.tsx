'use client';

/**
 * Appearance — four themes, light and dark, stored against the person.
 *
 * Each card previews the theme in ITS OWN colours, resolved through the same
 * `resolveTokens` the console runs on. A picker that shows three cards in the
 * current theme's palette tells you nothing about what you are choosing, and a
 * hand-painted swatch drifts from the theme the first time a value changes.
 *
 * The preview follows the mode you are on, so switching to light and looking
 * again shows the light variants — which is the comparison people actually
 * want to make.
 */

import { useTheme } from '@/context/theme-provider';
import { resolveTokens } from '@/config/theme/tokens';
import u from '@/platform/shell/ui.module.css';
import s from './appearance.module.css';
import type { ColorMode, ThemeConfig } from '@/config/theme/types';

function Swatch({ theme, mode }: { theme: ThemeConfig; mode: ColorMode }) {
  const t = resolveTokens(theme, mode);
  return (
    <div className={s.swatch} style={{ background: t['--bg'] }}>
      <div className={s.swatchMain} style={{ background: t['--surf'], borderRight: `1px solid ${t['--line']}` }}>
        <span className={s.dot} style={{ background: t['--color-primary'] }} />
        <span className={s.bar} style={{ background: t['--tx'], opacity: 0.85 }} />
        <span className={s.bar} style={{ background: t['--tx2'], opacity: 0.6, flex: 0.6 }} />
      </div>
      <div style={{ width: 34, background: t['--color-primary'] }} />
    </div>
  );
}

export default function AppearanceScreen() {
  const { themeId, mode, themes, setThemeId, setMode, saving } = useTheme();

  return (
    <div className={s.wrap}>
      <div className={s.section}>
        <div className={s.sectionH}>Mode</div>
        <div className={s.modes} role="group" aria-label="Colour mode">
          {(['dark', 'light'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={mode === m ? s.modeOn : s.mode}
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
            >
              {m === 'dark' ? 'Dark' : 'Light'}
            </button>
          ))}
        </div>
      </div>

      <div className={s.section}>
        <div className={s.sectionH}>Theme</div>
        <div className={s.grid}>
          {themes.map((t) => (
            <button
              key={t.id}
              type="button"
              className={themeId === t.id ? `${s.card} ${s.cardOn}` : s.card}
              aria-pressed={themeId === t.id}
              onClick={() => setThemeId(t.id)}
            >
              <Swatch theme={t} mode={mode} />
              <div className={s.cardBody}>
                <div className={s.cardName}>{t.name}</div>
                {t.blurb && <div className={s.cardBlurb}>{t.blurb}</div>}
                {themeId === t.id && <div className={s.cardCurrent}>In use</div>}
              </div>
            </button>
          ))}
        </div>
        <p className={s.note}>
          Saved to your account, not this browser — sign in anywhere and it follows you.
          {saving && <span className={s.saving}> · saving…</span>}
        </p>
      </div>
    </div>
  );
}

export function AppearancePage() {
  return (
    <div>
      <div className={u.eyebrow}>// SYSTEM</div>
      <h1 className={u.h1}>Appearance</h1>
      <p className={u.lede}>
        Four themes, each with a light and a dark variant. The choice is stored
        against your account, so it follows you to another machine rather than
        living in this browser.
      </p>
      <AppearanceScreen />
    </div>
  );
}
