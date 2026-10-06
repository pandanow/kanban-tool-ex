// The per-column filter for a column whose options are a short, closed set - in
// practice the board's workflow stages. A row of checkboxes will not fit in a 29px
// filter cell, so the cell holds a summary button that opens the list in a popover,
// the same pattern the toolbar's column picker uses.

import { useEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import type { ColumnDef } from "../model/columns";
import { NONE_SELECTED, filterValueKey } from "../model/filtering";

export interface ChecklistFilterProps {
  column: ColumnDef;
  /** Option values currently ticked. Empty means "all", not "none". */
  selected: string[];
  onChange: (values: string[]) => void;
}

function summary(column: ColumnDef, selected: string[]): string {
  if (selected.length === 0) return "All";
  if (selected.includes(NONE_SELECTED)) return "None";
  if (selected.length === 1) {
    const only = column.options?.find(
      (o) => filterValueKey(o.value) === selected[0],
    );
    if (only) return only.label;
  }
  return `${selected.length} selected`;
}

export function ChecklistFilter({
  column,
  selected,
  onChange,
}: ChecklistFilterProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const options = column.options ?? [];
  const none = selected.includes(NONE_SELECTED);
  const ticked = new Set(selected.filter((v) => v !== NONE_SELECTED));
  // An empty selection means "no filter", i.e. every stage - so "All" is shown ticked
  // (with every stage box) both then and when each stage has been ticked by hand.
  const allTicked =
    options.length > 0 &&
    ((!none && ticked.size === 0) || ticked.size === options.length);

  useEffect(() => {
    if (!open) return;
    const onDocumentClick = (event: MouseEvent): void => {
      if (!hostRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, [open]);

  const toggle = (value: string): void => {
    const next = new Set(
      allTicked ? options.map((o) => filterValueKey(o.value)) : ticked,
    );
    if (next.has(value)) next.delete(value);
    else next.add(value);
    // Keep the board's own option order, so the saved state does not depend on the
    // order the boxes happened to be clicked in.
    const values = options
      .map((o) => filterValueKey(o.value))
      .filter((v) => next.has(v));
    // Every stage ticked is the same as no filter, so store it that way.
    onChange(values.length === options.length ? [] : values);
  };

  return (
    <div class="ktv-checklist-host" ref={hostRef}>
      <button
        type="button"
        class={`ktv-checklist-button${ticked.size > 0 || none ? " ktv-checklist-button-active" : ""}`}
        title={`Filter ${column.label}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span class="ktv-checklist-summary">{summary(column, selected)}</span>
        <span class="ktv-checklist-caret">▾</span>
      </button>
      {open && (
        <div class="ktv-popover ktv-checklist-popover">
          {options.length > 0 && (
            <label class="ktv-popover-item">
              <input
                type="checkbox"
                checked={allTicked}
                onChange={() => onChange(allTicked ? [NONE_SELECTED] : [])}
              />
              <span>All</span>
            </label>
          )}
          {options.map((option) => {
            const value = filterValueKey(option.value);
            return (
              <label class="ktv-popover-item" key={value}>
                <input
                  type="checkbox"
                  checked={allTicked || ticked.has(value)}
                  onChange={() => toggle(value)}
                />
                <span
                  class={`ktv-tone-dot ${option.tone ? `ktv-tone-${option.tone}` : "ktv-tone-none"}`}
                />
                <span>{option.label}</span>
              </label>
            );
          })}
          {options.length === 0 && (
            <div class="ktv-popover-item">No stages</div>
          )}
          <button
            type="button"
            class="ktv-checklist-clear"
            disabled={ticked.size === 0 && !none}
            onClick={() => onChange([])}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
