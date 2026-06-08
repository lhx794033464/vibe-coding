import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getCurrentUserInfo } from '@/lib/serverAuth';

export async function GET(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    const isAdmin = userInfo.role === 'admin';

    // Get all customers visible to the user
    let customerQuery = supabase.from('customers').select('opened_at, implementation_days, delivery_consultant, user_id');
    if (!isAdmin) {
      customerQuery = customerQuery.eq('user_id', userInfo.id);
    }

    const { data: customers, error: custError } = await customerQuery;
    if (custError) {
      return NextResponse.json({ error: '获取客户数据失败' }, { status: 500 });
    }

    // Get all active delivery consultants
    const { data: consultants, error: consError } = await supabase
      .from('users')
      .select('id, role_type, employment_status')
      .eq('role_type', '交付顾问')
      .eq('employment_status', '在职');

    if (consError) {
      return NextResponse.json({ error: '获取顾问数据失败' }, { status: 500 });
    }

    // Generate last 12 months
    const now = new Date();
    const months: { key: string; label: string; year: number; month: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `${d.getMonth() + 1}月`;
      months.push({ key, label, year: d.getFullYear(), month: d.getMonth() + 1 });
    }

    // Group customers by opened_at month
    const monthlyData = months.map(m => {
      const monthCustomers = (customers || []).filter(c => {
        if (!c.opened_at) return false;
        const openedDate = new Date(c.opened_at);
        // Handle various date formats
        if (isNaN(openedDate.getTime())) return false;
        return openedDate.getFullYear() === m.year && (openedDate.getMonth() + 1) === m.month;
      });

      const customerCount = monthCustomers.length;
      const totalDays = monthCustomers.reduce((sum, c) => {
        const days = typeof c.implementation_days === 'number' ? c.implementation_days : parseFloat(String(c.implementation_days || '0'));
        return sum + (isNaN(days) ? 0 : days);
      }, 0);

      // Active consultants in this month
      const activeConsultants = (consultants || []).length;
      const avgLoadRate = activeConsultants > 0 ? (totalDays / activeConsultants / 22) * 100 : 0;

      return {
        month: m.key,
        label: m.label,
        customerCount,
        totalDays: Math.round(totalDays),
        avgLoadRate: Math.round(avgLoadRate * 10) / 10,  // 1 decimal
      };
    });

    return NextResponse.json({
      success: true,
      data: monthlyData,
    });
  } catch (error) {
    console.error('获取月度趋势失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
