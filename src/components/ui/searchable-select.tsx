'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, X } from 'lucide-react';

interface SearchableSelectProps {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allLabel?: string;
  allValue?: string;
  className?: string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = '搜索...',
  allLabel = '全部',
  allValue = 'all',
  className = '',
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = value === allValue
    ? allLabel
    : options.find(o => o.value === value)?.label || value;

  const filteredOptions = options.filter(o =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  const hasFilter = value !== allValue;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className={`flex items-center gap-1 text-sm border rounded-md px-2 py-1.5 bg-background text-foreground hover:bg-muted/50 transition-colors min-w-[80px] ${hasFilter ? 'border-primary/50 bg-primary/5' : ''}`}
      >
        <span className="truncate max-w-[100px]">{selectedOption}</span>
        {hasFilter && (
          <X
            className="w-3 h-3 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onChange(allValue);
            }}
          />
        )}
        <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-popover border rounded-md shadow-lg z-50 py-1 max-h-60 overflow-hidden flex flex-col">
          <div className="px-2 pb-1">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={placeholder}
              className="w-full text-sm border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
          <div className="overflow-y-auto flex-1">
            <button
              type="button"
              onClick={() => { onChange(allValue); setIsOpen(false); setSearch(''); }}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-muted/50 ${value === allValue ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'}`}
            >
              {allLabel}
            </button>
            {filteredOptions.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setIsOpen(false); setSearch(''); }}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-muted/50 truncate ${value === opt.value ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'}`}
              >
                {opt.label}
              </button>
            ))}
            {filteredOptions.length === 0 && (
              <div className="px-3 py-2 text-sm text-muted-foreground text-center">无匹配项</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
