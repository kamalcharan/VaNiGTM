'use client';

import { useSkillQuery } from '@/lib/useSkill';
import type { ActivityItem, AgentSummary } from '@/lib/mock-transport';
import { formatDateTime } from '@/lib/format';
import { DataBoundary, SkeletonCounters, SkeletonRows } from '@/platform/feedback';
import Link from 'next/link';
import u from '@/platform/shell/ui.module.css';
import { AgentJourney } from '@/platform/pathway';
import { AGENT_WORKSPACES } from '@/skills';
import { metaFor } from '@/skills/agents/meta';
import { PreviewBadge } from '@/skills/gtm-shell/PreviewBadge';

interface Counters {
  agents_active: number;
  runs_today: number;
  attention: number;
  handovers: number;
  detail?: { failed_24h: number; unconsumed_events: number };
}

interface BrainSection { key: string; label: string; weight: number; earned: number; ratio: number; why: string }
interface Brain {
  exists: boolean;
  completion_score: number;
  is_complete: boolean;
  sections: BrainSection[];
  weakest: { key: string; label: string; why: string } | null;
  unlocks: { storytelling: boolean };
}

const LABELS: [keyof Counters, string, string][] = [
  ['agents_active', 'Agents live', '/agents'],
  ['runs_today', 'Runs today', '/runs'],
  ['handovers', 'Waiting on you', '/runs/awaiting'],
  ['attention', 'Needs attention', '/runs/events'],
];

/** Where to go to fix a Brain section. The wizard's step ids; offers live on their own screen. */
function fixHref(key: string): string {
  if (key === 'offers') return '/smart-profile/offers';
  if (key === 'research') return '/onboarding?step=company';
  return `/onboarding?step=${key}`;
}

/**
 * The landing after login. The product starts from the Smart Profile, so the
 * page starts from it too: the Brain's completeness and the one section that
 * is weakest, with why it matters to the agents and where to fix it. Then
 * each agent's journey, then what ran. Every number is a real row since
 * 2026-09-30; the only preview left is Edge's journey, which lives in the
 * browser and is labelled as such.
 */
