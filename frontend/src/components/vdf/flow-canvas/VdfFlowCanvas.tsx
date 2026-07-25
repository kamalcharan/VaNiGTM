import s from './VdfFlowCanvas.module.css';

export type VdfFlowNodeKind = 'trigger' | 'action' | 'delay' | 'branch' | 'exit';

export interface VdfFlowNode {
  id: string;
  kind: VdfFlowNodeKind;
  title: string;
  sub?: string;
  /** For kind='branch': the parallel paths, each a labeled column of nodes */
  branches?: { label: string; nodes: VdfFlowNode[] }[];
}

export interface VdfFlowCanvasProps {
  nodes: VdfFlowNode[];
  className?: string;
}

const KIND_LABEL: Record<VdfFlowNodeKind, string> = {
  trigger: 'Trigger',
  action: 'Action',
  delay: 'Wait',
  branch: 'Branch',
  exit: 'Exit',
};

function FlowNodeCard({ node }: { node: VdfFlowNode }) {
  return (
    <div className={`${s.node} ${s[node.kind]}`}>
      <span className={s.kind}>{KIND_LABEL[node.kind]}</span>
      <span className={s.title}>{node.title}</span>
      {node.sub && <span className={s.sub}>{node.sub}</span>}
    </div>
  );
}

function FlowColumn({ nodes }: { nodes: VdfFlowNode[] }) {
  return (
    <div className={s.spine}>
      {nodes.map((node, i) => (
        <div key={node.id} className={s.step}>
          {i > 0 && <span className={s.connector} aria-hidden />}
          <FlowNodeCard node={node} />
          {node.kind === 'branch' && node.branches && (
            <div className={s.branches}>
              {node.branches.map((b) => (
                <div key={b.label} className={s.branch}>
                  <span className={s.branchLabel}>{b.label}</span>
                  <FlowColumn nodes={b.nodes} />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * VdfFlowCanvas — the sequence-builder flow view (POA 1.3 gap
 * component). A vertical spine of typed nodes (trigger/action/wait/
 * branch/exit) with labeled branch splits. Design-pass scope: static
 * rendering of a sequence definition; drag-editing comes with the
 * sequence-skill build.
 */
export function VdfFlowCanvas({ nodes, className }: VdfFlowCanvasProps) {
  return (
    <div className={`${s.canvas} ${className || ''}`}>
      <FlowColumn nodes={nodes} />
    </div>
  );
}

export default VdfFlowCanvas;
