'use client';

import { useCallback, useRef, forwardRef, useImperativeHandle, useMemo, useState, memo } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  BackgroundVariant,
  MarkerType,
  Node,
  Edge,
  Handle,
  Position,
  NodeProps,
  Panel,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import type { NodeTypes, EdgeTypes } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// 流程图数据类型
export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: { label: string };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface FlowData {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

// 暴露给父组件的方法
export interface FlowEditorRef {
  getData: () => FlowData;
  setData: (data: FlowData) => void;
  clearCanvas: () => void;
  exportAsImage: (fileName?: string) => Promise<void>;
  exportAsJson: (fileName?: string) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fitView: () => void;
}

interface FlowEditorProps {
  data?: FlowData;
  onDataChange?: (data: FlowData) => void;
  readOnly?: boolean;
  onReady?: () => void;
}

// 预设颜色方案
const COLOR_PRESETS = {
  blue: { fill: '#E3F2FD', stroke: '#1976D2', text: '#1565C0' },
  green: { fill: '#E8F5E9', stroke: '#388E3C', text: '#2E7D32' },
  orange: { fill: '#FFF3E0', stroke: '#F57C00', text: '#E65100' },
  purple: { fill: '#F3E5F5', stroke: '#7B1FA2', text: '#6A1B9A' },
  red: { fill: '#FFEBEE', stroke: '#D32F2F', text: '#C62828' },
  teal: { fill: '#E0F2F1', stroke: '#00796B', text: '#00695C' },
  gray: { fill: '#ECEFF1', stroke: '#546E7A', text: '#455A64' },
  yellow: { fill: '#FFFDE7', stroke: '#F9A825', text: '#F57F17' },
};

// 节点类型配置
const NODE_TYPES = [
  { type: 'start', label: '开始', color: 'green', icon: '○' },
  { type: 'end', label: '结束', color: 'red', icon: '●' },
  { type: 'process', label: '流程', color: 'blue', icon: '□' },
  { type: 'purchase', label: '采购', color: 'blue', icon: '□' },
  { type: 'sale', label: '销售', color: 'orange', icon: '□' },
  { type: 'inventory', label: '库存', color: 'purple', icon: '□' },
  { type: 'finance', label: '财务', color: 'green', icon: '□' },
  { type: 'decision', label: '判断', color: 'yellow', icon: '◇' },
];

// 自定义可编辑节点组件
const CustomNode = memo(({ id, data, type, selected }: NodeProps & { type: string }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState<string>(data.label as string || '');
  
  // 从 data 中获取样式或使用默认
  const colorKey = (data.color as string) || 'blue';
  const colors = COLOR_PRESETS[colorKey as keyof typeof COLOR_PRESETS] || COLOR_PRESETS.blue;
  const isRound = type === 'start' || type === 'end';
  
  // Handle 样式
  const handleStyle: React.CSSProperties = {
    width: 10,
    height: 10,
    background: colors.stroke,
    border: '2px solid #fff',
    borderRadius: '50%',
  };

  const nodeStyle: React.CSSProperties = {
    background: colors.fill,
    border: `2px solid ${colors.stroke}`,
    borderRadius: isRound ? '50%' : '8px',
    padding: isRound ? '12px 24px' : '12px 24px',
    fontSize: '14px',
    fontWeight: 500,
    color: colors.text,
    cursor: 'pointer',
    minWidth: isRound ? 'auto' : '120px',
    textAlign: 'center',
    boxShadow: selected ? `0 0 0 3px ${colors.stroke}40` : '0 2px 8px rgba(0,0,0,0.1)',
    transition: 'box-shadow 0.2s',
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
    data.label = label;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setIsEditing(false);
      data.label = label;
    }
  };

  return (
    <div 
      style={nodeStyle}
      onDoubleClick={handleDoubleClick}
      className="react-flow__node-custom"
    >
      {/* 上方 Handle - 输入 */}
      <Handle 
        type="target" 
        position={Position.Top} 
        id="top"
        style={handleStyle}
        isConnectable={true}
      />
      
      {/* 左侧 Handle - 输入/输出 */}
      <Handle 
        type="source" 
        position={Position.Left} 
        id="left"
        style={handleStyle}
        isConnectable={true}
      />
      
      {/* 内容区域 */}
      {isEditing ? (
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          autoFocus
          className="bg-transparent border-none outline-none text-center w-full"
          style={{ fontSize: 'inherit', fontWeight: 'inherit', color: 'inherit' }}
        />
      ) : (
        <span>{label}</span>
      )}
      
      {/* 右侧 Handle - 输入/输出 */}
      <Handle 
        type="source" 
        position={Position.Right} 
        id="right"
        style={handleStyle}
        isConnectable={true}
      />
      
      {/* 下方 Handle - 输出 */}
      <Handle 
        type="source" 
        position={Position.Bottom} 
        id="bottom"
        style={handleStyle}
        isConnectable={true}
      />
    </div>
  );
});

