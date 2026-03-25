'use client';

import { 
  useCallback, 
  useRef, 
  forwardRef, 
  useImperativeHandle, 
  useMemo, 
  useState, 
  memo,
} from 'react';
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
  NodeChange,
  applyNodeChanges,
} from '@xyflow/react';
import type { NodeTypes } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// 流程图数据类型
export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: { label: string; color?: string };
  width?: number;
  height?: number;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  label?: string;
}

export interface FlowData {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

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

// ============= 颜色预设 =============
const COLOR_PRESETS = {
  blue: { fill: '#DBEEF3', stroke: '#0066CC', text: '#0052A3', name: '采购/订单' },
  green: { fill: '#D5E8D4', stroke: '#82B366', text: '#3D7C47', name: '生产' },
  orange: { fill: '#FFE6CC', stroke: '#D79B00', text: '#B35900', name: '销售' },
  purple: { fill: '#E1D5E7', stroke: '#9673A6', text: '#6B4C7A', name: '库存' },
  red: { fill: '#F8CECC', stroke: '#B85450', text: '#8C3D3A', name: '退货/退款' },
  teal: { fill: '#D5DDDE', stroke: '#607D8B', text: '#3F5B66', name: '财务' },
  yellow: { fill: '#FFF2CC', stroke: '#D6B656', text: '#B38F00', name: '审核/判断' },
  gray: { fill: '#F5F5F5', stroke: '#666666', text: '#333333', name: '开始/结束' },
  white: { fill: '#FFFFFF', stroke: '#000000', text: '#000000', name: '白色' },
};

// ============= 形状库配置 =============
const SHAPE_LIBRARIES = {
  general: {
    name: '通用',
    shapes: [
      { type: 'rectangle', label: '矩形', color: 'blue' },
      { type: 'rounded', label: '圆角矩形', color: 'blue' },
      { type: 'ellipse', label: '椭圆', color: 'blue' },
      { type: 'diamond', label: '菱形', color: 'yellow' },
    ],
  },
  flowchart: {
    name: '流程图',
    shapes: [
      { type: 'start', label: '开始', color: 'gray' },
      { type: 'end', label: '结束', color: 'gray' },
      { type: 'process', label: '流程', color: 'blue' },
      { type: 'decision', label: '判断', color: 'yellow' },
    ],
  },
  business: {
    name: '业务节点',
    shapes: [
      { type: 'purchase', label: '采购', color: 'blue' },
      { type: 'sales', label: '销售', color: 'orange' },
      { type: 'inventory', label: '库存', color: 'purple' },
      { type: 'finance', label: '财务', color: 'teal' },
      { type: 'return', label: '退货', color: 'red' },
      { type: 'approval', label: '审批', color: 'yellow' },
    ],
  },
};

// ============= 连线样式 =============
const EDGE_STYLES = {
  straight: { name: '直线', type: 'straight' },
  smooth: { name: '曲线', type: 'default' },
  step: { name: '折线', type: 'step' },
  smoothstep: { name: '平滑折线', type: 'smoothstep' },
};

// ============= 自定义节点组件 =============
const CustomNode = memo(({ 
  id, 
  data, 
  type, 
  selected, 
  dragging 
}: NodeProps & { type: string }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState<string>(data.label as string || '');
  
  const colorKey = (data.color as string) || 'blue';
  const colors = COLOR_PRESETS[colorKey as keyof typeof COLOR_PRESETS] || COLOR_PRESETS.blue;
  
  // 根据节点类型确定形状
  const getShapeStyle = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      background: colors.fill,
      border: `2px solid ${colors.stroke}`,
      minWidth: typeof data.width === 'number' ? data.width : 120,
      minHeight: typeof data.height === 'number' ? data.height : 50,
      padding: '10px 16px',
      fontSize: '14px',
      fontWeight: 500,
      color: colors.text,
      cursor: 'move',
      textAlign: 'center',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: selected 
        ? `0 0 0 2px ${colors.stroke}, 0 2px 8px rgba(0,0,0,0.15)` 
        : '0 1px 3px rgba(0,0,0,0.1)',
      transition: dragging ? 'none' : 'box-shadow 0.2s',
    };

    switch (type) {
      case 'start':
      case 'end':
        return { ...baseStyle, borderRadius: '50%', minWidth: 80, minHeight: 40, padding: '8px 20px' };
      case 'ellipse':
        return { ...baseStyle, borderRadius: '50%', minWidth: 100, minHeight: 50 };
      case 'diamond':
      case 'decision':
      case 'approval':
        return { 
          ...baseStyle, 
          transform: 'rotate(45deg)', 
          minWidth: 70, 
          minHeight: 70,
          padding: '15px',
        };
      case 'rounded':
      case 'process':
      case 'purchase':
      case 'sales':
      case 'inventory':
      case 'finance':
      case 'return':
        return { ...baseStyle, borderRadius: '8px' };
      default:
        return { ...baseStyle, borderRadius: '4px' };
    }
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
    if (e.key === 'Escape') {
      setIsEditing(false);
      setLabel(data.label as string || '');
    }
  };

