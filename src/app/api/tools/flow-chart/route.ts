import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import ELK from 'elkjs';

// Mermaid 节点样式映射
const NODE_STYLES: Record<string, string> = {
  'default': 'rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=11;',
  'start': 'ellipse;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;fontSize=12;',
  'end': 'ellipse;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;fontSize=12;',
  'process': 'rounded=0;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;fontSize=11;',
  'decision': 'diamond;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=11;',
};

// 节点尺寸配置
const NODE_SIZES: Record<string, { width: number; height: number }> = {
  'default': { width: 160, height: 60 },
  'start': { width: 120, height: 60 },
  'end': { width: 120, height: 60 },
  'process': { width: 140, height: 60 },
  'decision': { width: 100, height: 100 },
};

// 使用 ELK 进行自动布局
async function applyElkLayout(
  nodes: Map<string, { text: string; type: string }>,
  edges: { from: string; to: string; label?: string }[],
  direction: 'vertical' | 'horizontal'
): Promise<Map<string, { x: number; y: number }>> {
  const elk = new ELK();
  
  // 构建 ELK 图结构
  const elkNodes = Array.from(nodes.entries()).map(([id, node]) => ({
    id,
    width: NODE_SIZES[node.type]?.width || NODE_SIZES['default'].width,
    height: NODE_SIZES[node.type]?.height || NODE_SIZES['default'].height,
  }));
  
  const elkEdges = edges.map((edge, index) => ({
    id: `e${index}`,
    sources: [edge.from],
    targets: [edge.to],
  }));
  
  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction === 'horizontal' ? 'RIGHT' : 'DOWN',
      'elk.spacing.nodeNode': '80',
      'elk.layered.spacing.nodeNodeBetweenLayers': '100',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.edgeRouting.splines.mode': 'CONVOLUTED_HULL',
    },
    children: elkNodes,
    edges: elkEdges,
  };
  
  try {
    const layout = await elk.layout(graph);
    
    const positions = new Map<string, { x: number; y: number }>();
    
    // 添加偏移量使图形居中
    const offsetX = 80;
    const offsetY = 80;
    
    layout.children?.forEach((node: any) => {
      positions.set(node.id, {
        x: (node.x || 0) + offsetX,
        y: (node.y || 0) + offsetY,
      });
    });
    
    return positions;
  } catch (error) {
    console.error('ELK 布局失败:', error);
    // 失败时返回空 Map，使用备用布局
    return new Map();
  }
}

// 备用简单布局（当 ELK 失败时使用）
function applySimpleLayout(
  nodes: Map<string, { text: string; type: string }>,
  edges: { from: string; to: string; label?: string }[],
  direction: 'vertical' | 'horizontal'
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const startX = 80;
  const startY = 80;
  const hSpacing = direction === 'horizontal' ? 200 : 220;
  const vSpacing = direction === 'horizontal' ? 120 : 100;
  
  // 计算层级
  const levels = new Map<string, number>();
  const visited = new Set<string>();
  const queue: string[] = [];
  
  // 找到起始节点（没有入边的节点）
  nodes.forEach((_, id) => {
    const hasIncoming = edges.some(e => e.to === id);
    if (!hasIncoming) {
      levels.set(id, 0);
      queue.push(id);
    }
  });
  
  // BFS 计算层级
  while (queue.length > 0) {
    const current = queue.shift()!;
    visited.add(current);
    const currentLevel = levels.get(current) || 0;
    
    edges.filter(e => e.from === current).forEach(e => {
      const nextLevel = Math.max(levels.get(e.to) || 0, currentLevel + 1);
      levels.set(e.to, nextLevel);
      if (!visited.has(e.to) && !queue.includes(e.to)) {
        queue.push(e.to);
      }
    });
  }
  
  // 为未访问的节点分配层级
  nodes.forEach((_, id) => {
    if (!levels.has(id)) levels.set(id, 0);
  });
  
  // 计算每层的节点数
  const levelCounts = new Map<number, number>();
  levels.forEach((level) => {
    levelCounts.set(level, (levelCounts.get(level) || 0) + 1);
  });
  
  const levelIndices = new Map<number, number>();
  
  // 设置坐标
  nodes.forEach((_, id) => {
    const level = levels.get(id) || 0;
    const count = levelCounts.get(level) || 1;
    const index = levelIndices.get(level) || 0;
    levelIndices.set(level, index + 1);
    
    if (direction === 'horizontal') {
      positions.set(id, {
        x: startX + level * hSpacing,
        y: startY + (index - (count - 1) / 2) * vSpacing,
      });
    } else {
      positions.set(id, {
        x: startX + (index - (count - 1) / 2) * hSpacing,
        y: startY + level * vSpacing,
      });
    }
  });
  
  return positions;
}

