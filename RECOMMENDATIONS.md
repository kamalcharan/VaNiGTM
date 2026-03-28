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
