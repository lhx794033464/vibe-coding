// 客户状态类型
export type CustomerStatus = 
  | 'not_online'        // 未上线 - 红色
  | 'online_not_accepted' // 已上线未验收 - 黄色
  | 'accepted'          // 已验收 - 绿色
  | 'not_going_online'  // 不上线 - 灰色
  | 'delayed_online'    // 延期上线 - 橙色
  | 'partially_online'; // 部分上线 - 蓝色

// 产品版本类型
export type ProductVersion = 'standard' | 'professional' | 'flagship';

// 产品模块类型
export type ProductModule = 'finance' | 'inventory' | 'production' | 'reimbursement' | 'tax' | 'invoicing' | 'ordering' | 'retail' | 'outsourcing';

// 状态配置
export const STATUS_CONFIG: Record<CustomerStatus, { label: string; color: string; bgColor: string }> = {
  not_online: { label: '未上线', color: 'text-red-700', bgColor: 'bg-red-100' },
  online_not_accepted: { label: '已上线未验收', color: 'text-yellow-700', bgColor: 'bg-yellow-100' },
  accepted: { label: '已验收', color: 'text-green-700', bgColor: 'bg-green-100' },
  not_going_online: { label: '不上线', color: 'text-gray-700', bgColor: 'bg-gray-100' },
  delayed_online: { label: '延期上线', color: 'text-orange-700', bgColor: 'bg-orange-100' },
  partially_online: { label: '部分上线', color: 'text-blue-700', bgColor: 'bg-blue-100' },
};

// 版本配置
export const VERSION_CONFIG: Record<ProductVersion, { label: string; color: string }> = {
  standard: { label: '标准版', color: 'bg-blue-100 text-blue-700' },
  professional: { label: '专业版', color: 'bg-purple-100 text-purple-700' },
  flagship: { label: '旗舰版', color: 'bg-amber-100 text-amber-700' },
};

// 模块配置
export const MODULE_CONFIG: Record<ProductModule, { label: string }> = {
  finance: { label: '财务' },
  inventory: { label: '进销存' },
  production: { label: '生产' },
  reimbursement: { label: '报销' },
  tax: { label: '纳税' },
  invoicing: { label: '开票' },
  ordering: { label: '订货' },
  retail: { label: '零售' },
  outsourcing: { label: '委外' },
};

// 模块选项列表（用于表单选择）
export const MODULE_OPTIONS: { value: ProductModule; label: string }[] = [
  { value: 'finance', label: '财务' },
  { value: 'inventory', label: '进销存' },
  { value: 'production', label: '生产' },
  { value: 'reimbursement', label: '报销' },
  { value: 'tax', label: '纳税' },
  { value: 'invoicing', label: '开票' },
  { value: 'ordering', label: '订货' },
  { value: 'retail', label: '零售' },
  { value: 'outsourcing', label: '委外' },
];

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
  version: ProductVersion | null;
  modules: ProductModule[] | null;
  industry: string | null;
  special_requirements: string | null;
  status: CustomerStatus;
  last_follow_up_at: string | null;
  user_id: string;
  created_at: string;
  updated_at: string | null;
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
  statusDistribution: Record<CustomerStatus, number>;
}

// 时间范围类型
export type TimeRange = 'month' | 'year' | 'all';

// 行业选项
export const INDUSTRY_OPTIONS = [
  '制造业',
  '零售业',
  '金融业',
  '教育行业',
  '医疗健康',
  '餐饮服务',
  '物流运输',
  '建筑房地产',
  'IT互联网',
  '政府机关',
  '其他',
];

// 提成记录类型
export interface CommissionRecord {
  id: string;
  customer_id: string;
  amount: string; // 本次提成金额
  total_commission: string; // 应提总额
  paid_commission: string; // 已提金额
  remark: string | null;
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
  modules: ProductModule[];
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

