import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

// Mermaid 节点样式映射
const NODE_STYLES: Record<string, string> = {
  'default': 'rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=11;',
  'start': 'ellipse;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;fontSize=12;',
  'end': 'ellipse;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;fontSize=12;',
  'process': 'rounded=0;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;fontSize=11;',
  'decision': 'diamond;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=11;',
};

// 简单的 Mermaid 解析器
function parseMermaidToDrawIO(mermaidCode: string, direction: 'vertical' | 'horizontal'): string {
  const lines = mermaidCode.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));
  
  // 解析方向和图类型
  const firstLine = lines[0] || '';
  const isHorizontal = firstLine.includes('LR') || firstLine.includes('RL');
  
  const nodes = new Map<string, { text: string; type: string; x: number; y: number }>();
  const edges: { from: string; to: string; label?: string }[] = [];
  
  // 布局参数
  const startX = 80;
  const startY = 80;
  const hSpacing = isHorizontal ? 180 : 200;
  const vSpacing = isHorizontal ? 150 : 100;
  
  let nodeIdCounter = 0;
  const getNodeId = (id: string) => {
    if (!nodes.has(id)) {
      nodes.set(id, { 
        text: id, 
        type: 'default',
        x: startX,
        y: startY
      });
    }
    return id;
  };
  
  // 解析节点定义和连接
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    
    // 跳过样式定义行
    if (line.startsWith('style')) continue;
    
    // 解析节点定义: id["text"] 或 id(["text"]) 或 id{"text"}
    const nodeDefMatch = line.match(/^(\w+)\s*([\[(\{])(.+?)[\]\)\}]/);
    if (nodeDefMatch && !line.includes('-->')) {
      const [, id, bracketType, text] = nodeDefMatch;
      let type = 'default';
      if (bracketType === '(') type = 'start';
      else if (bracketType === '{') type = 'decision';
      
      const node = nodes.get(id) || { text, type, x: startX, y: startY };
      node.text = text.replace(/"/g, '');
      node.type = type;
      nodes.set(id, node);
      continue;
    }
    
    // 解析连接: A --> B 或 A -->|"label"| B
    const edgeMatch = line.match(/^(\w+)\s*(-+\.+->|--+>)\s*(?:\|"?([^"|]+)"?\|)?\s*(\w+)/);
    if (edgeMatch) {
      const [, from, , label, to] = edgeMatch;
      getNodeId(from);
      getNodeId(to);
      edges.push({ from, to, label: label?.trim() });
    }
  }
  
  // 如果没有解析到任何节点，返回空白画布
  if (nodes.size === 0) {
    return getEmptyXML();
  }
  
  // 计算节点位置（简单的层级布局）
  const levels = new Map<string, number>();
  const visited = new Set<string>();
  
  // BFS 计算层级
  const queue: string[] = [];
  nodes.forEach((_, id) => {
    const hasIncoming = edges.some(e => e.to === id);
    if (!hasIncoming) {
      levels.set(id, 0);
      queue.push(id);
    }
  });
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    visited.add(current);
    const currentLevel = levels.get(current) || 0;
    
    edges.filter(e => e.from === current).forEach(e => {
      const nextLevel = Math.max(levels.get(e.to) || 0, currentLevel + 1);
      levels.set(e.to, nextLevel);
      if (!visited.has(e.to)) {
        queue.push(e.to);
      }
    });
  }
  
  // 为未访问的节点分配层级
  nodes.forEach((_, id) => {
    if (!levels.has(id)) levels.set(id, 0);
  });
  
  // 计算每层的节点数，用于垂直居中
  const levelCounts = new Map<number, number>();
  const levelIndices = new Map<number, number>();
  levels.forEach((level, id) => {
    levelCounts.set(level, (levelCounts.get(level) || 0) + 1);
  });
  
  // 设置节点坐标
  nodes.forEach((node, id) => {
    const level = levels.get(id) || 0;
    const count = levelCounts.get(level) || 1;
    const index = levelIndices.get(level) || 0;
    levelIndices.set(level, index + 1);
    
    if (isHorizontal) {
      node.x = startX + level * hSpacing;
      node.y = startY + (index - (count - 1) / 2) * vSpacing;
    } else {
      node.x = startX + (index - (count - 1) / 2) * hSpacing;
      node.y = startY + level * vSpacing;
    }
  });
  
  // 生成 XML
  let xml = `<mxGraphModel dx="800" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100">
  <root>
    <mxCell id="0" />
    <mxCell id="1" parent="0" />`;
  
  // 生成节点
  let cellId = 2;
  const nodeIdMap = new Map<string, number>();
  
  nodes.forEach((node, id) => {
    const style = NODE_STYLES[node.type] || NODE_STYLES['default'];
    const width = node.type === 'decision' ? 100 : (node.type === 'start' ? 120 : 160);
    const height = node.type === 'decision' ? 100 : 60;
    
    xml += `
    <mxCell id="${cellId}" value="${escapeXml(node.text)}" style="${style}" vertex="1" parent="1">
      <mxGeometry x="${node.x}" y="${node.y}" width="${width}" height="${height}" as="geometry" />
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

    // 根据方向确定 Mermaid 方向
    const mermaidDirection = direction === 'horizontal' ? 'LR' : 'TD';

    const systemPrompt = `根据描述生成 ${mermaidDirection === 'LR' ? '横向' : '纵向'} Mermaid 流程图代码。以 graph ${mermaidDirection} 开头，仅输出代码。`;

    // 提取转发头
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);

    // 初始化 SDK 客户端
    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    // 调用豆包 2.0 pro 模型生成 Mermaid 代码
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: prompt }
    ];

    const response = await client.invoke(messages, {
      model: 'doubao-seed-2-0-pro-260215',
      temperature: 0.1,
    });

    const mermaidCode = response.content?.trim() || '';

    // 打印原始返回内容用于调试
    console.log('Mermaid 代码:\n', mermaidCode.substring(0, 1000));

    // 验证 Mermaid 代码格式
    if (!mermaidCode.startsWith('graph')) {
      console.error('返回内容不是有效的 Mermaid 代码');
      return NextResponse.json(
        { error: '生成的流程图格式不正确' },
        { status: 500 }
      );
    }

    // 将 Mermaid 代码转换为 draw.io XML
    const xml = parseMermaidToDrawIO(mermaidCode, direction);

    return NextResponse.json({ 
      success: true, 
      xml,
      mermaid: mermaidCode // 同时返回 Mermaid 代码供调试
    });

  } catch (error) {
    console.error('生成流程图错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
