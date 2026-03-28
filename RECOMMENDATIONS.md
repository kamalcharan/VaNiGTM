# RECOMMENDATIONS.md

## Toast & Loader Components — Wiring Notes

### Wiring ToastProvider into the App

The `ToastProvider` needs to wrap the app at the root layout level. Since the root layout lives in `vani-base/shell/`, there are two approaches:

**Option A: ShellConfig `providers` array (preferred)**
If `ShellConfig` supports a `providers` or `wrappers` field, add `ToastProvider` there:

```ts
// shell.config.ts
import { ToastProvider } from './components/toast';

const shellConfig: ShellConfig = {
  // ...existing config
  providers: [ToastProvider],
};
```

**Option B: Add to VaNiBase root layout directly**
If ShellConfig doesn't support provider injection, the VaNiBase root layout (`vani-base/shell/src/app/layout.tsx` or equivalent) needs to be updated to accept product-level providers. This would require a VaNiBase change:

```tsx
// In the shell's root layout, wrap children:
<ToastProvider>
  {children}
</ToastProvider>
```

**Recommendation:** Add a `providers` config option to `ShellConfig` in VaNiBase so products can inject providers without modifying the framework. This keeps the submodule boundary clean.

### CSS Variable Mapping

The toast and loader components use these CSS variables with fallback values:

| Variable | Fallback | Used by |
|----------|----------|---------|
| `--color-background-success` | `rgba(45, 212, 160, 0.15)` | Toast success |
| `--color-text-success` | `#2dd4a0` | Toast success |
| `--color-background-danger` | `rgba(240, 94, 94, 0.15)` | Toast error |
| `--color-text-danger` | `#f05e5e` | Toast error |
| `--color-background-warning` | `rgba(245, 189, 65, 0.15)` | Toast warning |
| `--color-text-warning` | `#f5bd41` | Toast warning |
| `--color-background-info` | `rgba(94, 170, 240, 0.15)` | Toast info, Loader |
| `--color-text-info` | `#5eaaf0` | Toast info, Loader spinner |
| `--color-text-secondary` | `#8a8578` | Loader message text |
| `--font-body` | `'DM Sans', sans-serif` | Both |

If the VDF theme system uses different variable names, update the CSS modules accordingly. The fallback values match the Atlas design system colors used in login-vault and landing-page.

## Theme Compliance (Updated)

All product components now use ONLY the VDF theme system CSS variables:
- `--color-bg`, `--color-fg`, `--color-surface`, `--color-surface-hover`, `--color-border`, `--color-muted`
- `--color-primary`, `--color-primary-fg`, `--color-primary-hover`
- `--color-success`, `--color-warning`, `--color-danger`, `--color-info`

Semi-transparent overlays use `color-mix(in srgb, var(--color-*) %, transparent)` instead of hardcoded rgba values. This ensures all components adapt correctly when switching themes.

**Note:** `color-mix()` requires modern browsers (Chrome 111+, Firefox 113+, Safari 16.2+). For older browser support, consider a PostCSS plugin.

## Registration Page — VaNiBase Changes Needed

1. **ShellConfig `pages.register` type:** Currently `ShellConfig.pages` only defines `login?: ComponentType`. Add `register?: ComponentType` so products can override the registration page. The register page is wired via `pages.register` with a type assertion (`as ShellConfig['pages']`) as a stopgap.

2. **VaNiBase register route:** The shell needs an `app/(auth)/register/page.tsx` that checks for `pages?.register` override (same pattern as the login page). Without this, the register page won't be reachable via Next.js routing.

3. **Login-vault.tsx hardcoded colors:** The existing login-vault.tsx and login-vault.module.css use hardcoded Atlas palette colors (--void, --gold, etc.) rather than theme variables. This is intentional for the standalone Atlas design but means it won't adapt to theme switching. Consider migrating to `--color-*` variables if theme compliance is required for auth pages.

## Form Components — Notes

### CountryDropdown — Country List

The dropdown ships with 25 countries. To add more:
1. Add entries to the `COUNTRIES` array in `country-dropdown.tsx`
2. Use ISO 3166-1 alpha-2 codes (lowercase) — flagcdn.com hosts flags for all codes
3. The component handles broken flag images gracefully (shows country code text fallback)

### CountryDropdown — Standalone Usage

The CountryDropdown is designed to sit beside a phone input in a flex row, matching the `atlas-register.html` `.phone-row` pattern:
```tsx
<div style={{ display: 'flex', gap: '8px' }}>
  <CountryDropdown value={country} onChange={setCountry} />
  <FormInput label="Phone" type="tel" placeholder="+91 98765 43210" ... />
</div>
```

### FormInput — Password Toggle Pattern

For password fields with show/hide toggle, use the `rightElement` prop:
```tsx
const [show, setShow] = useState(false);
<FormInput
  label="Password"
  type={show ? 'text' : 'password'}
  rightElement={
    <button type="button" onClick={() => setShow(!show)} style={{ background: 'none', border: 'none', color: 'var(--text-ghost)', cursor: 'pointer' }}>
      {show ? '🙈' : '👁'}
    </button>
  }
  ...
/>
```
