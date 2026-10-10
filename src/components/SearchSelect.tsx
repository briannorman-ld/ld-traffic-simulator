import { useEffect, useId, useRef, useState } from 'react';
import { rankMatches, type SearchOption } from './rankMatches';

export type { SearchOption };

interface Props {
  options: SearchOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Shown in the list when there are no options yet, e.g. "Loading…". */
  emptyText?: string;
  /** Offer a "Use “…”" row so values that aren't in the list can still be entered. */
  allowCustom?: boolean;
}

type Item = { kind: 'option'; option: SearchOption } | { kind: 'custom'; text: string };

const MAX_RENDERED = 200;

/**
 * Text-filterable single select: click to see every option, type to narrow by label or value,
 * arrows + Enter or click to pick. Clicking a filled-in field shows the full list again.
 */
export function SearchSelect({ options, value, onChange, placeholder, disabled, emptyText, allowCustom }: Props) {
  const [query, setQuery] = useState<string | null>(null); // null = not typing; show the selection
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value);
  const selectedText = selected ? selected.label : value;
  const typed = (query ?? '').trim();
  const matches = typed ? rankMatches(options, typed.toLowerCase()) : options;
  const items: Item[] = matches.slice(0, MAX_RENDERED).map((option) => ({ kind: 'option', option }));
  if (allowCustom && typed && !options.some((o) => o.value === typed)) items.push({ kind: 'custom', text: typed });

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${highlight}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  function openList() {
    setOpen(true);
    setHighlight(Math.max(0, options.findIndex((o) => o.value === value)));
  }

  function choose(item: Item) {
    onChange(item.kind === 'option' ? item.option.value : item.text);
    setQuery(null);
    setOpen(false);
  }

  function close() {
    setQuery(null);
    setOpen(false);
  }

  return (
    <div className="search-select">
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && items[highlight] ? `${listId}-${highlight}` : undefined}
        spellCheck={false}
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={query ?? selectedText}
        onFocus={(e) => {
          e.target.select();
          openList();
        }}
        // A field that's already focused gets no focus event, so reopen on click too.
        onClick={() => !open && openList()}
        onBlur={close}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!open) return openList();
            const step = e.key === 'ArrowDown' ? 1 : -1;
            setHighlight((h) => Math.min(Math.max(h + step, 0), Math.max(items.length - 1, 0)));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (open && items[highlight]) choose(items[highlight]);
          } else if (e.key === 'Escape') {
            close();
          }
        }}
      />
      {open && (
        <ul className="ss-list" id={listId} role="listbox" ref={listRef}>
          {items.length === 0 && (
            <li className="ss-empty">{options.length === 0 ? (emptyText ?? 'No options') : `No matches for “${typed}”`}</li>
          )}
          {items.map((item, i) => {
            const isSelected = item.kind === 'option' && item.option.value === value;
            return (
              <li
                key={item.kind === 'option' ? item.option.value : '__custom__'}
                id={`${listId}-${i}`}
                data-index={i}
                role="option"
                aria-selected={isSelected}
                className={`ss-option ${i === highlight ? 'active' : ''} ${isSelected ? 'selected' : ''} ${item.kind}`}
                // mousedown + preventDefault so the input doesn't blur (and close) before the pick.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(item);
                }}
                onMouseEnter={() => setHighlight(i)}
              >
                {item.kind === 'option' ? (
                  <>
                    <span>{item.option.label}</span>
                    {item.option.detail && <span className="muted small">{item.option.detail}</span>}
                  </>
                ) : (
                  <span>
                    Use “<code>{item.text}</code>”
                  </span>
                )}
              </li>
            );
          })}
          {matches.length > MAX_RENDERED && (
            <li className="ss-empty">{matches.length - MAX_RENDERED} more. Keep typing to narrow it down.</li>
          )}
        </ul>
      )}
    </div>
  );
}
