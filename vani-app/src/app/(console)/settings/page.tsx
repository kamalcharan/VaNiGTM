import { redirect } from 'next/navigation';
import { SETTINGS_HOME } from '@/skills/settings/tabs';

/** /settings has no content of its own — it is its first tab. */
export default function SettingsIndex() {
  redirect(SETTINGS_HOME);
}
