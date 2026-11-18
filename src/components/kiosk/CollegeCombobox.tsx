'use client';

import React, { useId, useMemo, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, Plus } from 'lucide-react';
import { normalizeForMatch } from '@/lib/utils/normalization';

interface CollegeComboboxProps {
  value: string;
  onChange: (value: string) => void;
  colleges: string[];
  maxLength?: number;
}

const MAX_OPTIONS = 8;

/** Shows the matching part of a college name in bold. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase();
  const i = q ? text.toLowerCase().indexOf(q) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <strong className="font-bold text-[#142D4E]">{text.slice(i, i + q.length)}</strong>
      {text.slice(i + q.length)}
    </>
  );
}

/**
 * College Name field with a searchable list of colleges other students already entered. Students can pick one
 * (so everyone from the same college uses the same spelling) or type a new college, which then appears for the
 * next students.
 */
export function CollegeCombobox({ value, onChange, colleges, maxLength = 160 }: CollegeComboboxProps) {
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const query = normalizeForMatch(value);
  const options = useMemo(() => {
    if (!query) return colleges.slice(0, MAX_OPTIONS); // most used first
    const starts: string[] = [];
    const contains: string[] = [];
    for (const c of colleges) {
      const n = normalizeForMatch(c);
      if (n.startsWith(query)) starts.push(c);
      else if (n.includes(query)) contains.push(c);
      if (starts.length >= MAX_OPTIONS) break;
    }
    return [...starts, ...contains].slice(0, MAX_OPTIONS);
  }, [colleges, query]);

  const exact = !!query && colleges.some((c) => normalizeForMatch(c) === query);
  const showList = open && options.length > 0;

  const choose = (college: string) => {
    onChange(college);
    setOpen(false);
    setActive(-1);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (options.length ? (i + 1) % options.length : -1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (options.length ? (i <= 0 ? options.length - 1 : i - 1) : -1));
    } else if (e.key === 'Enter' && showList && active >= 0) {
      e.preventDefault(); // pick the highlighted college instead of submitting the form
      choose(options[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  };

  let helper = 'Start typing to find your college, or type a new one.';
  if (exact) helper = '✓ College found. Every student from this college uses the same name.';
  else if (query) helper = 'New college: it will be saved, and the next students can pick it from the list.';

  return (
    <div className="w-full flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-[#182230]">
        College Name<span className="text-[#C0393A] ml-1">*</span>
      </label>
      <div className="relative">
        <Building2 className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
        <input
          id={id}
          ref={inputRef}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          placeholder={colleges.length ? 'Search or type your college name' : 'Enter your college name'}
          maxLength={maxLength}
          autoComplete="off"
          required
          className="w-full pl-9 pr-9 py-2.5 text-sm rounded-md border border-[#E4E9F0] bg-white text-[#182230] placeholder:text-[#94A3B8] transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#2864B4] focus:border-[#2864B4]"
        />
        {colleges.length > 0 && (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Show colleges"
            onMouseDown={(e) => {
              e.preventDefault();
              setOpen((o) => !o);
              inputRef.current?.focus();
            }}
            className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-[#667085] hover:text-[#142D4E]"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${showList ? 'rotate-180' : ''}`} />
          </button>
        )}

        {showList && (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-30 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-lg border border-[#D0D5DD] bg-white py-1 shadow-xl"
          >
            {!query && (
              <li className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-[#98A2B3]" aria-hidden>
                Colleges already registered
              </li>
            )}
            {options.map((college, i) => {
              const selected = normalizeForMatch(college) === query;
              return (
                <li
                  key={college}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault(); // keep focus in the input
                    choose(college);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`flex cursor-pointer items-center gap-2.5 px-3 py-2.5 text-sm ${
                    i === active ? 'bg-[#EAF2FC] text-[#142D4E]' : 'text-[#344054]'
                  }`}
                >
                  <Building2 className="w-4 h-4 shrink-0 text-[#2864B4]" />
                  <span className="min-w-0 flex-1 truncate">
                    <Highlight text={college} query={value} />
                  </span>
                  {selected && <Check className="w-4 h-4 shrink-0 text-[#16835D]" />}
                </li>
              );
            })}
            {query && !exact && (
              <li className="flex items-center gap-2 border-t border-[#E4E9F0] px-3 py-2 text-xs text-[#667085]" aria-hidden>
                <Plus className="w-3.5 h-3.5" /> Not in the list? Keep typing to add &ldquo;{value.trim()}&rdquo;
              </li>
            )}
          </ul>
        )}
      </div>
      <p className={`text-xs mt-0.5 ${exact ? 'text-[#16835D]' : 'text-[#667085]'}`}>{helper}</p>
    </div>
  );
}
