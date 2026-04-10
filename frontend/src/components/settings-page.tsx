'use client';

import { useState } from 'react';
import {
  User, Building2, Lock, Palette, Settings, Users, Monitor,
} from 'lucide-react';
import s from './settings-page.module.css';
import ProfileTab from './settings/profile-tab';
import BusinessTab from './settings/business-tab';
import SecurityTab from './settings/security-tab';
import AppearanceTab from './settings/appearance-tab';
import PreferencesTab from './settings/preferences-tab';
import TeamTab from './settings/team-tab';
import SessionsTab from './settings/sessions-tab';

const TABS = [
  { id: 'profile',     label: 'Profile',          Icon: User },
  { id: 'business',    label: 'Business Profile',  Icon: Building2 },
  { id: 'security',    label: 'Security',          Icon: Lock },
  { id: 'appearance',  label: 'Appearance',        Icon: Palette },
  { id: 'preferences', label: 'Preferences',       Icon: Settings },
  { id: 'team',        label: 'Team',              Icon: Users },
  { id: 'sessions',    label: 'Sessions',          Icon: Monitor },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('profile');

  return (
    <div className={s.page}>
      <div className={s.header}>
        <h1 className={s.title}>Settings</h1>
        <p className={s.subtitle}>Manage your profile, business, security, and preferences</p>
      </div>

      <div className={s.layout}>
        {/* Tab Navigation */}
        <nav className={s.nav}>
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`${s.navItem} ${activeTab === id ? s.navItemActive : ''}`}
              onClick={() => setActiveTab(id)}
            >
              <Icon size={16} strokeWidth={1.75} className={s.navIcon} />
              {label}
            </button>
          ))}
        </nav>

        {/* Tab Content */}
        <div className={s.content}>
          {activeTab === 'profile' && <ProfileTab />}
          {activeTab === 'business' && <BusinessTab />}
          {activeTab === 'security' && <SecurityTab />}
          {activeTab === 'appearance' && <AppearanceTab />}
          {activeTab === 'preferences' && <PreferencesTab />}
          {activeTab === 'team' && <TeamTab />}
          {activeTab === 'sessions' && <SessionsTab />}
        </div>
      </div>
    </div>
  );
}
