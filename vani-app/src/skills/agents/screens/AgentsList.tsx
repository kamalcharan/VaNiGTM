'use client';

import { useSkillQuery } from '@/lib/useSkill';
import type { AgentSummary } from '@/lib/mock-transport';
import u from '@/platform/shell/ui.module.css';

export default function AgentsList() {
  const q = useSkillQuery<{ agents: AgentSummary[] }>('agents', 'list');

  return (
    <div>
      <div className={u.eyebrow}>// AGENTS</div>
      <h1 className={u.h1}>All Agents</h1>
      <p className={u.lede}>
        VaNi is the head. Each agent beneath it carries its own goals, role catalog
        and metering, and is activated per tenant through its own readiness gate.
      </p>

      <section className={u.card}>
        <div className={u.cardHead}>
          Registered
          <span className={u.cardMeta}>{q.data?.data?.agents.length ?? '—'} total</span>
        </div>
        <div className={u.cardBody}>
          {q.isLoading && <div className={u.loading}>Loading agents…</div>}
          {q.isError && <div className={u.error}>Could not load agents.</div>}
          {q.data?.data?.agents.map((a) => (
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
                  <span className={u.agRole} style={{ margin: 0 }}>
                    {a.role}
                  </span>
                  <span
                    className={`${u.tag} ${
                      a.status === 'active' ? u.tagOk : a.status === 'attention' ? u.tagWarn : u.tagDim
                    }`}
                    style={{ marginLeft: 'auto' }}
                  >
                    {a.status === 'not_activated' ? 'Not activated' : a.status}
                  </span>
                </div>
                <div className={u.agDesc}>{a.desc}</div>
                <div className={u.agScope}>
                  {a.scope} · {a.runs} runs · {a.tools} tools
                  {a.facts !== null ? ` · ${a.facts} facts` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
