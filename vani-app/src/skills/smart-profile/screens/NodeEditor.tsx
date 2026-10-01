'use client';
/**
 * Edit or remove one entry of the graph. Used by the Knowledge list and the
 * Knowledge Graph side panel, so a correction is the same gesture in both.
 *
 * Name and description only; the kind stays. The edit is recorded as the
 * person's and a later read of the page keeps it (the server honours
 * `human_edited`). Removing takes the entry's relationships with it and
 * asks first — a correction, not a mis-click.
 */
import { useState } from 'react';
import s from '../smart-profile.module.css';
import k from '../knowledge.module.css';
import { useNodeWrites, type KgNode } from '../useKnowledge';

export function NodeEditor({ node, onDone }: { node: KgNode; onDone: () => void }) {
  const { update, remove, busy } = useNodeWrites();
  const [name, setName] = useState(node.name);
  const [description, setDescription] = useState(node.description ?? '');
  const [confirm, setConfirm] = useState(false);
  const dirty = name.trim() !== node.name || description.trim() !== (node.description ?? '');

  async function save() {
    const patch: { name?: string; description?: string } = {};
    if (name.trim() !== node.name) patch.name = name.trim();
    if (description.trim() !== (node.description ?? '')) patch.description = description.trim();
    const r = await update(node.id, patch);
    if (r) onDone();
  }

  return (
    <div className={k.editor}>
      <input className={s.inviteInput} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" disabled={busy} maxLength={200} />
      <textarea className={s.teachArea} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One clear sentence — what this is, in your words" disabled={busy} />
      <div className={k.editorRow}>
        <button type="button" className={s.inviteSend} onClick={() => void save()} disabled={busy || !dirty || !name.trim()}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className={s.srcRemove} onClick={onDone} disabled={busy}>Cancel</button>
        <span style={{ flex: 1 }} />
        {confirm ? (
          <>
            <span className={k.editorHint}>Remove this entry and its relationships?</span>
            <button type="button" className={s.srcRemove} style={{ color: 'var(--color-danger)' }} disabled={busy} onClick={async () => { const r = await remove(node.id); if (r) onDone(); }}>Yes, remove</button>
            <button type="button" className={s.srcRemove} disabled={busy} onClick={() => setConfirm(false)}>No</button>
          </>
        ) : (
          <button type="button" className={s.srcRemove} disabled={busy} onClick={() => setConfirm(true)}>Remove</button>
        )}
      </div>
      <p className={k.editorHint}>The kind ({node.label}) stays. Your wording is kept when the page is read again; the model&rsquo;s later wording is stored beside it, never over it.</p>
    </div>
  );
}
