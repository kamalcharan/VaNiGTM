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

## Form Components — Notes

### CSS Variable Alignment

The form components (FormInput, CountryDropdown, PasswordStrength) use the Atlas design system variables from the HTML prototypes (`--bg-primary`, `--brand-primary`, `--signal-danger`, etc.). If the VDF theme system provides these under different names, the CSS module fallbacks will keep them functional but the variable references should be updated to match the active theme.

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
