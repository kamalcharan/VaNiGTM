'use client';

import { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery, useSkillMutation } from '@/hooks/useSkill';
import { useToast } from '@/components/toast';
import {
  VdfLoader, VdfEmptyState, VdfButton, VdfStatusBadge,
  VdfDrawer, VdfPageHeader, VdfTabs,
} from '@/components/vdf';
import { ChannelsTab } from './tabs/ChannelsTab';
import { SequencesTab } from './tabs/SequencesTab';
import { ContactsTab } from './tabs/ContactsTab';
import s from './campaign-detail.module.css';
import f from '@/styles/forms.module.css';

/* ── Types ───────────────────────────────────────────── */

interface CampaignDetail {
  id: number;
  campaign_no: string;
  name: string;
  description: string | null;
  product_name: string | null;
  product_url: string | null;
  target_industries: string[];
  sender_name: string | null;
  sender_email: string | null;
  status: string;
  launched_at: string | null;
  completed_at: string | null;
  created_at: string;
  persona_count: number;
}

interface Persona {
  id: number;
  title: string;
  emoji: string;
  description: string | null;
  tags: string[];
  company_size_min: number | null;
  company_size_max: number | null;
  seniority_level: string | null;
  sort_order: number;
  signal_count: number;
}

const STATUS_BADGE_MAP: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'muted' }> = {
  draft:     { label: 'Draft',     variant: 'muted' },
  active:    { label: 'Active',    variant: 'success' },
  paused:    { label: 'Paused',    variant: 'warning' },
  completed: { label: 'Completed', variant: 'info' },
  archived:  { label: 'Archived',  variant: 'muted' },
};

const SENIORITY_LABELS: Record<string, string> = {
  'c-suite':                'C-Suite',
  'vp':                     'VP',
  'director':               'Director',
  'manager':                'Manager',
  'individual-contributor': 'IC',
};

const SENIORITY_OPTIONS = [
  { value: 'c-suite',                label: 'C-Suite' },
  { value: 'vp',                     label: 'VP' },
  { value: 'director',               label: 'Director' },
  { value: 'manager',                label: 'Manager' },
  { value: 'individual-contributor', label: 'Individual Contributor' },
];