CustomNode.displayName = 'CustomNode';

// 节点类型定义
const nodeTypes: NodeTypes = {
  start: (props: NodeProps) => <CustomNode {...props} type="start" />,
  end: (props: NodeProps) => <CustomNode {...props} type="end" />,
  process: (props: NodeProps) => <CustomNode {...props} type="process" />,
  purchase: (props: NodeProps) => <CustomNode {...props} type="purchase" />,
  sale: (props: NodeProps) => <CustomNode {...props} type="sale" />,
  inventory: (props: NodeProps) => <CustomNode {...props} type="inventory" />,
  finance: (props: NodeProps) => <CustomNode {...props} type="finance" />,
  decision: (props: NodeProps) => <CustomNode {...props} type="decision" />,
};

// 自定义边样式 - 折线
const defaultEdgeOptions = {
  type: 'smoothstep',
  animated: false,
  markerEnd: { type: MarkerType.ArrowClosed },
  style: { stroke: '#666', strokeWidth: 2 },
};

// 内部编辑器组件
const FlowEditorInner = forwardRef<FlowEditorRef, FlowEditorProps>(
  ({ data, onDataChange, readOnly = false, onReady }, ref) => {
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const { addNodes, setNodes, setEdges, getNodes, getEdges, fitView } = useReactFlow();
    const [selectedNode, setSelectedNode] = useState<string | null>(null);
    const [nodeColor, setNodeColor] = useState<string>('blue');

    // 将 FlowNode 转换为 ReactFlow Node 格式
    const initialNodes: Node[] = useMemo(() => {
      if (!data?.nodes) return [];
      return data.nodes.map(node => ({
        id: node.id,
        type: node.type || 'process',
        position: node.position,
        data: { label: node.data.label, color: node.type === 'start' ? 'green' : node.type === 'end' ? 'red' : 'blue' },
      }));
    }, [data?.nodes]);

    const initialEdges: Edge[] = useMemo(() => {
      if (!data?.edges) return [];
      return data.edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        type: 'smoothstep',
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#666', strokeWidth: 2 },
      }));
    }, [data?.edges]);

    const [nodes, setLocalNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setLocalEdges, onEdgesChange] = useEdgesState(initialEdges);

    // 监听选中变化
    const onSelectionChange = useCallback(({ nodes: selectedNodes }: { nodes: Node[] }) => {
      if (selectedNodes.length === 1) {
        setSelectedNode(selectedNodes[0].id);
        setNodeColor(String(selectedNodes[0].data.color || 'blue'));
      } else {
        setSelectedNode(null);
      }
    }, []);

    // 连接处理
    const onConnect = useCallback(
      (params: Connection) => {
        setLocalEdges((eds) => addEdge({
          ...params,
          type: 'smoothstep',
          animated: false,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: '#666', strokeWidth: 2 },
        }, eds));
      },
      [setLocalEdges]
    );

    // 添加新节点
    const handleAddNode = useCallback((nodeType: string) => {
      const colorKey = nodeType === 'start' ? 'green' : nodeType === 'end' ? 'red' : 'blue';
      const newNode: Node = {
        id: `node_${Date.now()}`,
        type: nodeType,
        position: { x: 300 + Math.random() * 200, y: 200 + Math.random() * 200 },
        data: { 
          label: NODE_TYPES.find(n => n.type === nodeType)?.label || '新节点',
          color: colorKey,
        },
      };
      addNodes([newNode]);
    }, [addNodes]);

    // 修改节点颜色
    const handleChangeColor = useCallback((colorKey: string) => {
      if (!selectedNode) return;
      setNodes(
        getNodes().map(node => 
          node.id === selectedNode 
            ? { ...node, data: { ...node.data, color: colorKey } }
            : node
        )
      );
      setNodeColor(colorKey);
    }, [selectedNode, setNodes, getNodes]);

    // 获取当前数据
    const getCurrentData = useCallback((): FlowData => {
      return {
        nodes: getNodes().map(node => ({
          id: node.id,
          type: (node.type as string) || 'process',
          position: node.position,
          data: { label: String(node.data.label || '') },
        })),
        edges: getEdges().map(edge => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: edge.label ? String(edge.label) : undefined,
        })),
      };
    }, [getNodes, getEdges]);

    // 设置数据
    const setDataInternal = useCallback((newData: FlowData) => {
      const convertedNodes: Node[] = newData.nodes.map(node => ({
        id: node.id,
        type: node.type || 'process',
        position: node.position,
        data: { 
          label: node.data.label,
          color: node.type === 'start' ? 'green' : node.type === 'end' ? 'red' : 'blue',
        },
      }));
      const convertedEdges: Edge[] = newData.edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        type: 'smoothstep',
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#666', strokeWidth: 2 },
      }));
      setLocalNodes(convertedNodes);
      setLocalEdges(convertedEdges);
      setTimeout(() => fitView({ padding: 0.2 }), 50);
    }, [setLocalNodes, setLocalEdges, fitView]);

    // 导出为图片
    const exportAsImage = useCallback(async (fileName = '业务流程图') => {
      alert('请使用浏览器截图功能或按 Ctrl+P 打印保存');
    }, []);

    // 导出为 JSON
    const exportAsJson = useCallback((fileName = '业务流程图') => {
      const data = getCurrentData();
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileName}_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, [getCurrentData]);

    // 暴露方法给父组件
    useImperativeHandle(ref, () => ({
      getData: getCurrentData,
      setData: setDataInternal,
      clearCanvas: () => {
        setNodes([]);
        setEdges([]);
      },
      exportAsImage,
      exportAsJson,
      zoomIn: () => {},
      zoomOut: () => {},
      fitView: () => fitView({ padding: 0.2 }),
    }), [getCurrentData, setDataInternal, exportAsImage, exportAsJson, setNodes, setEdges, fitView]);

    return (
      <div ref={reactFlowWrapper} className="w-full h-full relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onSelectionChange={onSelectionChange}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          fitView
          attributionPosition="bottom-left"
          nodesDraggable={!readOnly}
          nodesConnectable={!readOnly}
          elementsSelectable={!readOnly}
          selectNodesOnDrag={false}
          panOnDrag={true}
          selectionOnDrag={false}
          zoomOnScroll={true}
          zoomOnPinch={true}
          preventScrolling={true}
          snapToGrid={true}
          snapGrid={[20, 20]}
        >
          <Controls showInteractive={false} />
          <MiniMap 
            nodeStrokeWidth={3}
            pannable
            zoomable
            style={{ background: '#f5f5f5' }}
          />
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e0e0e0" />
          
          {/* 节点面板 */}
          <Panel position="top-left" className="!m-0">
            <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-2 w-48">
              <div className="text-xs font-medium text-gray-600 mb-2 px-1">添加节点</div>
              <div className="grid grid-cols-2 gap-1">
                {NODE_TYPES.map(({ type, label, color, icon }) => (
                  <button
                    key={type}
                    onClick={() => handleAddNode(type)}
                    className="flex items-center gap-1.5 px-2 py-1.5 text-xs rounded hover:bg-gray-100 transition-colors text-left"
                    style={{ color: COLOR_PRESETS[color as keyof typeof COLOR_PRESETS].text }}
                  >
                    <span className="w-4 h-4 flex items-center justify-center text-sm">{icon}</span>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </Panel>
          
          {/* 颜色面板 */}
          {selectedNode && (
            <Panel position="top-right" className="!m-0">
              <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-3 w-44">
                <div className="text-xs font-medium text-gray-600 mb-2">节点颜色</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {Object.entries(COLOR_PRESETS).map(([key, colors]) => (
                    <button
                      key={key}
                      onClick={() => handleChangeColor(key)}
                      className={`w-8 h-8 rounded border-2 transition-all ${
                        nodeColor === key ? 'border-gray-800 scale-110' : 'border-gray-300 hover:border-gray-500'
                      }`}
                      style={{ background: colors.fill, borderColor: nodeColor === key ? colors.stroke : colors.stroke + '60' }}
                      title={key}
                    />
                  ))}
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  选中节点后点击更改颜色
                </div>
              </div>
            </Panel>
          )}
        </ReactFlow>
      </div>
    );
  }
);

FlowEditorInner.displayName = 'FlowEditorInner';

// 包装组件，提供 ReactFlowProvider
const FlowEditor = forwardRef<FlowEditorRef, FlowEditorProps>(
  (props, ref) => {
    return (
      <ReactFlowProvider>
        <FlowEditorInner {...props} ref={ref} />
      </ReactFlowProvider>
    );
  }
);

FlowEditor.displayName = 'FlowEditor';

export default FlowEditor;