export default function Dashboard() {
  const brain = useSkillQuery<Brain>('dashboard', 'brain');
  const counters = useSkillQuery<Counters>('dashboard', 'counters');
  const activity = useSkillQuery<{ activity: ActivityItem[] }>('dashboard', 'activity', { limit: 12 });
  const agents = useSkillQuery<{ agents: AgentSummary[] }>('agents', 'list');

  return (
    <div>
      <div className={u.eyebrow}>// ORGANIZATION</div>
      <h1 className={u.h1}>Dashboard</h1>
      <p className={u.lede}>
        What VaNi knows about you, what each agent is doing with it, and what is waiting on a person.
      </p>

      {/* ── The Brain ─────────────────────────────────────────────────── */}
      <section className={u.card}>
        <div className={u.cardHead}>
          Smart Profile
          <span className={u.cardMeta}>what every agent reads</span>
        </div>
        <div className={u.cardBody}>
          <DataBoundary query={brain} label="profile" skeleton={<SkeletonRows rows={2} lines={2} />}>
            {(b) => (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 160px) 1fr', gap: 18, alignItems: 'start' }}>
                <div>
                  <div className={u.cVal} style={{ fontSize: 'var(--fs-xl)', lineHeight: 1 }}>
                    <span style={{ fontSize: 40 }}>{b.completion_score}</span><span className={u.cLbl}> / 100</span>
                  </div>
                  <div className={u.cLbl} style={{ marginTop: 6 }}>{b.is_complete ? 'complete enough to start' : 'not yet complete'}</div>
                  <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {b.sections.map((s) => (
                      <span key={s.key} title={`${s.earned}/${s.weight} — ${s.why}`}
                        className={`${u.tag} ${s.ratio >= 1 ? u.tagOk : s.ratio > 0 ? u.tagWarn : u.tagDim}`}>
                        {s.label} {s.earned}/{s.weight}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  {!b.exists ? (
                    <>
                      <div className={u.agName}>Nothing is known about you yet</div>
                      <div className={u.agDesc}>Start with your website. VaNi reads it, drafts the profile, and asks only what it could not find.</div>
                      <Link href="/onboarding" className={u.cardMeta} style={{ display: 'inline-block', marginTop: 8, color: 'var(--ac)' }}>Start the Smart Profile →</Link>
                    </>
                  ) : b.weakest ? (
                    <>
                      <div className={u.agName}>Weakest: {b.weakest.label}</div>
                      <div className={u.agDesc}>{b.weakest.why}</div>
                      <Link href={fixHref(b.weakest.key)} className={u.cardMeta} style={{ display: 'inline-block', marginTop: 8, color: 'var(--ac)' }}>
                        Fix {b.weakest.label.toLowerCase()} →
                      </Link>
                    </>
                  ) : (
                    <>
                      <div className={u.agName}>Every section is filled</div>
                      <div className={u.agDesc}>The agents have everything they read. Teach VaNi more as your business changes.</div>
                      <Link href="/smart-profile" className={u.cardMeta} style={{ display: 'inline-block', marginTop: 8, color: 'var(--ac)' }}>Open the Smart Profile →</Link>
                    </>
                  )}
                  <div className={u.agScope} style={{ marginTop: 10 }}>
                    Storytelling {b.unlocks.storytelling ? 'unlocked' : `unlocks at 60 (now ${b.completion_score})`}
                  </div>
                </div>
              </div>
            )}
          </DataBoundary>
        </div>
      </section>

      {/* ── Counters ──────────────────────────────────────────────────── */}
      <DataBoundary query={counters} label="counters" skeleton={<SkeletonCounters count={LABELS.length} />}>
        {(c) => (
          <div className={u.counters}>
            {LABELS.map(([key, label, href]) => (
              <Link key={key} href={href} className={u.counter} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className={u.cVal}>{c[key] as number}</div>
                <div className={u.cLbl}>{label}</div>
                {key === 'attention' && c.detail && (c.detail.failed_24h > 0 || c.detail.unconsumed_events > 0) && (
                  <div className={u.agScope}>{c.detail.failed_24h} failed · {c.detail.unconsumed_events} unconsumed</div>
                )}
              </Link>
            ))}
          </div>
        )}
      </DataBoundary>

      {/* ── One card per agent: where this tenant is with it, and the next step. ── */}
      <div className={u.counters} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {AGENT_WORKSPACES.filter((w) => w.journey).map((w) => {
          const landing = w.routes[0]?.href ?? '/agents';
          const isEdge = w.journey!.skill === 'edge';
          return (
            <div key={w.id} className={u.counter}>
              {isEdge && <div style={{ display: 'flex', justifyContent: 'flex-end' }}><PreviewBadge what="Edge's journey (kept in your browser)" /></div>}
              <AgentJourney decl={w.journey!} variant="card" name={w.name} />
              <Link href={landing} className={u.cardMeta} style={{ display: 'inline-block', marginTop: 10, color: 'var(--ac)', textDecoration: 'none' }}>
                Open {w.name} →
              </Link>
            </div>
          );
        })}
      </div>

      <div className={u.grid2}>
        <section className={u.card}>
          <div className={u.cardHead}>
            Recent activity
            <Link href="/runs" className={u.cardMeta} style={{ color: 'var(--ac)' }}>all runs →</Link>
          </div>
          <div className={u.cardBody}>
            <DataBoundary
              query={activity}
              label="activity"
              skeleton={<SkeletonRows rows={4} lines={2} />}
              isEmpty={(d) => !d?.activity?.length}
              empty="Nothing has run yet. Reading your website in the Smart Profile is the usual first run."
            >
              {(d) =>
                d.activity.map((a) => (
                  <div key={a.id} className={u.act}>
                    <div className={u.actAt}>{formatDateTime(a.at)}</div>
                    <div>
                      <div className={u.actTxt}><span className={u.mono}>{a.agent}</span> · {a.text}</div>
                      {a.run && <Link href={`/runs/${a.run}`} className={u.actRun} style={{ color: 'var(--ac)' }}>run {a.run}</Link>}
                    </div>
                  </div>
                ))
              }
            </DataBoundary>
          </div>
        </section>

        <section className={u.card}>
          <div className={u.cardHead}>
            Agents
            <Link href="/agents" className={u.cardMeta} style={{ color: 'var(--ac)' }}>all agents →</Link>
          </div>
          <div className={u.cardBody}>
            <DataBoundary
              query={agents}
              label="agents"
              skeleton={<SkeletonRows rows={3} lines={3} />}
              isEmpty={(d) => !d?.agents?.length}
              empty="No agents are registered on the platform yet."
            >
              {(d) =>
                d.agents.map((a) => {
                  const m = metaFor(a.id);
                  const color = a.color ?? m.color;
                  return (
                    <div key={a.id} className={u.agent}>
                      <span className={u.agIc} style={{ background: `${color}1f`, color, border: `1px solid ${color}55` }} aria-hidden="true">
                        {a.icon ?? m.icon}
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span className={u.agName}>{a.name}</span>
                          <span className={`${u.tag} ${a.status === 'active' ? u.tagOk : a.status === 'attention' ? u.tagWarn : u.tagDim}`}>
                            {a.status === 'not_activated' ? 'Not activated' : a.status === 'attention' ? (a.subscription ?? 'attention') : a.status}
                          </span>
                          {a.source === 'derived' && <span className={`${u.tag} ${u.tagDim}`} title="Not yet registered on the platform spine; state is derived from your data.">derived</span>}
                        </div>
                        <div className={u.agRole}>{a.role ?? m.role}</div>
                        <div className={u.agDesc}>{a.desc ?? m.desc}</div>
                      </div>
                    </div>
                  );
                })
              }
            </DataBoundary>
          </div>
        </section>
      </div>
    </div>
  );
}
