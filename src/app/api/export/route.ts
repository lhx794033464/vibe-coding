import { NextRequest, NextResponse } from 'next/server';
import { dbGetCustomers } from '@/services/dbService';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { getCurrentUserInfo } from '@/lib/serverAuth';

// 导出客户数据
export async function GET(request: NextRequest) {
  try {
    const userInfo = await getCurrentUserInfo(request);
    const isAdmin = userInfo?.role === 'admin';

    const customers = await dbGetCustomers({ userId: userInfo?.id, isAdmin });

    const statusMap: Record<string, string> = {
      'not_online': '未上线',
      'online_not_accepted': '已上线未验收',
      'accepted': '已验收',
      'not_going_online': '不上线',
      'delayed_online': '延期上线',
      'partially_online': '部分上线',
    };

    const exportData = customers.map((c: any) => ({
      '客户名称': c.name,
      '销售订单号': c.sales_order_no || '',
      '实施订单号': c.implementation_order_no || '',
      '实施费': c.implementation_fee || '',
      '实施人天': c.implementation_days || '',
      '开通时间': c.opened_at ? format(new Date(c.opened_at), 'yyyy-MM-dd') : '',
      '产品版本': c.version || '',
      '产品模块': c.modules ? c.modules.map((m: string) => String(m)).join('、') : '',
      '项目备注': c.industry || '',
      '特殊要求': c.special_requirements || '',
      '状态': statusMap[c.status] || c.status,
      '最后跟进时间': c.last_follow_up_at || '',
      '创建时间': c.created_at,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '客户数据');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`customers_${Date.now()}.xlsx`)}`,
      },
    });
  } catch (error) {
    console.error('导出失败:', error);
    return NextResponse.json({ error: '导出失败' }, { status: 500 });
  }
}
