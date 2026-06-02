'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Calendar, X } from 'lucide-react';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartChange: (date: string) => void;
  onEndChange: (date: string) => void;
  placeholder?: string;
  className?: string;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

type SelectionPhase = 'start' | 'end';

export function DateRangePicker({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  placeholder = '选择日期范围',
  className = '',
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [phase, setPhase] = useState<SelectionPhase>('start');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
        setPhase('start');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const startD = parseDate(startDate);
  const endD = parseDate(endDate);

  const displayText = startD && endD
    ? `${formatDate(startD)} - ${formatDate(endD)}`
    : startD
      ? `${formatDate(startD)} - ...`
      : placeholder;

  const hasValue = startD !== null;

  const handleDayClick = useCallback((day: number) => {
    const selected = new Date(viewYear, viewMonth, day);
    const formatted = formatDate(selected);

    if (phase === 'start') {
      onStartChange(formatted);
      onEndChange('');
      setPhase('end');
    } else {
      if (selected < (startD || new Date(0))) {
        onStartChange(formatted);
        onEndChange(formatDate(startD || selected));
      } else {
        onEndChange(formatted);
      }
      setPhase('start');
      setIsOpen(false);
    }
  }, [phase, viewYear, viewMonth, startD, onStartChange, onEndChange]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const clearValue = (e: React.MouseEvent) => {
    e.stopPropagation();
    onStartChange('');
    onEndChange('');
    setPhase('start');
  };

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfWeek(viewYear, viewMonth);

  const isInRange = (day: number) => {
    if (!startD || !endD) return false;
    const d = new Date(viewYear, viewMonth, day);
    return d >= startD && d <= endD;
  };

  const isStart = (day: number) => {
    if (!startD) return false;
    const d = new Date(viewYear, viewMonth, day);
    return d.getTime() === startD.getTime();
  };

  const isEnd = (day: number) => {
    if (!endD) return false;
    const d = new Date(viewYear, viewMonth, day);
    return d.getTime() === endD.getTime();
  };

  const isToday = (day: number) => {
    const today = new Date();
    return viewYear === today.getFullYear() && viewMonth === today.getMonth() && day === today.getDate();
  };

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 text-sm border rounded-md px-2 py-1.5 bg-background text-foreground hover:bg-muted/50 transition-colors ${hasValue ? 'border-primary/50 bg-primary/5' : ''}`}
      >
        <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className={`truncate max-w-[180px] ${hasValue ? 'text-foreground' : 'text-muted-foreground'}`}>
          {displayText}
        </span>
        {hasValue && (
          <X className="w-3 h-3 shrink-0 text-muted-foreground hover:text-foreground" onClick={clearValue} />
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-popover border rounded-lg shadow-lg z-50 p-3 w-[280px]">
          {/* Phase hint */}
          <div className="text-xs text-muted-foreground mb-2 text-center">
            {phase === 'start' ? '请选择起始日期' : '请选择终止日期'}
          </div>

          {/* Month navigation */}
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={prevMonth} className="p-1 hover:bg-muted/50 rounded">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium">
              {viewYear}年{viewMonth + 1}月
            </span>
            <button type="button" onClick={nextMonth} className="p-1 hover:bg-muted/50 rounded">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-0 mb-1">
            {WEEKDAYS.map(w => (
              <div key={w} className="text-center text-xs text-muted-foreground py-1">{w}</div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-0">
            {days.map((day, i) => {
              if (day === null) return <div key={`e${i}`} className="h-8" />;

              const inRange = isInRange(day);
              const isStartDay = isStart(day);
              const isEndDay = isEnd(day);
              const today = isToday(day);

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleDayClick(day)}
                  className={`
                    h-8 w-full text-sm rounded-sm flex items-center justify-center relative
                    ${isStartDay || isEndDay ? 'bg-primary text-primary-foreground font-medium' : ''}
                    ${inRange && !isStartDay && !isEndDay ? 'bg-primary/10' : ''}
                    ${!isStartDay && !isEndDay && !inRange ? 'hover:bg-muted/50' : ''}
                    ${today && !isStartDay && !isEndDay ? 'font-bold' : ''}
                  `}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Quick actions */}
          <div className="flex gap-1 mt-2 pt-2 border-t">
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                onStartChange(formatDate(new Date(now.getFullYear(), now.getMonth(), 1)));
                onEndChange(formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
                setPhase('start');
                setIsOpen(false);
              }}
              className="flex-1 text-xs py-1 text-center hover:bg-muted/50 rounded border"
            >
              本月
            </button>
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                onStartChange(formatDate(new Date(now.getFullYear(), 0, 1)));
                onEndChange(formatDate(new Date(now.getFullYear(), 11, 31)));
                setPhase('start');
                setIsOpen(false);
              }}
              className="flex-1 text-xs py-1 text-center hover:bg-muted/50 rounded border"
            >
              本年
            </button>
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                onStartChange(formatDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
                onEndChange(formatDate(new Date(now.getFullYear(), now.getMonth(), 0)));
                setPhase('start');
                setIsOpen(false);
              }}
              className="flex-1 text-xs py-1 text-center hover:bg-muted/50 rounded border"
            >
              上月
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