  const shapeStyle = getShapeStyle();
  const isRotated = type === 'diamond' || type === 'decision' || type === 'approval';

  // Handle 样式 - 选中时更明显
  const handleStyleVisible: React.CSSProperties = {
    width: 10,
    height: 10,
    background: colors.stroke,
    border: '2px solid white',
    borderRadius: '50%',
    opacity: selected ? 1 : 0,
    transition: 'opacity 0.2s',
  };

  return (
    <div 
      style={shapeStyle}
      onDoubleClick={handleDoubleClick}
      className="react-flow__node-custom group"
      onMouseEnter={(e) => {
        const handles = e.currentTarget.querySelectorAll('.react-flow__handle');
        handles.forEach((h) => {
          (h as HTMLElement).style.opacity = '1';
        });
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          const handles = e.currentTarget.querySelectorAll('.react-flow__handle');
          handles.forEach((h) => {
            (h as HTMLElement).style.opacity = '0';
          });
        }
      }}
    >
      {/* 上方 Handle - 作为输入（target）用于接收来自上方节点的连接 */}
      <Handle 
        type="target" 
        position={Position.Top} 
        id="top-in"
        style={{ ...handleStyleVisible, top: -5 }}
        isConnectable={true}
      />
      
      {/* 右侧 Handle - 作为输出/输入 */}
      <Handle 
        type="source" 
        position={Position.Right} 
        id="right"
        style={{ ...handleStyleVisible, right: -5 }}
        isConnectable={true}
      />
      <Handle 
        type="target" 
        position={Position.Right} 
        id="right-in"
        style={{ ...handleStyleVisible, right: -5, top: '30%' }}
        isConnectable={true}
      />
      
      {/* 下方 Handle - 作为输出（source）用于连接到下方节点 */}
      <Handle 
        type="source" 
        position={Position.Bottom} 
        id="bottom"
        style={{ ...handleStyleVisible, bottom: -5 }}
        isConnectable={true}
      />
      
      {/* 左侧 Handle - 作为输出/输入 */}
      <Handle 
        type="source" 
        position={Position.Left} 
        id="left"
        style={{ ...handleStyleVisible, left: -5 }}
        isConnectable={true}
      />
      <Handle 
        type="target" 
        position={Position.Left} 
        id="left-in"
        style={{ ...handleStyleVisible, left: -5, top: '30%' }}
        isConnectable={true}
      />
      
      {/* 内容区域 */}
      <div style={{ transform: isRotated ? 'rotate(-45deg)' : 'none' }}>
        {isEditing ? (
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            autoFocus
            className="bg-transparent border-none outline-none text-center w-full"
            style={{ 
              fontSize: 'inherit', 
              fontWeight: 'inherit', 
              color: 'inherit',
              minWidth: 60,
            }}
          />
        ) : (
          <span className="select-none">{label}</span>
        )}
      </div>
    </div>
  );
});

CustomNode.displayName = 'CustomNode';

