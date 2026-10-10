import { useState } from 'react';
import type { SavedConfig } from '../types';

interface Props {
  saved: SavedConfig[];
  activeId: string | null;
  modified: boolean;
  disabled: boolean;
  onLoad: (id: string) => void;
  onNew: () => void;
  onSave: () => void;
  onSaveAs: (name: string) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

export function SavedConfigsBar(p: Props) {
  const [mode, setMode] = useState<'saveAs' | 'rename' | null>(null);
  const [name, setName] = useState('');
  const active = p.saved.find((s) => s.id === p.activeId) ?? null;

  function begin(m: 'saveAs' | 'rename') {
    setMode(m);
    setName(m === 'rename' ? (active?.name ?? '') : active ? `${active.name} copy` : '');
  }
  function commit() {
    const n = name.trim();
    if (!n) return;
    if (mode === 'saveAs') p.onSaveAs(n);
    else p.onRename(n);
    setMode(null);
  }

  if (mode) {
    return (
      <div className="saved-bar">
        <input
          autoFocus
          placeholder="Configuration name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setMode(null);
          }}
        />
        <button type="button" className="primary" disabled={!name.trim()} onClick={commit}>
          {mode === 'saveAs' ? 'Save' : 'Rename'}
        </button>
        <button type="button" onClick={() => setMode(null)}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="saved-bar">
      <select
        aria-label="Saved configurations"
        disabled={p.disabled}
        value={p.activeId ?? ''}
        onChange={(e) => e.target.value && p.onLoad(e.target.value)}
      >
        <option value="">{p.saved.length ? '— Unsaved configuration —' : 'No saved configurations'}</option>
        {p.saved.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {p.modified && <span className="pill warn">{active ? 'Modified' : 'Not saved'}</span>}
      <button
        type="button"
        className="primary"
        disabled={p.disabled || (active !== null && !p.modified)}
        onClick={() => (active ? p.onSave() : begin('saveAs'))}
      >
        Save
      </button>
      <button type="button" disabled={p.disabled} onClick={() => begin('saveAs')}>
        Save as…
      </button>
      <button type="button" disabled={p.disabled || !active} onClick={() => begin('rename')}>
        Rename
      </button>
      <button type="button" className="danger" disabled={p.disabled || !active} onClick={p.onDelete}>
        Delete
      </button>
      <button type="button" disabled={p.disabled} onClick={p.onNew}>
        New
      </button>
    </div>
  );
}
