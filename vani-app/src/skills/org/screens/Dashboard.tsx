'use client';

import { useSkillQuery } from '@/lib/useSkill';
import type { ActivityItem, AgentSummary } from '@/lib/mock-transport';
import { DataBoundary, SkeletonCounters, SkeletonRows } from '@/platform/feedback';
import Link from 'next/link';
import u from '@/platform/shell/ui.module.css';
import { AgentJourney } from '@/platform/pathway';
import { AGENT_WORKSPACES } from '@/skills';
import { PreviewBadge } from '@/skills/gtm-shell/PreviewBadge';

interface Counters {
  agents_active: number;
  runs_today: number;
  attention: number;
  handovers: number;
}

const LABELS: [keyof Counters, string][] = [
  ['agents_active', 'Agents active'],
  ['runs_today', 'Runs today'],
  ['handovers', 'Human handovers'],
  ['attention', 'Needs attention'],
];

export default function Dashboard() {
  const counters = useSkillQuery<Counters>('dashboard', 'counters');
  const activity = useSkillQuery<{ activity: ActivityItem[] }>('dashboard', 'activity');
  const agents = useSkillQuery<{ agents: AgentSummary[] }>('agents', 'list');

  return (
    <div>
      <div className={u.eyebrow}>// ORGANIZATION</div>
      <h1 className={u.h1}>Dashboard</h1>
      <p className={u.lede}>
        What VaNi did, and what is waiting on a person. Every line here traces to a
        run, and every run to an entry on the audit spine.
      </p>

      {/*
        These used to render an em-dash for both "still loading" and "the value
        is genuinely unknown", which are different things a reader cannot tell
        apart. The boundary makes the wait visible and the failure loud.
      */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}><PreviewBadge what="counters, activity, agents and the journey" /></div>
      <DataBoundary
        query={counters}
        label="counters"
        skeleton={<SkeletonCounters count={LABELS.length} />}
      >
        {(c) => (
          <div className={u.counters}>
            {LABELS.map(([key, label]) => (
              <div key={key} className={u.counter}>
                <div className={u.cVal}>{c[key]}</div>
                <div className={u.cLbl}>{label}</div>
              </div>
            ))}
          </div>
        )}
      </DataBoundary>

      {/* One card per agent: where this tenant is with it, and the next step.
          Rendered from each workspace's journey declaration — the same source
          the agent's own landing uses (POA §2.4b). */}
      <div className={u.counters} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {AGENT_WORKSPACES.filter((w) => w.journey).map((w) => {
          const landing = w.routes[0]?.href ?? '/agents';
          return (
            <div key={w.id} className={u.counter}>
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
            <span className={u.cardMeta}>live stream</span>
          </div>
          <div className={u.cardBody}>
            <DataBoundary
              query={activity}
              label="activity"
              skeleton={<SkeletonRows rows={4} lines={2} />}
              isEmpty={(d) => !d?.activity?.length}
              empty="Nothing has run yet. Activity appears here the moment it does."
            >
              {(d) =>
                d.activity.map((a) => (
                  <div key={a.id} className={u.act}>
                    <div className={u.actAt}>{a.at}</div>
                    <div>
                      <div className={u.actTxt} dangerouslySetInnerHTML={{ __html: a.text }} />
                      {a.run && <span className={u.actRun}>{a.run}</span>}
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
            <span className={u.cardMeta}>VaNi is the head</span>
          </div>
          <div className={u.cardBody}>
            <DataBoundary
              query={agents}
              label="agents"
              skeleton={<SkeletonRows rows={3} lines={3} />}
              isEmpty={(d) => !d?.agents?.length}
              empty="No agents are registered against this tenant yet."
            >
              {(d) =>
                d.agents.map((a) => (
                  <div key={a.id} className={u.agent}>
                    <span
                      className={u.agIc}
                      style={{ background: `${a.color}1f`, color: a.color, border: `1px solid ${a.color}55` }}
                      aria-hidden="true"
                    >
                      {a.icon}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span className={u.agName}>{a.name}</span>
                        <span
                          className={`${u.tag} ${
                            a.status === 'active' ? u.tagOk : a.status === 'attention' ? u.tagWarn : u.tagDim
                          }`}
                        >
                          {a.status === 'not_activated' ? 'Not activated' : a.status}
                        </span>
                      </div>
                      <div className={u.agRole}>{a.role}</div>
                      <div className={u.agDesc}>{a.desc}</div>
                      <div className={u.agScope}>{a.scope}</div>
                    </div>
                  </div>
                ))
              }
            </DataBoundary>
          </div>
        </section>
      </div>
    </div>
  );
}
