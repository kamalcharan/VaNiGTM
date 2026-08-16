'use client';

import { useSkillQuery } from '@/lib/useSkill';
import type { ActivityItem, AgentSummary } from '@/lib/mock-transport';
import u from '@/platform/shell/ui.module.css';

interface Counters {
  agents_active: number;
  runs_today: number;
  attention: number;
  handovers: number;
}

export default function Dashboard() {
  const counters = useSkillQuery<{ agents_active: number; runs_today: number; attention: number; handovers: number }>('dashboard', 'counters');
  const activity = useSkillQuery<{ activity: ActivityItem[] }>('dashboard', 'activity');
  const agents = useSkillQuery<{ agents: AgentSummary[] }>('agents', 'list');

  const c = counters.data?.data as Counters | undefined;

  return (
    <div>
      <div className={u.eyebrow}>// ORGANIZATION</div>
      <h1 className={u.h1}>Dashboard</h1>
      <p className={u.lede}>
        What VaNi did, and what is waiting on a person. Every line here traces to a
        run, and every run to an entry on the audit spine.
      </p>

      <div className={u.counters}>
        <div className={u.counter}>
          <div className={u.cVal}>{c ? c.agents_active : '—'}</div>
          <div className={u.cLbl}>Agents active</div>
        </div>
        <div className={u.counter}>
          <div className={u.cVal}>{c ? c.runs_today : '—'}</div>
          <div className={u.cLbl}>Runs today</div>
        </div>
        <div className={u.counter}>
          <div className={u.cVal}>{c ? c.handovers : '—'}</div>
          <div className={u.cLbl}>Human handovers</div>
        </div>
        <div className={u.counter}>
          <div className={u.cVal}>{c ? c.attention : '—'}</div>
          <div className={u.cLbl}>Needs attention</div>
        </div>
      </div>

      <div className={u.grid2}>
        <section className={u.card}>
          <div className={u.cardHead}>
            Recent activity
            <span className={u.cardMeta}>live stream</span>
          </div>
          <div className={u.cardBody}>
            {activity.isLoading && <div className={u.loading}>Loading activity…</div>}
            {activity.isError && <div className={u.error}>Could not load activity.</div>}
            {activity.data?.data?.activity.map((a) => (
              <div key={a.id} className={u.act}>
                <div className={u.actAt}>{a.at}</div>
                <div>
                  <div className={u.actTxt} dangerouslySetInnerHTML={{ __html: a.text }} />
                  {a.run && <span className={u.actRun}>{a.run}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={u.card}>
          <div className={u.cardHead}>
            Agents
            <span className={u.cardMeta}>VaNi is the head</span>
          </div>
          <div className={u.cardBody}>
            {agents.isLoading && <div className={u.loading}>Loading agents…</div>}
            {agents.data?.data?.agents.map((a) => (
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
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