/* ── Component ───────────────────────────────────────── */

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const campaignId = Number(params.id);

  const [activeTab, setActiveTab] = useState('icp');

  // Persona drawer
  const [personaDrawerOpen, setPersonaDrawerOpen] = useState(false);
  const [editPersonaId, setEditPersonaId]         = useState<number | null>(null);
  const [pTitle, setPTitle]         = useState('');
  const [pEmoji, setPEmoji]         = useState('');
  const [pDesc, setPDesc]           = useState('');
  const [pTags, setPTags]           = useState<string[]>([]);
  const [pTagInput, setPTagInput]   = useState('');
  const [pSizeMin, setPSizeMin]     = useState('');
  const [pSizeMax, setPSizeMax]     = useState('');
  const [pSeniority, setPSeniority] = useState('');

  /* ── Queries ─────────────────────────────────────────── */

  const { data: campaignData, isLoading: loadingCampaign } = useSkillQuery<{ campaign: CampaignDetail }>(
    'campaign-skill', 'get_campaign', { campaign_id: campaignId }
  );

  const { data: personaData, isLoading: loadingPersonas } = useSkillQuery<{ personas: Persona[] }>(
    'icp-skill', 'get_personas', { campaign_id: campaignId }
  );

  const { mutate: createPersona, isPending: creatingPersona } = useSkillMutation(
    'icp-skill', 'create_persona',
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['skill', 'icp-skill', 'get_personas'] });
        queryClient.invalidateQueries({ queryKey: ['skill', 'campaign-skill', 'get_campaign'] });
        showToast({ message: 'Persona created.', type: 'success' });
        closePersonaDrawer();
      },
      onError: (err) => showToast({ message: err.message || 'Failed to create persona', type: 'error' }),
    }
  );

  const { mutate: updatePersona, isPending: updatingPersona } = useSkillMutation(
    'icp-skill', 'update_persona',
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['skill', 'icp-skill', 'get_personas'] });
        showToast({ message: 'Persona updated.', type: 'success' });
        closePersonaDrawer();
      },
      onError: (err) => showToast({ message: err.message || 'Failed to update persona', type: 'error' }),
    }
  );

  const { mutate: deletePersona } = useSkillMutation(
    'icp-skill', 'delete_persona',
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['skill', 'icp-skill', 'get_personas'] });
        queryClient.invalidateQueries({ queryKey: ['skill', 'campaign-skill', 'get_campaign'] });
        showToast({ message: 'Persona removed.', type: 'success' });
      },
      onError: (err) => showToast({ message: err.message || 'Failed to delete persona', type: 'error' }),
    }
  );

  const { mutate: updateStatus } = useSkillMutation(
    'campaign-skill', 'update_status',
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['skill', 'campaign-skill'] });
        showToast({ message: 'Status updated.', type: 'success' });
      },
      onError: (err) => showToast({ message: err.message || 'Failed to update status', type: 'error' }),
    }
  );

  /* ── Persona drawer ──────────────────────────────────── */

  function openCreatePersona() {
    setEditPersonaId(null);
    setPTitle(''); setPEmoji(''); setPDesc(''); setPTags([]); setPTagInput('');
    setPSizeMin(''); setPSizeMax(''); setPSeniority('');
    setPersonaDrawerOpen(true);
  }

  function openEditPersona(p: Persona) {
    setEditPersonaId(p.id);
    setPTitle(p.title);
    setPEmoji(p.emoji || '');
    setPDesc(p.description || '');
    setPTags(p.tags || []);
    setPTagInput('');
    setPSizeMin(p.company_size_min != null ? String(p.company_size_min) : '');
    setPSizeMax(p.company_size_max != null ? String(p.company_size_max) : '');
    setPSeniority(p.seniority_level || '');
    setPersonaDrawerOpen(true);
  }

  function closePersonaDrawer() {
    setPersonaDrawerOpen(false);
    setEditPersonaId(null);
  }

  function handlePersonaSave() {
    if (!pTitle.trim()) { showToast({ message: 'Persona title is required', type: 'error' }); return; }

    const payload = {
      title:            pTitle.trim(),
      emoji:            pEmoji.trim() || undefined,
      description:      pDesc.trim() || undefined,
      tags:             pTags.length ? pTags : undefined,
      company_size_min: pSizeMin ? Number(pSizeMin) : undefined,
      company_size_max: pSizeMax ? Number(pSizeMax) : undefined,
      seniority_level:  pSeniority || undefined,
    };

    if (editPersonaId) {
      updatePersona({ persona_id: editPersonaId, ...payload });
    } else {
      createPersona({ campaign_id: campaignId, ...payload });
    }
  }

  const handleTagKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && pTagInput.trim()) {
      e.preventDefault();
      const tag = pTagInput.trim().replace(/,$/,'');
      if (tag && !pTags.includes(tag)) {
        setPTags(prev => [...prev, tag]);
      }
      setPTagInput('');
    }
    if (e.key === 'Backspace' && !pTagInput && pTags.length > 0) {
      setPTags(prev => prev.slice(0, -1));
    }
  }, [pTagInput, pTags]);

  function removeTag(tag: string) {
    setPTags(prev => prev.filter(t => t !== tag));
  }

  /* ── Data ────────────────────────────────────────────── */

  const campaign = campaignData?.data?.campaign;
  const personas = personaData?.data?.personas ?? [];

  if (loadingCampaign) return <VdfLoader overlay message="Loading campaign…" />;
  if (!campaign) return (
    <div className={s.page}>
      <p style={{ color: 'var(--color-danger)', padding: '16px' }}>Campaign not found</p>
    </div>
  );

  const badge = STATUS_BADGE_MAP[campaign.status] ?? STATUS_BADGE_MAP.draft;

  const TABS = [
    { id: 'icp',       label: `ICP (${personas.length})` },
    { id: 'channels',  label: 'Channels' },
    { id: 'sequences', label: 'Sequences' },
    { id: 'contacts',  label: 'Contacts' },
  ];

  return (
    <div className={s.page}>
      <VdfPageHeader
        eyebrow={campaign.campaign_no}
        title={campaign.name}
        meta={<VdfStatusBadge label={badge.label} variant={badge.variant} />}
        actions={
          <div className={s.headerActions}>
            <VdfButton variant="ghost" size="sm" onClick={() => router.push('/campaigns')}>
              Back
            </VdfButton>
            {campaign.status === 'draft' && (
              <VdfButton variant="primary" size="sm" onClick={() => updateStatus({ campaign_id: campaignId, status: 'active' })}>
                Launch
              </VdfButton>
            )}
            {campaign.status === 'active' && (
              <>
                <VdfButton variant="ghost" size="sm" onClick={() => updateStatus({ campaign_id: campaignId, status: 'paused' })}>
                  Pause
                </VdfButton>
                <VdfButton variant="primary" size="sm" onClick={() => updateStatus({ campaign_id: campaignId, status: 'completed' })}>
                  Complete
                </VdfButton>
              </>
            )}
            {campaign.status === 'paused' && (
              <VdfButton variant="primary" size="sm" onClick={() => updateStatus({ campaign_id: campaignId, status: 'active' })}>
                Resume
              </VdfButton>
            )}
          </div>
        }
      />

      {/* ── Campaign info card ─────────────────────────── */}
      <div className={s.headerCard}>
        {campaign.description && (
          <div className={s.headerDesc}>{campaign.description}</div>
        )}
        <div className={s.headerMeta}>
          {campaign.product_name && (
            <div className={s.metaItem}>
              <span className={s.metaLabel}>Product</span>
              <span className={s.metaValue}>{campaign.product_name}</span>
            </div>
          )}
          {campaign.sender_name && (
            <div className={s.metaItem}>
              <span className={s.metaLabel}>Sender</span>
              <span className={s.metaValue}>{campaign.sender_name}</span>
            </div>
          )}
          {campaign.sender_email && (
            <div className={s.metaItem}>
              <span className={s.metaLabel}>Email</span>
              <span className={s.metaValue}>{campaign.sender_email}</span>
            </div>
          )}
          <div className={s.metaItem}>
            <span className={s.metaLabel}>Created</span>
            <span className={s.metaValue}>
              {new Date(campaign.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          </div>
          {campaign.launched_at && (
            <div className={s.metaItem}>
              <span className={s.metaLabel}>Launched</span>
              <span className={s.metaValue}>
                {new Date(campaign.launched_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────── */}
      <div style={{ padding: '16px 48px 0' }}>
        <VdfTabs tabs={TABS} activeId={activeTab} onChange={setActiveTab} />
      </div>

      {/* ── Tab content ────────────────────────────────── */}
      <div className={s.tabContent}>
        {activeTab === 'icp' && (
          <>
            {loadingPersonas ? (
              <VdfLoader message="Loading personas…" />
            ) : (
              <div className={s.personaGrid}>
                {personas.map((p) => (
                  <div key={p.id} className={s.personaCard}>
                    <div className={s.personaActions}>
                      <VdfButton variant="ghost" size="sm" onClick={() => openEditPersona(p)}>
                        Edit
                      </VdfButton>
                      <VdfButton variant="ghost" size="sm" onClick={() => deletePersona({ persona_id: p.id })}>
                        Remove
                      </VdfButton>
                    </div>

                    <span className={s.personaEmoji}>{p.emoji || '👤'}</span>
                    <div className={s.personaTitle}>{p.title}</div>
                    {p.description && <div className={s.personaDesc}>{p.description}</div>}

                    {p.tags.length > 0 && (
                      <div className={s.personaTags}>
                        {p.tags.map((tag) => (
                          <span key={tag} className={s.personaTag}>{tag}</span>
                        ))}
                      </div>
                    )}

                    <div className={s.personaMeta}>
                      {p.seniority_level && (
                        <span className={s.seniorityChip}>
                          {SENIORITY_LABELS[p.seniority_level] ?? p.seniority_level}
                        </span>
                      )}
                      {(p.company_size_min != null || p.company_size_max != null) && (
                        <span className={s.personaMetaChip}>
                          {p.company_size_min ?? '1'}–{p.company_size_max ?? '10000+'} employees
                        </span>
                      )}
                      {p.signal_count > 0 && (
                        <span className={s.personaMetaChip}>
                          {p.signal_count} signal{p.signal_count !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {/* ── Add persona card ──────────────────── */}
                <div className={s.addPersonaCard} onClick={openCreatePersona}>
                  <span className={s.addIcon}>+</span>
                  <span className={s.addLabel}>Add Persona</span>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'channels' && <ChannelsTab />}
        {activeTab === 'sequences' && <SequencesTab campaignId={campaignId} />}
        {activeTab === 'contacts' && <ContactsTab campaignId={campaignId} />}
      </div>

      {/* ── Create/Edit Persona Drawer ───────────────────── */}
      <VdfDrawer
        isOpen={personaDrawerOpen}
        onClose={closePersonaDrawer}
        title={editPersonaId ? 'Edit Persona' : 'Add Persona'}
        subtitle="Define your ideal buyer profile"
        width={480}
        footer={
          <>
            <VdfButton variant="ghost" size="sm" onClick={closePersonaDrawer} disabled={creatingPersona || updatingPersona}>
              Cancel
            </VdfButton>
            <VdfButton variant="primary" size="sm" onClick={handlePersonaSave} disabled={creatingPersona || updatingPersona}>
              {(creatingPersona || updatingPersona) ? 'Saving…' : editPersonaId ? 'Update' : 'Add Persona'}
            </VdfButton>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className={s.fieldRow}>
            <div className={s.fieldGroup} style={{ flex: '0 0 72px' }}>
              <label className={f.label}>Emoji</label>
              <input className={f.input} value={pEmoji} onChange={e => setPEmoji(e.target.value)} placeholder="👤" maxLength={4} style={{ textAlign: 'center' }} />
            </div>
            <div className={s.fieldGroup}>
              <label className={f.label}>Title *</label>
              <input className={f.input} value={pTitle} onChange={e => setPTitle(e.target.value)} placeholder="e.g. VP of Sales" />
            </div>
          </div>

          <div className={s.fieldGroup}>
            <label className={f.label}>Description</label>
            <textarea className={f.input} rows={2} value={pDesc} onChange={e => setPDesc(e.target.value)} placeholder="Brief description of this persona…" style={{ resize: 'vertical' }} />
          </div>

          <div className={s.fieldGroup}>
            <label className={f.label}>Tags</label>
            <div className={s.tagInput}>
              {pTags.map((tag) => (
                <span key={tag} className={s.tagChip}>
                  {tag}
                  <button type="button" className={s.tagChipRemove} onClick={() => removeTag(tag)}>x</button>
                </span>
              ))}
              <input
                className={s.tagInputField}
                value={pTagInput}
                onChange={e => setPTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder={pTags.length === 0 ? 'Budget holder, Decision maker…' : ''}
              />
            </div>
          </div>

          <div className={s.fieldGroup}>
            <label className={f.label}>Seniority Level</label>
            <select className={f.select} value={pSeniority} onChange={e => setPSeniority(e.target.value)}>
              <option value="">Any</option>
              {SENIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className={s.fieldRow}>
            <div className={s.fieldGroup}>
              <label className={f.label}>Company Size Min</label>
              <input className={f.input} type="number" value={pSizeMin} onChange={e => setPSizeMin(e.target.value)} placeholder="e.g. 50" />
            </div>
            <div className={s.fieldGroup}>
              <label className={f.label}>Company Size Max</label>
              <input className={f.input} type="number" value={pSizeMax} onChange={e => setPSizeMax(e.target.value)} placeholder="e.g. 500" />
            </div>
          </div>
        </div>
      </VdfDrawer>
    </div>
  );
}
