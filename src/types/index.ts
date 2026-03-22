// 客户状态类型
export type CustomerStatus = 
  | 'not_online'        // 未上线 - 红色
  | 'online_not_accepted' // 已上线未验收 - 黄色
  | 'accepted'          // 已验收 - 绿色
  | 'not_going_online'  // 不上线 - 灰色
  | 'delayed_online'    // 延期上线 - 橙色
  | 'partially_online'; // 部分上线 - 蓝色

// 状态配置
export const STATUS_CONFIG: Record<CustomerStatus, { label: string; color: string; bgColor: string }> = {
  not_online: { label: '未上线', color: 'text-red-700', bgColor: 'bg-red-100' },
  online_not_accepted: { label: '已上线未验收', color: 'text-yellow-700', bgColor: 'bg-yellow-100' },
  accepted: { label: '已验收', color: 'text-green-700', bgColor: 'bg-green-100' },
  not_going_online: { label: '不上线', color: 'text-gray-700', bgColor: 'bg-gray-100' },
  delayed_online: { label: '延期上线', color: 'text-orange-700', bgColor: 'bg-orange-100' },
  partially_online: { label: '部分上线', color: 'text-blue-700', bgColor: 'bg-blue-100' },
};

// 客户类型
export interface Customer {
  id: string;
  name: string;
  sales_order_no: string | null;
  implementation_order_no: string | null;
  product_amount: number | null;
  implementation_days: number | null;
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
export type TimeRange = 'month' | 'quarter' | 'year';

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