// ============= 节点类型定义 =============
const createNodeTypes = (): NodeTypes => {
  const types: NodeTypes = {};
  const allTypes = [
    'rectangle', 'rounded', 'ellipse', 'diamond',
    'start', 'end', 'process', 'decision',
    'purchase', 'sales', 'inventory', 'finance', 'return', 'approval',
  ];
  
  allTypes.forEach(type => {
    types[type] = (props: NodeProps) => <CustomNode {...props} type={type} />;
  });
  
  return types;
};

const nodeTypes = createNodeTypes();

// ============= 根据位置自动选择 Handle =============
const getBestHandles = (
  sourcePos: { x: number; y: number },
  targetPos: { x: number; y: number }
): { sourceHandle: string; targetHandle: string } => {
  const dx = targetPos.x - sourcePos.x;
  const dy = targetPos.y - sourcePos.y;
  
  if (Math.abs(dy) > Math.abs(dx)) {
    if (dy > 0) {
      return { sourceHandle: 'bottom', targetHandle: 'top-in' };
    } else {
      return { sourceHandle: 'top', targetHandle: 'bottom-in' };
    }
  } else {
    if (dx > 0) {
      return { sourceHandle: 'right', targetHandle: 'left-in' };
    } else {
      return { sourceHandle: 'left', targetHandle: 'right-in' };
    }
  }
};

