import { NextRequest, NextResponse } from 'next/server';
import { dbGetCustomerById, dbUpdateCustomer, dbDeleteCustomer, dbGetCommissionRecords } from '@/services/dbService';
import { getCurrentUserInfo } from '@/lib/serverAuth';

// 获取单个客户详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await dbGetCustomerById(id);

    if (!data) {
      return NextResponse.json({ error: '客户不存在' }, { status: 404 });
    }

    // 数据隔离：非管理员只能查看自己负责的客户
    const userInfo = await getCurrentUserInfo(request);
    if (userInfo?.role !== 'admin' && data.user_id !== userInfo?.id) {
      return NextResponse.json({ error: '无权访问此客户' }, { status: 403 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('获取客户详情失败:', error);
    return NextResponse.json({ error: '获取客户详情失败' }, { status: 500 });
  }
}

// 更新客户
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 数据隔离：验证权限
    const userInfo = await getCurrentUserInfo(request);
    const existing = await dbGetCustomerById(id);
    if (!existing) {
      return NextResponse.json({ error: '客户不存在' }, { status: 404 });
    }
    if (userInfo?.role !== 'admin' && existing.user_id !== userInfo?.id) {
      return NextResponse.json({ error: '无权修改此客户' }, { status: 403 });
    }

    const body = await request.json();

    // 处理 modules 字段：数据库要求 text[] 类型，前端可能传入字符串
    if (typeof body.modules === 'string' && body.modules.trim()) {
      body.modules = body.modules.split(/[+,，、\s]+/).map((s: string) => s.trim()).filter(Boolean);
    } else if (body.modules === '') {
      body.modules = null;
    }

    // status 有 NOT NULL 约束，空字符串时不更新该字段
    if (body.status === '' || body.status === null) {
      delete body.status;
    }

    // acceptance_status 为空字符串时不更新
    if (body.acceptance_status === '' || body.acceptance_status === null) {
      delete body.acceptance_status;
    }

    // 撤回验收时检查是否已有提成记录
    if (body.acceptance_status === 'not_accepted' && existing.acceptance_status === 'accepted') {
      const commissionRecords = await dbGetCommissionRecords({ customerId: id });
      if (commissionRecords.length > 0) {
        return NextResponse.json({ error: '该客户已有提成记录，无法撤回验收状态' }, { status: 400 });
      }
    }

    const data = await dbUpdateCustomer(id, body);

    if (!data) {
      return NextResponse.json({ error: '客户不存在' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('更新客户失败:', error);
    return NextResponse.json({ error: '更新客户失败' }, { status: 500 });
  }
}

// 删除客户
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 数据隔离：验证权限
    const userInfo = await getCurrentUserInfo(request);
    const existing = await dbGetCustomerById(id);
    if (!existing) {
      return NextResponse.json({ error: '客户不存在' }, { status: 404 });
    }
    if (userInfo?.role !== 'admin' && existing.user_id !== userInfo?.id) {
      return NextResponse.json({ error: '无权删除此客户' }, { status: 403 });
    }

    await dbDeleteCustomer(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除客户失败:', error);
    return NextResponse.json({ error: '删除客户失败' }, { status: 500 });
  }
}
