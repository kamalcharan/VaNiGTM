import type { ReactNode } from 'react';
import { SettingsFrame } from '@/skills/settings/screens/SettingsFrame';

/** /settings/* — every tab renders inside the one Settings frame. */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <SettingsFrame>{children}</SettingsFrame>;
}
