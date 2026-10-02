'use client';
/**
 * /agents/gtm/pool/industries — the one industry master (gt_industries,
 * migration 267): sectors and sub-segments, the NIC codes that place registry
 * rows without a model, and how many pool companies sit under each.
 * Onboarding, Vara's domain packs and the pool all read this one list.
 */
import Link from 'next/link';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import u from '@/platform/shell/ui.module.css';
import s from '../pool.module.css';
import { useIndustries, type IndustryNode } from '../usePool';
import { PoolCrumbs, PoolGate, useIsPoolAdmin } from './PoolParts';

function Node({ n, child }: { n: IndustryNode; child?: boolean }) {
  return (
    <>
      <div className={`${s.node} ${child ? s.nodeChild : ''}`}>
        <span className={s.nodeName}>{n.name}{n.nic_prefixes.length > 0 && <span className={s.nodeNic}>NIC {n.nic_prefixes.join(', ')}</span>}
          {n.source !== 'seed' && <span className={`${u.tag} ${u.tagDim}`} style={{ marginLeft: 8 }}>{n.source}</span>}</span>
        <span className={s.nodeN}>{n.companies.toLocaleString()} {n.companies === 1 ? 'company' : 'companies'}</span>
        <span className={s.nodeN}>{n.in_pool.toLocaleString()} in pool</span>
      </div>
      {n.children.map((c) => <Node key={c.id} n={c} child />)}
    </>
  );
}

export default function IndustryMaster() {
  const isAdmin = useIsPoolAdmin();
  const q = useIndustries();
  if (!isAdmin) return <PoolGate title="Industry master" />;
  return (
    <div className={s.wrap}>
      <div>
        <div className={u.eyebrow}>// GTM · SHARED DATA · ADMIN</div>
        <h1 className={u.h1}>Industry master</h1>
        <PoolCrumbs on="industries" />
        <p className={u.lede}>One list. Onboarding, Vara's domain packs and the pool all read it. Registry rows (MCA, Udyam) are placed by their NIC code — free, no model; prose from directories goes through aliases.</p>
      </div>
      <section className={s.section}>
        <header className={s.secHead}><div><h2 className={s.secTitle}>The master</h2>
          <p className={s.secWhat}>A company counts under a sub-segment and its sector. NIC ranges come from migration 267's seed and are still to be checked against MoSPI's NIC 2008 tables.</p></div></header>
        <div className={s.secBody}>
          <DataBoundary query={q} label="industries" skeleton={<SkeletonRows rows={6} />} isEmpty={(d) => !d?.industries?.length}
            empty="The industry master is empty — migration 267 seeds it. Run the migrations on the VPS (deploy.txt, step 2).">
            {(d) => <div className={s.tree}>{d.industries.map((n) => <Node key={n.id} n={n} />)}</div>}
          </DataBoundary>
        </div>
      </section>
      <div className={s.note}><b>Proposals for new sub-segments</b> — grouped from industry strings no alias maps yet, approved here by an admin — arrive with the review queue (P5). Until then a string that maps to nothing leaves its company waiting on the Industry check; you can see which under <Link href="/agents/gtm/pool">a delivery's rows</Link>.</div>
    </div>
  );
}
