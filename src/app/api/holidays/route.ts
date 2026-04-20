import { NextRequest, NextResponse } from 'next/server';

// 内存缓存，避免频繁请求外部API
const cache: Record<number, { data: HolidayData; timestamp: number }> = {};
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24小时缓存

interface HolidayInfo {
  holiday: boolean;  // 是否为假日
  name: string;      // 假日名称
  wage: number;      // 加倍工资天数
  date: string;      // 日期
}

interface HolidayData {
  holidays: Record<string, string>;     // 放假日 → 假日名称
  workdaysOnWeekend: string[];          // 周末补班日
}

/**
 * 从 timor.tech 获取国务院颁布的法定假日安排
 * 数据来源：http://www.gov.cn/zhengce/content/（国务院办公厅通知）
 */
async function fetchHolidayData(year: number): Promise<HolidayData> {
  const url = `https://timor.tech/api/holiday/year/${year}`;
  
  const response = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`Holiday API returned ${response.status}`);
  }

  const result = await response.json();
  
  if (result.code !== 0 || !result.holiday) {
    throw new Error('Invalid holiday API response');
  }

  const holidays: Record<string, string> = {};
  const workdaysOnWeekend: string[] = [];

  for (const [, info] of Object.entries(result.holiday as Record<string, HolidayInfo>)) {
    if (info.holiday) {
      // 放假日
      holidays[info.date] = info.name;
    } else {
      // 调休上班日（周末补班）
      workdaysOnWeekend.push(info.date);
    }
  }

  return { holidays, workdaysOnWeekend };
}

// GET /api/holidays?year=2025
export async function GET(request: NextRequest) {
  try {
    const yearParam = request.nextUrl.searchParams.get('year');
    const currentYear = new Date().getFullYear();
    const years = yearParam 
      ? yearParam.split(',').map(Number).filter(y => y >= 2020 && y <= 2030)
      : [currentYear - 1, currentYear, currentYear + 1];

    const result: Record<number, HolidayData> = {};

    for (const year of years) {
      // 检查缓存
      const cached = cache[year];
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        result[year] = cached.data;
        continue;
      }

      try {
        const data = await fetchHolidayData(year);
        cache[year] = { data, timestamp: Date.now() };
        result[year] = data;
      } catch (err) {
        console.error(`获取${year}年假日数据失败:`, err);
        // 如果有旧缓存则使用旧缓存
        if (cached) {
          result[year] = cached.data;
        }
        // 否则跳过该年份
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('获取假日数据失败:', error);
    return NextResponse.json({ error: '获取假日数据失败' }, { status: 500 });
  }
}