// ============= 主编辑器组件 =============
const FlowEditorInner = forwardRef<FlowEditorRef, FlowEditorProps>(
  ({ data, onDataChange, readOnly = false, onReady }, ref) => {
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const { 
      addNodes, 
      setNodes, 
      setEdges, 
      getNodes, 
      getEdges, 
      fitView,
      zoomIn,
      zoomOut,
    } = useReactFlow();
    
    const [selectedNodes, setSelectedNodes] = useState<Node[]>([]);
    const [selectedEdges, setSelectedEdges] = useState<Edge[]>([]);
    const [currentEdgeStyle, setCurrentEdgeStyle] = useState<string>('straight');
    const [showFormatPanel, setShowFormatPanel] = useState(true);
    const [showShapePanel, setShowShapePanel] = useState(true);
    const [expandedLibraries, setExpandedLibraries] = useState<string[]>(['general', 'flowchart', 'business']);
    
    // 初始化节点
    const initialNodes: Node[] = useMemo(() => {
      if (!data?.nodes) return [];
      return data.nodes.map(node => ({
        id: node.id,
        type: node.type || 'rectangle',
        position: node.position,
        data: { 
          label: node.data.label, 
          color: node.data.color || 'blue',
          width: node.width,
          height: node.height,
        },
      }));
    }, [data?.nodes]);

    // 初始化边
    const initialEdges: Edge[] = useMemo(() => {
      if (!data?.edges || !data?.nodes) return [];
      
      const nodePositions = new Map(data.nodes.map(n => [n.id, n.position]));
      
      return data.edges.map(edge => {
        const sourcePos = nodePositions.get(edge.source);
        const targetPos = nodePositions.get(edge.target);
        
        let sourceHandle = edge.sourceHandle;
        let targetHandle = edge.targetHandle;
        
        if (!sourceHandle || !targetHandle) {
          if (sourcePos && targetPos) {
            const handles = getBestHandles(sourcePos, targetPos);
            sourceHandle = handles.sourceHandle;
            targetHandle = handles.targetHandle;
          } else {
            sourceHandle = 'bottom';
            targetHandle = 'top-in';
          }
        }
        
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle,
          targetHandle,
          label: edge.label,
          type: 'straight',
          animated: false,
          markerEnd: { type: MarkerType.ArrowClosed, color: '#666' },
          style: { stroke: '#666', strokeWidth: 2 },
        };
      });
    }, [data?.edges, data?.nodes]);

    const [nodes, setLocalNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setLocalEdges, onEdgesChange] = useEdgesState(initialEdges);

    // 选中变化处理
    const onSelectionChange = useCallback(({ nodes: selected, edges: selectedEdges }: { nodes: Node[]; edges: Edge[] }) => {
      setSelectedNodes(selected);
      setSelectedEdges(selectedEdges);
    }, []);

    // 连接处理
    const onConnect = useCallback(
      (params: Connection) => {
        const nodes = getNodes();
        const sourceNode = nodes.find(n => n.id === params.source);
        const targetNode = nodes.find(n => n.id === params.target);
        
        let sourceHandle = params.sourceHandle;
        let targetHandle = params.targetHandle;
        
        if (!sourceHandle || !targetHandle) {
          if (sourceNode && targetNode) {
            const handles = getBestHandles(sourceNode.position, targetNode.position);
            sourceHandle = sourceHandle || handles.sourceHandle;
            targetHandle = targetHandle || handles.targetHandle;
          } else {
            sourceHandle = 'bottom';
            targetHandle = 'top-in';
          }
        }
        
        setLocalEdges((eds) => addEdge({
          ...params,
          sourceHandle,
          targetHandle,
          type: currentEdgeStyle,
          animated: false,
          markerEnd: { type: MarkerType.ArrowClosed, color: '#666' },
          style: { stroke: '#666', strokeWidth: 2 },
        }, eds));
      },
      [setLocalEdges, getNodes, currentEdgeStyle]
    );

    // 添加节点
    const handleAddShape = useCallback((shapeType: string, color?: string) => {
      // 查找形状配置
      let shapeConfig: { type: string; label: string; color: string } | undefined;
      for (const lib of Object.values(SHAPE_LIBRARIES)) {
        const found = lib.shapes.find(s => s.type === shapeType);
        if (found) {
          shapeConfig = found;
          break;
        }
      }
      
      // 计算位置：在画布中心附近
      const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
      const centerX = reactFlowBounds ? reactFlowBounds.width / 2 : 300;
      const centerY = reactFlowBounds ? reactFlowBounds.height / 2 : 200;
      
      const newNode: Node = {
        id: `node_${Date.now()}`,
        type: shapeType,
        position: { 
          x: centerX - 60 + Math.random() * 40, 
          y: centerY - 25 + Math.random() * 40 
        },
        data: { 
          label: shapeConfig?.label || '新节点',
          color: color || shapeConfig?.color || 'blue',
        },
      };
      
      addNodes([newNode]);
    }, [addNodes]);

    // 修改节点颜色
    const handleChangeNodeColor = useCallback((colorKey: string) => {
      if (selectedNodes.length === 0) return;
      
      setNodes(
        getNodes().map(node => 
          selectedNodes.find(n => n.id === node.id)
            ? { ...node, data: { ...node.data, color: colorKey } }
            : node
        )
      );
    }, [selectedNodes, setNodes, getNodes]);

    // 修改连线样式
    const handleChangeEdgeStyle = useCallback((styleKey: string) => {
      setCurrentEdgeStyle(styleKey);
      
      if (selectedEdges.length > 0) {
        setLocalEdges(
          getEdges().map(edge => 
            selectedEdges.find(e => e.id === edge.id)
              ? { ...edge, type: styleKey }
              : edge
          )
        );
      }
    }, [selectedEdges, setLocalEdges, getEdges]);

    // 删除选中元素
    const handleDelete = useCallback(() => {
      setNodes(getNodes().filter(node => !selectedNodes.find(n => n.id === node.id)));
      setEdges(getEdges().filter(edge => !selectedEdges.find(e => e.id === edge.id)));
    }, [selectedNodes, selectedEdges, setNodes, setEdges, getNodes, getEdges]);

    // 层级调整
    const handleBringToFront = useCallback(() => {
      // React Flow 通过节点顺序控制层级
      const selectedIds = selectedNodes.map(n => n.id);
      const unselected = getNodes().filter(n => !selectedIds.includes(n.id));
      const selected = getNodes().filter(n => selectedIds.includes(n.id));
      setNodes([...unselected, ...selected]);
    }, [selectedNodes, setNodes, getNodes]);

    const handleSendToBack = useCallback(() => {
      const selectedIds = selectedNodes.map(n => n.id);
      const unselected = getNodes().filter(n => !selectedIds.includes(n.id));
      const selected = getNodes().filter(n => selectedIds.includes(n.id));
      setNodes([...selected, ...unselected]);
    }, [selectedNodes, setNodes, getNodes]);

    // 切换形状库展开状态
    const toggleLibrary = useCallback((libKey: string) => {
      setExpandedLibraries(prev => 
        prev.includes(libKey) 
          ? prev.filter(k => k !== libKey)
          : [...prev, libKey]
      );
    }, []);

    // 获取当前数据
    const getCurrentData = useCallback((): FlowData => {
      return {
        nodes: getNodes().map(node => ({
          id: node.id,
          type: (node.type as string) || 'rectangle',
          position: node.position,
          data: { 
            label: String(node.data.label || ''),
            color: String(node.data.color || 'blue'),
          },
          width: typeof node.data.width === 'number' ? node.data.width : undefined,
          height: typeof node.data.height === 'number' ? node.data.height : undefined,
        })),
        edges: getEdges().map(edge => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle ?? undefined,
          targetHandle: edge.targetHandle ?? undefined,
          label: edge.label ? String(edge.label) : undefined,
        })),
      };
    }, [getNodes, getEdges]);

    // 设置数据
    const setDataInternal = useCallback((newData: FlowData) => {
      const nodePositions = new Map(newData.nodes.map(n => [n.id, n.position]));
      
      const convertedNodes: Node[] = newData.nodes.map(node => ({
        id: node.id,
        type: node.type || 'rectangle',
        position: node.position,
        data: { 
          label: node.data.label,
          color: node.data.color || 'blue',
          width: node.width,
          height: node.height,
        },
      }));
      
      const convertedEdges: Edge[] = newData.edges.map(edge => {
        const sourcePos = nodePositions.get(edge.source);
        const targetPos = nodePositions.get(edge.target);
        
        let sourceHandle = edge.sourceHandle;
        let targetHandle = edge.targetHandle;
        
        if (!sourceHandle || !targetHandle) {
          if (sourcePos && targetPos) {
            const handles = getBestHandles(sourcePos, targetPos);
            sourceHandle = handles.sourceHandle;
            targetHandle = handles.targetHandle;
          } else {
            sourceHandle = 'bottom';
            targetHandle = 'top-in';
          }
        }
        
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle,
          targetHandle,
          label: edge.label,
          type: 'straight',
          animated: false,
          markerEnd: { type: MarkerType.ArrowClosed, color: '#666' },
          style: { stroke: '#666', strokeWidth: 2 },
        };
      });
      
      setLocalNodes(convertedNodes);
      setLocalEdges(convertedEdges);
      setTimeout(() => fitView({ padding: 0.2 }), 50);
    }, [setLocalNodes, setLocalEdges, fitView]);

    // 导出为图片
    const exportAsImage = useCallback(async (fileName = '流程图') => {
      alert('请使用浏览器截图功能或按 Ctrl+P 打印保存');
    }, []);

    // 导出为 JSON
    const exportAsJson = useCallback((fileName = '流程图') => {
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

    // 暴露方法
    useImperativeHandle(ref, () => ({
      getData: getCurrentData,
      setData: setDataInternal,
      clearCanvas: () => {
        setNodes([]);
        setEdges([]);
      },
      exportAsImage,
      exportAsJson,
      zoomIn: () => zoomIn(),
      zoomOut: () => zoomOut(),
      fitView: () => fitView({ padding: 0.2 }),
    }), [getCurrentData, setDataInternal, exportAsImage, exportAsJson, setNodes, setEdges, zoomIn, zoomOut, fitView]);

    return (
      <div className="w-full h-full flex flex-col bg-gray-50">
        {/* 顶部工具栏 */}
        <div className="bg-white border-b border-gray-200 px-2 py-1.5 flex items-center gap-1 flex-shrink-0">
          {/* 文件操作 */}
          <div className="flex items-center gap-1 px-2 border-r border-gray-200">
            <button
              onClick={() => setDataInternal({ nodes: [], edges: [] })}
              className="p-1.5 hover:bg-gray-100 rounded text-xs"
              title="新建"
            >
              📄 新建
            </button>
          </div>
          
          {/* 编辑操作 */}
          <div className="flex items-center gap-1 px-2 border-r border-gray-200">
            <button
              onClick={handleDelete}
              disabled={selectedNodes.length === 0 && selectedEdges.length === 0}
              className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed"
              title="删除 (Delete)"
            >
              🗑️
            </button>
            <div className="w-px h-4 bg-gray-200 mx-1" />
            <button
              onClick={handleBringToFront}
              disabled={selectedNodes.length === 0}
              className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed"
              title="置于顶层"
            >
              ⬆️
            </button>
            <button
              onClick={handleSendToBack}
              disabled={selectedNodes.length === 0}
              className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed"
              title="置于底层"
            >
              ⬇️
            </button>
          </div>
          
          {/* 缩放 */}
          <div className="flex items-center gap-1 px-2 border-r border-gray-200">
            <button
              onClick={() => zoomOut()}
              className="p-1.5 hover:bg-gray-100 rounded"
              title="缩小"
            >
              ➖
            </button>
            <button
              onClick={() => fitView({ padding: 0.2 })}
              className="p-1.5 hover:bg-gray-100 rounded text-xs"
              title="适应窗口"
            >
              适应
            </button>
            <button
              onClick={() => zoomIn()}
              className="p-1.5 hover:bg-gray-100 rounded"
              title="放大"
            >
              ➕
            </button>
          </div>
          
          {/* 连线样式 */}
          <div className="flex items-center gap-1 px-2 border-r border-gray-200">
            <span className="text-xs text-gray-500">连线:</span>
            {Object.entries(EDGE_STYLES).map(([key, { name }]) => (
              <button
                key={key}
                onClick={() => handleChangeEdgeStyle(key)}
                className={`px-2 py-1 text-xs rounded ${
                  currentEdgeStyle === key 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'hover:bg-gray-100'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
          
          {/* 视图切换 */}
          <div className="flex items-center gap-1 px-2">
            <button
              onClick={() => setShowShapePanel(!showShapePanel)}
              className={`px-2 py-1 text-xs rounded ${showShapePanel ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}`}
              title="形状面板"
            >
              📦 形状
            </button>
            <button
              onClick={() => setShowFormatPanel(!showFormatPanel)}
              className={`px-2 py-1 text-xs rounded ${showFormatPanel ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}`}
              title="格式面板"
            >
              🎨 格式
            </button>
          </div>
          
          {/* 导出 */}
          <div className="flex items-center gap-1 px-2 ml-auto">
            <button
              onClick={() => exportAsJson()}
              className="px-3 py-1.5 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
            >
              导出 JSON
            </button>
          </div>
        </div>

        {/* 主体区域 */}
        <div className="flex-1 flex overflow-hidden">
          {/* 左侧形状面板 */}
          {showShapePanel && (
            <div className="w-56 bg-white border-r border-gray-200 overflow-y-auto flex-shrink-0">
              <div className="p-2 border-b border-gray-200 bg-gray-50">
                <span className="text-xs font-medium text-gray-600">形状库</span>
              </div>
              
              {Object.entries(SHAPE_LIBRARIES).map(([libKey, lib]) => (
                <div key={libKey} className="border-b border-gray-100">
                  <button
                    onClick={() => toggleLibrary(libKey)}
                    className="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-50 text-left"
                  >
                    <span className="text-xs font-medium text-gray-700">{lib.name}</span>
                    <span className="text-gray-400 text-xs">
                      {expandedLibraries.includes(libKey) ? '▼' : '▶'}
                    </span>
                  </button>
                  
                  {expandedLibraries.includes(libKey) && (
                    <div className="grid grid-cols-2 gap-1 p-2">
                      {lib.shapes.map(shape => {
                        const colors = COLOR_PRESETS[shape.color as keyof typeof COLOR_PRESETS];
                        return (
                          <button
                            key={shape.type}
                            onClick={() => handleAddShape(shape.type, shape.color)}
                            className="flex flex-col items-center gap-1 p-2 rounded border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                          >
                            <div 
                              className="w-8 h-6 rounded flex items-center justify-center text-xs"
                              style={{ 
                                background: colors.fill, 
                                border: `1px solid ${colors.stroke}` 
                              }}
                            >
                              {shape.type === 'start' || shape.type === 'end' ? (
                                <div 
                                  className="w-4 h-3 rounded-full"
                                  style={{ background: colors.stroke }}
                                />
                              ) : shape.type === 'diamond' || shape.type === 'decision' ? (
                                <div 
                                  className="w-3 h-3 rotate-45"
                                  style={{ background: colors.stroke }}
                                />
                              ) : (
                                <div 
                                  className="w-4 h-3"
                                  style={{ background: colors.stroke, opacity: 0.5 }}
                                />
                              )}
                            </div>
                            <span className="text-xs text-gray-600">{shape.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 画布 */}
          <div ref={reactFlowWrapper} className="flex-1">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onSelectionChange={onSelectionChange}
              nodeTypes={nodeTypes}
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
              snapGrid={[15, 15]}
              deleteKeyCode="Delete"
              multiSelectionKeyCode="Shift"
            >
              <Controls showInteractive={false} />
              <MiniMap 
                nodeStrokeWidth={3}
                pannable
                zoomable
                style={{ background: '#f5f5f5' }}
              />
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#ddd" />
            </ReactFlow>
          </div>

          {/* 右侧格式面板 */}
          {showFormatPanel && (
            <div className="w-60 bg-white border-l border-gray-200 overflow-y-auto flex-shrink-0">
              {/* 样式标签 */}
              <div className="p-3 border-b border-gray-200">
                <div className="text-xs font-medium text-gray-700 mb-3">样式</div>
                
                {selectedNodes.length > 0 ? (
                  <>
                    {/* 填充颜色 */}
                    <div className="mb-3">
                      <div className="text-xs text-gray-500 mb-1.5">填充颜色</div>
                      <div className="grid grid-cols-5 gap-1.5">
                        {Object.entries(COLOR_PRESETS).map(([key, colors]) => (
                          <button
                            key={key}
                            onClick={() => handleChangeNodeColor(key)}
                            className="w-8 h-8 rounded border-2 border-gray-200 hover:border-gray-400 transition-colors"
                            style={{ background: colors.fill }}
                            title={colors.name}
                          />
                        ))}
                      </div>
                    </div>
                    
                    {/* 选中节点信息 */}
                    <div className="text-xs text-gray-500 mt-3 p-2 bg-gray-50 rounded">
                      已选中 {selectedNodes.length} 个节点
                    </div>
                  </>
                ) : selectedEdges.length > 0 ? (
                  <div className="text-xs text-gray-500 p-2 bg-gray-50 rounded">
                    已选中 {selectedEdges.length} 条连线
                  </div>
                ) : (
                  <div className="text-xs text-gray-400 p-2 bg-gray-50 rounded">
                    选择节点或连线以编辑样式
                  </div>
                )}
              </div>
              
              {/* 文本标签 */}
              <div className="p-3 border-b border-gray-200">
                <div className="text-xs font-medium text-gray-700 mb-3">文本</div>
                {selectedNodes.length > 0 && (
                  <div className="text-xs text-gray-500">
                    双击节点编辑文本
                  </div>
                )}
              </div>
              
              {/* 排列标签 */}
              <div className="p-3 border-b border-gray-200">
                <div className="text-xs font-medium text-gray-700 mb-3">排列</div>
                
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleBringToFront}
                    disabled={selectedNodes.length === 0}
                    className="p-2 text-xs bg-gray-50 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    置于顶层
                  </button>
                  <button
                    onClick={handleSendToBack}
                    disabled={selectedNodes.length === 0}
                    className="p-2 text-xs bg-gray-50 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    置于底层
                  </button>
                </div>
              </div>
              
              {/* 帮助 */}
              <div className="p-3">
                <div className="text-xs font-medium text-gray-700 mb-2">快捷键</div>
                <div className="space-y-1 text-xs text-gray-500">
                  <div>• Delete: 删除选中</div>
                  <div>• Shift+点击: 多选</div>
                  <div>• 滚轮: 缩放</div>
                  <div>• 拖拽空白: 平移</div>
                  <div>• 双击节点: 编辑文本</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);

FlowEditorInner.displayName = 'FlowEditorInner';

// 包装组件
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
