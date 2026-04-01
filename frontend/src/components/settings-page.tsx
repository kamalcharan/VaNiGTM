'use client';

import { useState } from 'react';
import s from './settings-page.module.css';
import ProfileTab from './settings/profile-tab';
import BusinessTab from './settings/business-tab';
import SecurityTab from './settings/security-tab';
import AppearanceTab from './settings/appearance-tab';
import PreferencesTab from './settings/preferences-tab';
import TeamTab from './settings/team-tab';
import SessionsTab from './settings/sessions-tab';

const TABS = [
  { id: 'profile', label: 'Profile', icon: '\uD83D\uDC64' },
  { id: 'business', label: 'Business', icon: '\uD83C\uDFE2' },
  { id: 'security', label: 'Security', icon: '\uD83D\uDD12' },
  { id: 'appearance', label: 'Appearance', icon: '\uD83C\uDFA8' },
  { id: 'preferences', label: 'Preferences', icon: '\u2699\uFE0F' },
  { id: 'team', label: 'Team', icon: '\uD83D\uDC65' },
  { id: 'sessions', label: 'Sessions', icon: '\uD83D\uDCF1' },
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
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`${s.navItem} ${activeTab === tab.id ? s.navItemActive : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className={s.navIcon}>{tab.icon}</span>
              {tab.label}
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
