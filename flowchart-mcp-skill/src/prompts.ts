/**
 * 提示词构建模块
 * 包含：标准系统提示词、精简提示词、金蝶业务单据列表
 */

export type Direction = 'vertical' | 'horizontal';

/**
 * 业务领域配置
 */
export interface DomainConfig {
  /** 领域名称，用于系统提示词中的角色定位 */
  name: string;
  /** 领域专用术语/单据名列表 */
  terms: string[];
  /** 补充的系统提示词（附加到默认提示词末尾） */
  extraPrompt?: string;
}

/** 金蝶云星辰默认领域配置 */
export const KINGDEE_DOMAIN: DomainConfig = {
  name: '金蝶云星辰业务流程专家',
  terms: [
    '采购申请单', '采购订单', '采购入库单', '采购发票', '付款单',
    '销售订单', '销售出库单', '销售发票', '收款单', '销售退货单',
    '生产领料单', '生产退料单', '产品入库单', '调拨单', '盘点单',
    '生产任务单', '生产工单', 'MRP运算', '计划订单', '委外加工单',
    '委外入库单', '凭证', '日记账', '应收应付单',
  ],
};

/** 通用领域配置（无特定业务术语） */
export const GENERIC_DOMAIN: DomainConfig = {
  name: '业务流程图专家',
  terms: [],
};

/**
 * 生成标准系统提示词
 */
export function buildSystemPrompt(direction: Direction, domain: DomainConfig = KINGDEE_DOMAIN): string {
  const layoutRule = direction === 'horizontal'
    ? '横向布局：从左到右，主流程y=300居中，分支y=150/450，节点水平间距160px'
    : '纵向布局：从上到下，主流程x=400居中，分支x=200/600，节点垂直间距110px';

  const termsLine = domain.terms.length > 0
    ? `\n\n${domain.name}单据：${domain.terms.join('/')}`
    : '';

  const extraLine = domain.extraPrompt ? `\n\n${domain.extraPrompt}` : '';

  return `你是${domain.name}，生成draw.io流程图XML。

规则：
1.只输出完整mxGraphModel XML，无解释无Markdown
2.${layoutRule}
3.节点尺寸：开始/结束120x80，判断100x100，单据160x60，处理140x60
4.分支对称，条件用value标注在连线上
5.连线style含edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;
6.禁止edge中定义points数组，判断节点出边设不同exitX/exitY
7.输出紧凑XML，无需缩进换行，id用简短数字

样式：
开始/结束：ellipse;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;fontSize=12;
单据：rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=11;
判断：diamond;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=11;
处理：rounded=0;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;fontSize=11;
${termsLine}${extraLine}

直接输出XML：`;
}

/**
 * 生成精简版提示词（重试时使用）
 */
export function buildCompactPrompt(direction: Direction): string {
  const layoutRule = direction === 'horizontal' ? '横向，左到右' : '纵向，上到下';
  return `生成draw.io流程图XML。${layoutRule}。只输出mxGraphModel XML，无缩进无换行无解释。节点样式：开始/结束=ellipse fillColor=#f5f5f5;单据=rounded fillColor=#dae8fc;判断=diamond fillColor=#fff2cc;处理=矩形 fillColor=#e1d5e7。连线用orthogonalEdgeStyle。`;
}
