import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserInfo } from '@/lib/serverAuth';
import { LLMClient, Config } from 'coze-coding-dev-sdk';

// ==================== 泳道式流程图方法论 ====================

const SYSTEM_PROMPT = `你是一位专业的业务流程分析专家，擅长将业务描述转化为结构化的泳道式流程图。

## 核心方法论

### 1. 角色识别
从业务描述中识别所有参与角色（部门/岗位/系统），每个角色对应一条泳道。
角色识别原则：
- 只提取**直接执行动作**的角色，不提取仅被提及的角色
- 角色粒度适中：如"财务部"比"财务部-张三"更合适
- 系统角色也算泳道：如"ERP系统"、"OA系统"

### 2. 动作拆解
将每个业务步骤拆解为：谁（角色）做什么（动作），结果是什么（输出）
- 每个节点必须是明确的动作，不能是模糊的描述
- 节点命名规范：动词+名词，如"审核申请"、"生成采购单"
- 判断节点必须明确条件，如"金额>5000？"

### 3. 流程类型识别
- **顺序流程**：步骤依次执行
- **分支流程**：根据条件走不同路径（判断节点后分叉）
- **并行流程**：多个步骤同时执行
- **回退流程**：审批不通过等场景需回到上游步骤

### 4. 泳道布局规则
- 水平布局：泳道从上到下排列，流程从左到右流动
- 每个泳道高度固定，节点在对应泳道内水平排列
- 跨泳道的箭头表示角色间的交互
- 判断节点用菱形，动作节点用圆角矩形，开始/结束用圆形

## 输出格式

严格输出以下 JSON 结构，不要输出任何其他内容：

\`\`\`json
{
  "title": "流程图标题",
  "lanes": [
    { "id": "lane1", "name": "角色名称", "order": 1 },
    { "id": "lane2", "name": "角色名称", "order": 2 }
  ],
  "nodes": [
    { "id": "start", "type": "start", "label": "开始", "lane": "lane1" },
    { "id": "n1", "type": "action", "label": "动作描述", "lane": "lane1" },
    { "id": "n2", "type": "decision", "label": "判断条件？", "lane": "lane2" },
    { "id": "end", "type": "end", "label": "结束", "lane": "lane1" }
  ],
  "edges": [
    { "from": "start", "to": "n1" },
    { "from": "n1", "to": "n2" },
    { "from": "n2", "to": "n1", "label": "否" },
    { "from": "n2", "to": "end", "label": "是" }
  ]
}
\`\`\`

### 节点类型说明
- \`start\`: 开始节点（圆形）
- \`end\`: 结束节点（圆形）
- \`action\`: 动作节点（圆角矩形）
- \`decision\`: 判断节点（菱形）

### 规则
1. 必须有且仅有一个 start 节点和一个或多个 end 节点
2. 每个节点必须归属于一个泳道（lane）
3. edge 的 label 仅用于判断节点的分支标注
4. 节点 ID 必须唯一，edge 的 from/to 必须引用有效的节点 ID
5. 回退流程通过 edge 的 from 指向上游节点实现
6. 并行流程通过一个节点指向多个下一节点实现`;

// ==================== XML 生成 ====================

// 泳道配色方案（柔和商务风）
const LANE_COLORS = [
  { bg: '#E3F2FD', header: '#1565C0', headerText: '#FFFFFF' }, // 蓝色系
  { bg: '#E8F5E9', header: '#2E7D32', headerText: '#FFFFFF' }, // 绿色系
  { bg: '#FFF3E0', header: '#E65100', headerText: '#FFFFFF' }, // 橙色系
  { bg: '#F3E5F5', header: '#6A1B9A', headerText: '#FFFFFF' }, // 紫色系
  { bg: '#E0F2F1', header: '#00695C', headerText: '#FFFFFF' }, // 青色系
  { bg: '#FBE9E7', header: '#BF360C', headerText: '#FFFFFF' }, // 红色系
];

const LANE_HEADER_WIDTH = 120;
const LANE_HEIGHT = 160;
const NODE_WIDTH = 160;
const NODE_HEIGHT = 50;
const DECISION_WIDTH = 120;
const DECISION_HEIGHT = 80;
const START_END_R = 22;
const H_GAP = 80;
const V_GAP = 20;
const MARGIN_LEFT = 40;

interface ParsedFlow {
  title: string;
  lanes: { id: string; name: string; order: number }[];
  nodes: { id: string; type: string; label: string; lane: string }[];
  edges: { from: string; to: string; label?: string }[];
}

