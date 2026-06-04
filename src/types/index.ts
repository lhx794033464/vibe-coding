// 客户状态 - 文本字段，不再限制为固定选项
export type CustomerStatus = string;

// 产品版本 - 文本字段
export type ProductVersion = string;

// 产品模块 - 文本字段
export type ProductModule = string;

// 状态配置（仅用于已有数据的历史兼容显示）
export const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  not_online: { label: '未上线', color: 'text-red-700', bgColor: 'bg-red-100' },
  online_not_accepted: { label: '已上线未验收', color: 'text-yellow-700', bgColor: 'bg-yellow-100' },
  accepted: { label: '已验收', color: 'text-green-700', bgColor: 'bg-green-100' },
  not_going_online: { label: '不上线', color: 'text-gray-700', bgColor: 'bg-gray-100' },
  delayed_online: { label: '延期上线', color: 'text-orange-700', bgColor: 'bg-orange-100' },
  partially_online: { label: '部分上线', color: 'text-blue-700', bgColor: 'bg-blue-100' },
};

// 获取状态显示配置的辅助函数
export function getStatusDisplay(status: string): { label: string; color: string; bgColor: string } {
  if (STATUS_CONFIG[status]) return STATUS_CONFIG[status];
  // 自定义文本状态
  return { label: status, color: 'text-gray-700', bgColor: 'bg-gray-100' };
}

// 客户类型
export interface Customer {
  id: string;
  name: string;
  sales_order_no: string | null;
  implementation_order_no: string | null;
  implementation_fee: number | null;
  implementation_days: string | null; // numeric类型返回string
  opened_at: string | null;
  online_at: string | null;
  accepted_at: string | null;
  version: string | null;
  modules: string | null; // 改为文本字段
  industry: string | null;
  special_requirements: string | null;
  status: string; // 上线状态：online/not_online
  acceptance_status: string; // 验收状态：accepted/not_accepted
  last_follow_up_at: string | null;
  user_id: string;
  created_at: string;
  updated_at: string | null;
  // 新增字段
  delivery_consultant: string | null;
  salesperson: string | null; // 业务员
  implementation_type: string | null; // 实施类型
  delivery_deadline: string | null; // 交付期截止日
  is_online: string | null; // 是否上线
  apply_month: string | null; // 申请月
  dismissed: boolean | null; // 是否已解散
  acceptance_doc_key: string | null; // 验收单文件key
  commission_status: string; // 计提状态：已计提/未计提/部分计提
}

// 跟进记录类型
export interface FollowUpRecord {
  id: string;
  customer_id: string;
  follow_up_at: string;
  content: string;
  meeting_link: string | null;
  consumed_days: string | null; // numeric类型返回string
  is_accepted: boolean;
  signature_image_url: string | null;
  user_id: string;
  created_at: string;
}

// 看板统计数据
export interface DashboardStats {
  totalCustomers: number;
  onlineCustomers: number;
  acceptedCustomers: number;
  onlineRate: number;
  acceptanceRate: number;
  newCustomersThisMonth: number;
  totalImplementationDays: number;
  statusDistribution: Record<string, number>;
}

// 时间范围类型
export type TimeRange = 'year' | 'assessment' | 'all' | 'custom';

// 提成记录类型
export interface CommissionRecord {
  id: string;
  customer_id: string;
  amount: string; // 本次提成金额
  total_commission: string; // 应提总额
  paid_commission: string; // 已提金额
  remark: string | null;
  commission_month?: string; // 提成月份
  user_id: string;
  created_at: string;
}

// 提成计算配置
export const COMMISSION_CONFIG = {
  STANDARD_DAILY_RATE: 1500, // 标准实施费：1500元/天
  SINGLE_MODULE_RATE: 0.08, // 单模块提成比例：8%
  MULTI_MODULE_RATE: 0.11, // 多模块提成比例：11%
  FINANCE_DAILY_COMMISSION: 100, // 财务模块每天提成
  OTHER_MODULE_DAILY_COMMISSION: 200, // 其他模块每天提成
};

// 提成计算结果
export interface CommissionCalculation {
  customerId: string;
  customerName: string;
  implementationFee: number;
  implementationDays: number;
  modules: string;
  modulesLabel: string;
  standardFee: number; // 标准实施费
  feeRatio: number; // 实施费比例
  commissionType: 'percentage' | 'daily'; // 提成类型
  commissionRate?: number; // 提成比例
  totalCommission: number; // 应提总额
  paidCommission: number; // 已提金额
  remainingCommission: number; // 剩余提成
  isFullyPaid: boolean;
  records: CommissionRecord[];
  acceptedAt: string;
  // 按天计算时的人天信息
  financeMaxDays: number; // 财务模块可提人天
  otherMaxDays: number; // 其他模块可提人天
  totalMaxDays: number; // 总可提人天
  paidFinanceDays: number; // 已提财务人天
  paidOtherDays: number; // 已提其他人天
  paidDays: number; // 已提总人天
  remainingDays: number; // 剩余人天
}