// Mermaid 解析器
function parseMermaid(mermaidCode: string): {
  nodes: Map<string, { text: string; type: string }>;
  edges: { from: string; to: string; label?: string }[];
} {
  const lines = mermaidCode.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));
  
  const nodes = new Map<string, { text: string; type: string }>();
  const edges: { from: string; to: string; label?: string }[] = [];
  
  const getNodeId = (id: string) => {
    if (!nodes.has(id)) {
      nodes.set(id, { text: id, type: 'default' });
    }
    return id;
  };
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.startsWith('style') || line.startsWith('subgraph') || line.startsWith('end')) continue;
    
    // 解析节点定义
    const nodeDefMatch = line.match(/^(\w+)\s*([\[(\{])(.+?)[\]\)\}]/);
    if (nodeDefMatch && !line.includes('-->')) {
      const [, id, bracketType, text] = nodeDefMatch;
      let type = 'default';
      if (bracketType === '(') type = 'start';
      else if (bracketType === '{') type = 'decision';
      
      const node = nodes.get(id) || { text, type };
      node.text = text.replace(/"/g, '');
      node.type = type;
      nodes.set(id, node);
      continue;
    }
    
    // 解析连接
    const edgeMatch = line.match(/([\w\(\[\{][\w\s\[\]\(\)\{\}"]*)\s*(-->\||--)\s*(?:\|"?([^|]+)"?\|)?\s*([\w\(\[\{][\w\s\[\]\(\)\{\}"]*)/);
    if (edgeMatch) {
      const [, fromPart, , label, toPart] = edgeMatch;
      
      const extractNode = (part: string) => {
        const defMatch = part.match(/^(\w+)\s*([\[(\{])/);
        if (defMatch) {
          const [, id, bracketType] = defMatch;
          const textMatch = part.match(/[\[(\{](.+?)[\]\)\}]/);
          const text = textMatch ? textMatch[1].replace(/"/g, '') : id;
          
          let type = 'default';
          if (bracketType === '(') type = 'start';
          else if (bracketType === '{') type = 'decision';
          
          if (!nodes.has(id)) {
            nodes.set(id, { text, type });
          }
          return id;
        }
        const id = part.trim();
        getNodeId(id);
        return id;
      };
      
      const fromId = extractNode(fromPart);
      const toId = extractNode(toPart);
      
      edges.push({ from: fromId, to: toId, label: label?.trim() });
    }
  }
  
  return { nodes, edges };
}

// 生成 draw.io XML
function generateDrawIOXML(
  nodes: Map<string, { text: string; type: string }>,
  edges: { from: string; to: string; label?: string }[],
  positions: Map<string, { x: number; y: number }>
): string {
  let xml = `<mxGraphModel dx="800" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100">
  <root>
    <mxCell id="0" />
    <mxCell id="1" parent="0" />`;
  
  let cellId = 2;
  const nodeIdMap = new Map<string, number>();
  
  // 生成节点
  nodes.forEach((node, id) => {
    const pos = positions.get(id) || { x: 80, y: 80 };
    const style = NODE_STYLES[node.type] || NODE_STYLES['default'];
    const size = NODE_SIZES[node.type] || NODE_SIZES['default'];
    
    xml += `
    <mxCell id="${cellId}" value="${escapeXml(node.text)}" style="${style}" vertex="1" parent="1">
      <mxGeometry x="${pos.x}" y="${pos.y}" width="${size.width}" height="${size.height}" as="geometry" />
    </mxCell>`;
    
    nodeIdMap.set(id, cellId);
    cellId++;
  });
  
  // 生成连线
  edges.forEach(edge => {
    const sourceId = nodeIdMap.get(edge.from);
    const targetId = nodeIdMap.get(edge.to);
    if (sourceId && targetId) {
      xml += `
    <mxCell id="${cellId}" value="${edge.label ? escapeXml(edge.label) : ''}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;" edge="1" parent="1" source="${sourceId}" target="${targetId}">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>`;
      cellId++;
    }
  });
  
  xml += `
  </root>
</mxGraphModel>`;
  
  return xml;
}

function getEmptyXML(): string {
  return `<mxGraphModel dx="800" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100">
  <root>
    <mxCell id="0" />
    <mxCell id="1" parent="0" />
  </root>
</mxGraphModel>`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function POST(request: NextRequest) {
  try {
    const { prompt, direction = 'vertical' } = await request.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: '缺少流程图描述' },
        { status: 400 }
      );
    }

    const mermaidDirection = direction === 'horizontal' ? 'LR' : 'TD';

    const systemPrompt = `根据用户描述生成 Mermaid 流程图代码。

【语法要求】
- 必须以大写字母 GRAPH 开头，后跟方向 TD（纵向）或 LR（横向）
- 每个节点格式：
  - 开始结束: ID(["文本"])  例如：START(["开始"])
  - 处理步骤: ID["文本"]    例如：INPUT["输入数据"]  
  - 判断分支: ID{"文本"}    例如：CHECK{"是否有效"}
- 连接格式：SOURCE --> TARGET 或 SOURCE -->|"标签"| TARGET

【示例】
GRAPH TD
    START(["开始"]) --> INPUT["输入数据"]
    INPUT --> CHECK{"检查格式"}
    CHECK -->|"有效"| PROCESS["处理数据"]
    CHECK -->|"无效"| ERROR["报错"]
    PROCESS --> END1(["结束"])
    ERROR --> END1

【输出规则】
仅输出 Mermaid 代码，不要任何解释、不要 Markdown 代码块标记（\`\`\`）。`;

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: prompt }
    ];

    const response = await client.invoke(messages, {
      model: 'doubao-seed-2-0-pro-260215',
      temperature: 0.1,
    });

    let mermaidCode = response.content?.trim() || '';
    console.log('原始 Mermaid 代码:\n', mermaidCode.substring(0, 1000));

    // 清理 Markdown 代码块
    if (mermaidCode.startsWith('```')) {
      mermaidCode = mermaidCode.replace(/^```\w*\n?/, '');
      mermaidCode = mermaidCode.replace(/```$/, '');
      mermaidCode = mermaidCode.trim();
    }

    // 验证格式
    if (!mermaidCode.match(/^GRAPH\s+(TD|TB|LR|RL|BT)/im)) {
      console.error('返回内容不是有效的 Mermaid 代码:', mermaidCode.substring(0, 200));
      return NextResponse.json(
        { error: '生成的流程图格式不正确' },
        { status: 500 }
      );
    }

    // 解析 Mermaid
    const { nodes, edges } = parseMermaid(mermaidCode);
    
    if (nodes.size === 0) {
      return NextResponse.json({ 
        success: true, 
        xml: getEmptyXML(),
        mermaid: mermaidCode
      });
    }

    // 使用 ELK 自动布局
    let positions = await applyElkLayout(nodes, edges, direction);
    
    // 如果 ELK 失败，使用备用布局
    if (positions.size === 0) {
      positions = applySimpleLayout(nodes, edges, direction);
    }

    // 生成 XML
    const xml = generateDrawIOXML(nodes, edges, positions);

    return NextResponse.json({ 
      success: true, 
      xml,
      mermaid: mermaidCode
    });

  } catch (error) {
    console.error('生成流程图错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