function buildDrawioXml(flow: ParsedFlow): string {
  const { title, lanes, nodes, edges } = flow;
  const sortedLanes = [...lanes].sort((a, b) => a.order - b.order);

  // 计算每个泳道的 Y 偏移
  const laneYMap: Record<string, number> = {};
  let yOff = 0;
  for (const lane of sortedLanes) {
    laneYMap[lane.id] = yOff;
    yOff += LANE_HEIGHT;
  }
  const totalHeight = yOff;

  // 计算节点的列位置（拓扑排序 + 层级分配）
  const nodeLaneMap: Record<string, string> = {};
  const nodeTypeMap: Record<string, string> = {};
  const nodeLabelMap: Record<string, string> = {};
  for (const n of nodes) {
    nodeLaneMap[n.id] = n.lane;
    nodeTypeMap[n.id] = n.type;
    nodeLabelMap[n.id] = n.label;
  }

  // 简单层级分配：BFS 从 start 节点开始
  const adjForward: Record<string, string[]> = {};
  const adjBackward: Record<string, string[]> = {};
  for (const e of edges) {
    if (!adjForward[e.from]) adjForward[e.from] = [];
    adjForward[e.from].push(e.to);
    if (!adjBackward[e.to]) adjBackward[e.to] = [];
    adjBackward[e.to].push(e.from);
  }

  // 拓扑层级
  const nodeLevel: Record<string, number> = {};
  const startNode = nodes.find(n => n.type === 'start');
  if (!startNode) return '<mxfile><diagram name="Error"><mxCell id="0"/></diagram></mxfile>';

  // BFS 分配层级
  const queue: string[] = [startNode.id];
  nodeLevel[startNode.id] = 0;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const nexts = adjForward[cur] || [];
    for (const next of nexts) {
      const newLevel = nodeLevel[cur] + 1;
      if (nodeLevel[next] === undefined || nodeLevel[next] < newLevel) {
        nodeLevel[next] = newLevel;
        queue.push(next);
      }
    }
  }

  // 为未分配层级的节点（回退边目标）分配层级
  for (const n of nodes) {
    if (nodeLevel[n.id] === undefined) {
      nodeLevel[n.id] = 0;
    }
  }

  // 按层级分组，同层内按泳道排序
  const maxLevel = Math.max(...Object.values(nodeLevel), 0);
  const levelNodes: string[][] = [];
  for (let i = 0; i <= maxLevel; i++) {
    levelNodes[i] = nodes
      .filter(n => nodeLevel[n.id] === i)
      .sort((a, b) => {
        const laneA = sortedLanes.findIndex(l => l.id === a.lane);
        const laneB = sortedLanes.findIndex(l => l.id === b.lane);
        return laneA - laneB;
      })
      .map(n => n.id);
  }

  // 节点坐标
  const nodeXMap: Record<string, number> = {};
  const nodeYMap: Record<string, number> = {};

  // 将同层节点在泳道内均匀分布
  const totalWidth = MARGIN_LEFT + (maxLevel + 1) * (NODE_WIDTH + H_GAP) + H_GAP;
  for (let lv = 0; lv <= maxLevel; lv++) {
    const x = MARGIN_LEFT + LANE_HEADER_WIDTH + lv * (NODE_WIDTH + H_GAP);
    for (const nid of levelNodes[lv]) {
      nodeXMap[nid] = x;
      const laneIdx = sortedLanes.findIndex(l => l.id === nodeLaneMap[nid]);
      nodeYMap[nid] = laneYMap[nodeLaneMap[nid]] + LANE_HEIGHT / 2;
    }
  }

  // ---- 构建 XML ----
  let cellIndex = 1;
  const cells: string[] = [];

  // 根单元格
  cells.push(`<mxCell id="0"/>`);
  cells.push(`<mxCell id="1" parent="0"/>`);

  // 标题
  cells.push(`<mxCell id="title" value="${escapeXml(title)}" style="text;html=1;align=center;verticalAlign=middle;resizable=0;points=[];autosize=1;strokeColor=none;fillColor=none;fontSize=18;fontStyle=1;fontColor=#333333;" vertex="1" parent="1">
    <mxGeometry x="${MARGIN_LEFT}" y="10" width="${totalWidth}" height="40" as="geometry"/>
  </mxCell>`);

  // 泳道背景
  for (let i = 0; i < sortedLanes.length; i++) {
    const lane = sortedLanes[i];
    const color = LANE_COLORS[i % LANE_COLORS.length];
    const y = laneYMap[lane.id] + 50; // 50px 给标题

    // 泳道头部
    const headerId = `lane-header-${lane.id}`;
    cells.push(`<mxCell id="${headerId}" value="${escapeXml(lane.name)}" style="shape=mxgraph.flowchart.annotation_2;rounded=1;fillColor=${color.header};strokeColor=none;fontColor=${color.headerText};fontSize=13;fontStyle=1;align=center;verticalAlign=middle;whiteSpace=wrap;labelPosition=center;verticalLabelPosition=middle;" vertex="1" parent="1">
      <mxGeometry x="${MARGIN_LEFT}" y="${y}" width="${LANE_HEADER_WIDTH}" height="${LANE_HEIGHT - 2}" as="geometry"/>
    </mxCell>`);

    // 泳道主体
    const bodyId = `lane-body-${lane.id}`;
    cells.push(`<mxCell id="${bodyId}" value="" style="rounded=1;whiteSpace=wrap;fillColor=${color.bg};strokeColor=${color.header};strokeWidth=1;opacity=40;arcSize=6;" vertex="1" parent="1">
      <mxGeometry x="${MARGIN_LEFT + LANE_HEADER_WIDTH}" y="${y}" width="${totalWidth - MARGIN_LEFT - LANE_HEADER_WIDTH - 20}" height="${LANE_HEIGHT - 2}" as="geometry"/>
    </mxCell>`);
  }

  // 节点
  for (const n of nodes) {
    const x = nodeXMap[n.id];
    const y = nodeYMap[n.id] + 50 - 10; // 50 for title offset, adjust centering
    const laneIdx = Math.max(0, sortedLanes.findIndex(l => l.id === n.lane));
    const color = LANE_COLORS[laneIdx % LANE_COLORS.length] || LANE_COLORS[0];
    let style = '';
    let geoW = NODE_WIDTH;
    let geoH = NODE_HEIGHT;
    let geoX = x;
    let geoY = y - NODE_HEIGHT / 2;

    switch (n.type) {
      case 'start':
        style = `ellipse;whiteSpace=wrap;html=1;fillColor=${color.header};strokeColor=${color.header};fontColor=#FFFFFF;fontSize=12;fontStyle=1;arcSize=50;`;
        geoW = START_END_R * 2;
        geoH = START_END_R * 2;
        geoX = x + (NODE_WIDTH - geoW) / 2;
        geoY = y - geoH / 2;
        break;
      case 'end':
        style = `ellipse;whiteSpace=wrap;html=1;fillColor=#E53935;strokeColor=#C62828;fontColor=#FFFFFF;fontSize=12;fontStyle=1;arcSize=50;`;
        geoW = START_END_R * 2;
        geoH = START_END_R * 2;
        geoX = x + (NODE_WIDTH - geoW) / 2;
        geoY = y - geoH / 2;
        break;
      case 'decision':
        style = `rhombus;whiteSpace=wrap;html=1;fillColor=#FFF9C4;strokeColor=#F9A825;fontColor=#333333;fontSize=11;fontStyle=0;rounded=0;`;
        geoW = DECISION_WIDTH;
        geoH = DECISION_HEIGHT;
        geoX = x + (NODE_WIDTH - geoW) / 2;
        geoY = y - geoH / 2;
        break;
      case 'action':
      default:
        style = `rounded=1;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=${color.header};strokeWidth=2;fontColor=#333333;fontSize=12;arcSize=20;shadow=1;`;
        break;
    }

    cells.push(`<mxCell id="${n.id}" value="${escapeXml(n.label)}" style="${style}" vertex="1" parent="1">
      <mxGeometry x="${geoX}" y="${geoY}" width="${geoW}" height="${geoH}" as="geometry"/>
    </mxCell>`);
  }

  // 边（箭头）
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    const fromType = nodeTypeMap[e.from];
    const isBackEdge = nodeLevel[e.from] !== undefined && nodeLevel[e.to] !== undefined && nodeLevel[e.from] > nodeLevel[e.to];

    let edgeStyle = 'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#666666;fontColor=#333333;fontSize=10;';
    if (isBackEdge) {
      edgeStyle += 'dashed=1;dashPattern=5 3;strokeColor=#E53935;';
    }

    const labelAttr = e.label ? `value="${escapeXml(e.label)}"` : '';
    cells.push(`<mxCell id="edge-${i}" ${labelAttr} style="${edgeStyle}" edge="1" source="${e.from}" target="${e.to}" parent="1">
      <mxGeometry relative="1" position="0.5" as="geometry">
        <Array as="points"/>
      </mxGeometry>
    </mxCell>`);
  }

  const diagramW = totalWidth + 40;
  const diagramH = totalHeight + 80;

  return `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="2024-01-01T00:00:00.000Z" agent="AI-FlowChart" version="21.0.0" type="device">
  <diagram name="${escapeXml(title)}" id="swimlane-flow">
    <mxGraphModel dx="${diagramW}" dy="${diagramH}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="${diagramW}" pageHeight="${diagramH}" math="0" shadow="0">
      <root>
        ${cells.join('\n        ')}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ==================== API 处理 ====================

async function callLLM(prompt: string): Promise<string> {
  const config = new Config();
  const client = new LLMClient(config);

  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    { role: 'user' as const, content: prompt },
  ];

  console.log('[flow-chart] 开始调用 LLM...');

  // 使用 stream 方式收集完整响应（与 chat API 一致）
  const stream = client.stream(messages, { model: 'doubao-seed-2-0-lite-260215', temperature: 0.3 });
  let content = '';
  let charCount = 0;
  const MAX_CHARS = 8000; // 防止无限输出

  for await (const chunk of stream) {
    const text = chunk.content || '';
    if (text) {
      content += text;
      charCount += text.length;
      if (charCount > MAX_CHARS) {
        console.log('[flow-chart] 超过最大字符限制，停止收集');
        break;
      }
    }
  }

  console.log('[flow-chart] LLM 返回，长度:', content.length);

  if (!content) {
    throw new Error('LLM 返回内容为空');
  }

  return content;
}

function parseFlowFromLLM(raw: string): ParsedFlow {
  // 提取 JSON
  let jsonStr = raw;
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  // 尝试找到 JSON 对象
  const braceStart = jsonStr.indexOf('{');
  const braceEnd = jsonStr.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd !== -1) {
    jsonStr = jsonStr.substring(braceStart, braceEnd + 1);
  }

  try {
    const parsed = JSON.parse(jsonStr);

    // 校验必要字段
    if (!parsed.lanes || !Array.isArray(parsed.lanes) || parsed.lanes.length === 0) {
      throw new Error('缺少泳道(lanes)定义');
    }
    if (!parsed.nodes || !Array.isArray(parsed.nodes) || parsed.nodes.length === 0) {
      throw new Error('缺少节点(nodes)定义');
    }
    if (!parsed.edges || !Array.isArray(parsed.edges) || parsed.edges.length === 0) {
      throw new Error('缺少边(edges)定义');
    }

    // 确保 start 和 end 节点存在
    const hasStart = parsed.nodes.some((n: { type: string }) => n.type === 'start');
    const hasEnd = parsed.nodes.some((n: { type: string }) => n.type === 'end');
    if (!hasStart) {
      parsed.nodes.unshift({ id: 'start', type: 'start', label: '开始', lane: parsed.lanes[0].id });
      parsed.edges.unshift({ from: 'start', to: parsed.nodes[1]?.id || 'end' });
    }
    if (!hasEnd) {
      const lastLane = parsed.lanes[parsed.lanes.length - 1];
      parsed.nodes.push({ id: 'end', type: 'end', label: '结束', lane: lastLane.id });
    }

    return {
      title: parsed.title || '业务流程图',
      lanes: parsed.lanes,
      nodes: parsed.nodes,
      edges: parsed.edges,
    };
  } catch (e) {
    throw new Error(`JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    // 验证登录
    const userInfo = await getCurrentUserInfo(request);
    if (!userInfo) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const { prompt, direction } = body;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ error: '请输入流程图描述' }, { status: 400 });
    }

    console.log('[flow-chart] 收到请求, prompt:', prompt.substring(0, 50));

    // 构造用户提示
    const userPrompt = direction === 'horizontal'
      ? `请为以下业务描述生成水平方向的泳道式流程图（泳道从左到右排列，流程从上到下流动）：\n\n${prompt.trim()}`
      : `请为以下业务描述生成垂直方向的泳道式流程图（泳道从上到下排列，流程从左到右流动）：\n\n${prompt.trim()}`;

    // 调用 LLM
    const llmRaw = await callLLM(userPrompt);
    console.log('[flow-chart] LLM 调用完成');

    // 解析 LLM 输出
    const flow = parseFlowFromLLM(llmRaw);
    console.log('[flow-chart] 解析完成, lanes:', flow.lanes.length, 'nodes:', flow.nodes.length);

    // 生成 drawio XML
    const xml = buildDrawioXml(flow);
    console.log('[flow-chart] XML 生成完成, 长度:', xml.length);

    return NextResponse.json({
      success: true,
      xml,
      title: flow.title,
      meta: {
        laneCount: flow.lanes.length,
        nodeCount: flow.nodes.length,
        edgeCount: flow.edges.length,
      },
    });
  } catch (error) {
    console.error('流程图生成错误:', error);
    const message = error instanceof Error ? error.message : '生成失败';
    return NextResponse.json(
      { error: '流程图生成失败', detail: message },
      { status: 500 }
    );
  }
}
