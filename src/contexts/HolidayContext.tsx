'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface HolidayData {
  holidays: Record<string, string>;     // 放假日 → 假日名称
  workdaysOnWeekend: Set<string>;       // 周末补班日
  loaded: boolean;                      // 是否已加载完成
}

interface HolidayContextType extends HolidayData {
  getDateStatus: (date: Date) => {
    isHoliday: boolean;
    isWorkday: boolean;
    holidayName: string | null;
    isWeekend: boolean;
  };
}

const HolidayContext = createContext<HolidayContextType>({
  holidays: {},
  workdaysOnWeekend: new Set(),
  loaded: false,
  getDateStatus: () => ({ isHoliday: false, isWorkday: true, holidayName: null, isWeekend: false }),
});

export function useHolidays() {
  return useContext(HolidayContext);
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function HolidayProvider({ children }: { children: ReactNode }) {
  const [holidayData, setHolidayData] = useState<HolidayData>({
    holidays: {},
    workdaysOnWeekend: new Set(),
    loaded: false,
  });

  useEffect(() => {
    const fetchHolidays = async () => {
      try {
        const currentYear = new Date().getFullYear();
        const res = await fetch(`/api/holidays?year=${currentYear - 1},${currentYear},${currentYear + 1}`);
        if (!res.ok) return;
        const data = await res.json();

        const mergedHolidays: Record<string, string> = {};
        const mergedWorkdays: string[] = [];

        for (const yearData of Object.values(data) as Array<{ holidays: Record<string, string>; workdaysOnWeekend: string[] }>) {
          Object.assign(mergedHolidays, yearData.holidays);
          mergedWorkdays.push(...yearData.workdaysOnWeekend);
        }

        setHolidayData({
          holidays: mergedHolidays,
          workdaysOnWeekend: new Set(mergedWorkdays),
          loaded: true,
        });
      } catch (err) {
        console.error('获取假日数据失败:', err);
        setHolidayData(prev => ({ ...prev, loaded: true }));
      }
    };
    fetchHolidays();
  }, []);

  const getDateStatus = (date: Date) => {
    const dateStr = formatDate(date);
    const dayOfWeek = date.getDay();
    const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6;

    const holidayName = holidayData.holidays[dateStr] || null;
    if (holidayName) {
      return { isHoliday: true, isWorkday: false, holidayName, isWeekend: false };
    }

    if (holidayData.workdaysOnWeekend.has(dateStr)) {
      return { isHoliday: false, isWorkday: true, holidayName: '调休', isWeekend: false };
    }

    if (isWeekendDay) {
      return { isHoliday: false, isWorkday: false, holidayName: null, isWeekend: true };
    }

    return { isHoliday: false, isWorkday: true, holidayName: null, isWeekend: false };
  };

  return (
    <HolidayContext.Provider value={{ ...holidayData, getDateStatus }}>
      {children}
    </HolidayContext.Provider>
  );
}
