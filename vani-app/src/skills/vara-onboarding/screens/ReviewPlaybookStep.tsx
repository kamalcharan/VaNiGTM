'use client';

/**
 * Onboarding step 2 — the recommended playbook, one page.
 *
 * UX-only. Real version pulls the playbook from the tiered resolver
 * (registry match → industry proximity → LLM last, per design doc §2).
 * Tuning writes to vara_family_profile + vara_scoring_config v1.
 */

import { useState } from 'react';
import { MOCK_PLAYBOOKS } from '../mock-data';
import s from '../vara-onboarding.module.css';

export function ReviewPlaybookStep({
  family,
  onBack,
  onApprove,
}: {
  family: string;
  onBack: () => void;
  onApprove: () => void;
}) {
  const p = MOCK_PLAYBOOKS[family];
  const [threshold, setThreshold] = useState(p.default_threshold);
  const [retention, setRetention] = useState(12);
  const [consent, setConsent] = useState(
    'We keep your application for 12 months to consider you for other roles that fit. You can ask us to delete your data any time by replying "delete my data" to any message from us.',
  );

  return (
    <>
      <div className={s.card}>
        <div className={s.cardHead}>
          <h2 className={s.cardTitle}>Recommended playbook · {family}</h2>
          <span className={s.tierBadge}>✓ verified</span>
        </div>
        <p className={s.cardWhat}>{p.source_note}. Everything below is editable — the numbers
          are Vara&rsquo;s starting point, not a lock.</p>

        <div style={{ marginTop: 16 }}>
          <div className={s.cardMeta} style={{ marginBottom: 8 }}>Axis weights — these drive the score</div>
          <div>
            {(['skill', 'availability', 'experience'] as const).map((k) => (
              <div key={k} className={s.axesRow}>
                <span className={s.axesName}>
                  {k === 'skill' ? 'Capability' : k === 'availability' ? 'Availability' : 'Experience'}
                </span>
                <div className={s.axesBar}>
                  <div className={s.axesFill} style={{ width: `${p.axis_weights[k]}%` }} />
                </div>
                <span className={s.axesValue}>{p.axis_weights[k]}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div className={s.cardMeta} style={{ marginBottom: 8 }}>Handover threshold</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="range"
              min={0}
              max={100}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span className={s.axesValue} style={{ minWidth: 40 }}>{threshold}%</span>
          </div>
          <div className={s.retentionHelp}>
            Candidates at or above this land in your handover queue. Below sit in a 3-day closing
            window — nobody is auto-rejected on a score.
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div className={s.cardMeta} style={{ marginBottom: 8 }}>Knockout rules — only these can close without a human</div>
          <div className={s.knockoutList}>
            {p.knockouts.map((k) => (
              <div key={k.label} className={s.knockoutItem}>
                <span className={s.knockoutLabel}>{k.label}</span>
                <span className={s.knockoutRule}>{k.rule}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={s.card}>
        <div className={s.cardHead}>
          <h2 className={s.cardTitle}>Compliance</h2>
          <span className={s.cardMeta}>set once — every candidate touch respects this</span>
        </div>
        <p className={s.cardWhat}>
          What candidates see about how you handle their data. Editable later; a candidate&rsquo;s
          stored consent always references the version they saw.
        </p>
        <div className={s.consentRow}>
          <div>
            <div className={s.cardMeta} style={{ marginBottom: 6 }}>Consent text</div>
            <textarea
              className={s.textarea}
              value={consent}
              onChange={(e) => setConsent(e.target.value)}
            />
          </div>
          <div>
            <div className={s.cardMeta} style={{ marginBottom: 6 }}>Retention · months</div>
            <input
              type="number"
              className={s.numInput}
              value={retention}
              onChange={(e) => setRetention(Number(e.target.value))}
              min={1}
              max={60}
            />
            <div className={s.retentionHelp}>
              DPDP default: 12 months. Automated re-consent 30 days before expiry;
              silence → purge on schedule.
            </div>
          </div>
        </div>
      </div>

      <div className={s.actions}>
        <button type="button" className={s.ghost} onClick={onBack}>← Back</button>
        <button type="button" className={s.primary} onClick={onApprove}>
          Approve & take Vara live
        </button>
        <span className={s.note}>Approval creates scoring config v1 for this family and flips the subscription live.</span>
      </div>
    </>
  );
}
