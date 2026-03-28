/**
 * 全局统计服务
 * 用于记录系统级别的统计数据（跨用户）
 * 
 * 注意：使用服务端内存存储，服务重启后数据会重置
 * 如需持久化，需要接入数据库
 */

// 流程图生成统计
interface FlowChartStats {
  totalGenerated: number;
  lastGeneratedAt: string | null;
}

// 内存存储
const globalStats: {
  flowchart: FlowChartStats;
} = {
  flowchart: {
    totalGenerated: 0,
    lastGeneratedAt: null,
  },
};

/**
 * 获取流程图生成统计
 */
export function getFlowChartStats(): FlowChartStats {
  return { ...globalStats.flowchart };
}

/**
 * 记录一次流程图生成
 */
export function recordFlowChartGenerated(): FlowChartStats {
  globalStats.flowchart.totalGenerated += 1;
  globalStats.flowchart.lastGeneratedAt = new Date().toISOString();
  return { ...globalStats.flowchart };
}

/**
 * 重置流程图统计（管理员使用）
 */
export function resetFlowChartStats(): FlowChartStats {
  globalStats.flowchart = {
    totalGenerated: 0,
    lastGeneratedAt: null,
  };
  return { ...globalStats.flowchart };
}
