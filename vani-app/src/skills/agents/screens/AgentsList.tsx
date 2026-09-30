'use client';

import { useSkillQuery } from '@/lib/useSkill';
import type { AgentSummary } from '@/lib/mock-transport';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import u from '@/platform/shell/ui.module.css';
import { metaFor } from '@/skills/agents/meta';

export default function AgentsList() {
  const q = useSkillQuery<{ agents: AgentSummary[] }>('agents', 'list');
  const count = q.data?.data?.agents.length;

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
          <span className={u.cardMeta}>{count === undefined ? '—' : `${count} total`}</span>
        </div>
        <div className={u.cardBody}>
          <DataBoundary
            query={q}
            label="agents"
            skeleton={<SkeletonRows rows={4} lines={3} />}
            isEmpty={(d) => !d?.agents?.length}
            empty="Agents appear here once they are registered against this tenant."
          >
            {(d) =>
              d.agents.map((a) => {
                const m = metaFor(a.id);
                const color = a.color ?? m.color;
                return (
                <div key={a.id} className={u.agent}>
                  <span
                    className={u.agIc}
                    style={{ background: `${color}1f`, color, border: `1px solid ${color}55` }}
                    aria-hidden="true"
                  >
                    {a.icon ?? m.icon}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span className={u.agName}>{a.name}</span>
                      <span className={u.agRole} style={{ margin: 0 }}>
                        {a.role ?? m.role}
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
                    <div className={u.agDesc}>{a.desc ?? m.desc}</div>
                    <div className={u.agScope}>
                      {a.scope ?? m.scope}
                      {a.version ? ` · v${a.version}` : ''}
                      {a.subscription && a.subscription !== 'none' ? ` · ${a.subscription}` : ''}
                      {a.source === 'derived' ? ' · derived' : ''}
                    </div>
                  </div>
                </div>
                );
              })
            }
          </DataBoundary>
        </div>
      </section>
    </div>
  );
}
