'use client';

import { 
  useCallback, 
  useRef, 
  forwardRef, 
  useImperativeHandle, 
  useMemo, 
  useState, 
  useEffect,
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
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import type { NodeTypes } from '@xyflow/react';
import * as htmlToImage from 'html-to-image';
import '@xyflow/react/dist/style.css';

// 流程图数据类型
export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: { 
    label: string; 
    color?: string;
    fontSize?: number;
    borderWidth?: number;
  };
  width?: number;
  height?: number;
  style?: React.CSSProperties;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  label?: string;
  type?: string;
  style?: { stroke?: string; strokeWidth?: number };
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
  importFromJson: (jsonString: string) => boolean;
  importData: (data: FlowData) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fitView: () => void;
  undo: () => void;
  redo: () => void;
}

interface FlowEditorProps {
  data?: FlowData;
  onDataChange?: (data: FlowData) => void;
  readOnly?: boolean;
  onReady?: () => void;
}

// ============= 历史记录管理 =============
interface HistoryState {
  nodes: Node[];
  edges: Edge[];
}

class HistoryManager {
  private history: HistoryState[] = [];
  private currentIndex = -1;
  private maxSize = 50;

  push(state: HistoryState) {
    // 删除当前位置之后的历史
    this.history = this.history.slice(0, this.currentIndex + 1);
    // 添加新状态
    this.history.push(JSON.parse(JSON.stringify(state)));
    // 限制历史记录大小
    if (this.history.length > this.maxSize) {
      this.history.shift();
    } else {
      this.currentIndex++;
    }
  }

  undo(): HistoryState | null {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      return JSON.parse(JSON.stringify(this.history[this.currentIndex]));
    }
    return null;
  }

  redo(): HistoryState | null {
    if (this.currentIndex < this.history.length - 1) {
      this.currentIndex++;
      return JSON.parse(JSON.stringify(this.history[this.currentIndex]));
    }
    return null;
  }

  canUndo(): boolean {
    return this.currentIndex > 0;
  }

  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  clear() {
    this.history = [];
    this.currentIndex = -1;
  }
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
      { type: 'circle', label: '圆形', color: 'blue' },
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
      { type: 'document', label: '文档', color: 'white' },
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
  const fontSize = (data.fontSize as number) || 14;
  const borderWidth = (data.borderWidth as number) || 2;
  
  const NODE_WIDTH = 140;
  const NODE_HEIGHT = type === 'diamond' || type === 'decision' ? 80 : 50;
  
  const getShapeStyle = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      background: colors.fill,
      border: `${borderWidth}px solid ${colors.stroke}`,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      padding: '10px 16px',
      fontSize: `${fontSize}px`,
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
      boxSizing: 'border-box',
    };

    switch (type) {
      case 'start':
      case 'end':
      case 'ellipse':
        return { ...baseStyle, borderRadius: '50%' };
      case 'circle':
        return { ...baseStyle, borderRadius: '50%', width: NODE_HEIGHT };
      case 'diamond':
      case 'decision':
      case 'approval':
        return { 
          ...baseStyle, 
          width: 80,
          height: 80,
          transform: 'rotate(45deg)', 
          padding: '8px',
        };
      case 'document':
        return { ...baseStyle, borderRadius: '0 20px 20px 0' };
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

  const handleStyle: React.CSSProperties = {
    width: 8,
    height: 8,
    background: colors.stroke,
    border: '2px solid white',
    borderRadius: '50%',
  };

  return (
    <div 
      style={shapeStyle}
      onDoubleClick={handleDoubleClick}
      className="react-flow__node-custom group"
    >
      <Handle type="target" position={Position.Top} id="top" style={handleStyle} />
      <Handle type="source" position={Position.Top} id="top-source" style={{ ...handleStyle, opacity: 0 }} />
      
      <Handle type="source" position={Position.Right} id="right" style={handleStyle} />
      <Handle type="target" position={Position.Right} id="right-target" style={{ ...handleStyle, opacity: 0 }} />
      
      <Handle type="source" position={Position.Bottom} id="bottom" style={handleStyle} />
      <Handle type="target" position={Position.Bottom} id="bottom-target" style={{ ...handleStyle, opacity: 0 }} />
      
      <Handle type="source" position={Position.Left} id="left" style={handleStyle} />
      <Handle type="target" position={Position.Left} id="left-target" style={{ ...handleStyle, opacity: 0 }} />
      
      <div style={{ transform: isRotated ? 'rotate(-45deg)' : 'none', maxWidth: '100%' }}>
        {isEditing ? (
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            autoFocus
            className="bg-transparent border-none outline-none text-center w-full"
            style={{ fontSize: 'inherit', fontWeight: 'inherit', color: 'inherit', minWidth: 60 }}
          />
        ) : (
          <span className="select-none block overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
        )}
      </div>
    </div>
  );
});

CustomNode.displayName = 'CustomNode';

// ============= 自定义连线组件 =============
const CustomEdge = memo(({ 
  id, 
  sourceX, 
  sourceY, 
  targetX, 
  targetY, 
  sourcePosition, 
  targetPosition,
  data,
  markerEnd,
  style,
  selected,
}: any) => {
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState(data?.label || '');
  
  const edgeCenterX = (sourceX + targetX) / 2;
  const edgeCenterY = (sourceY + targetY) / 2;

  return (
    <>
      <path
        id={id}
        className="react-flow__edge-path"
        d={`M${sourceX},${sourceY} L${targetX},${targetY}`}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: selected ? 3 : 2,
        }}
      />
      {label && (
        <foreignObject
          x={edgeCenterX - 50}
          y={edgeCenterY - 15}
          width={100}
          height={30}
          className="overflow-visible"
        >
          <div className="flex items-center justify-center h-full">
            <span className="bg-white px-2 py-1 text-xs border rounded shadow-sm">
              {label}
            </span>
          </div>
        </foreignObject>
      )}
    </>
  );
});

CustomEdge.displayName = 'CustomEdge';

// ============= 节点类型定义 =============
const createNodeTypes = (): NodeTypes => {
  const types: NodeTypes = {};
  const allTypes = [
    'rectangle', 'rounded', 'ellipse', 'circle', 'diamond',
    'start', 'end', 'process', 'decision', 'document',
    'purchase', 'sales', 'inventory', 'finance', 'return', 'approval',
  ];
  
  allTypes.forEach(type => {
    types[type] = (props: NodeProps) => <CustomNode {...props} type={type} />;
  });
  
  return types;
};

const nodeTypes = createNodeTypes();

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
    
    // 历史记录管理
    const historyRef = useRef(new HistoryManager());
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);
    
    // 初始化
    const initialNodes: Node[] = useMemo(() => {
      if (!data?.nodes) return [];
      return data.nodes.map(node => ({
        id: node.id,
        type: node.type || 'process',
        position: node.position,
        data: { 
          label: node.data.label, 
          color: node.data.color || 'blue',
          fontSize: node.data.fontSize || 14,
          borderWidth: node.data.borderWidth || 2,
        },
      }));
    }, [data?.nodes]);

    const initialEdges: Edge[] = useMemo(() => {
      if (!data?.edges) return [];
      return data.edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle || undefined,
        targetHandle: edge.targetHandle || undefined,
        label: edge.label,
        type: edge.type || 'straight',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#666' },
        style: edge.style || { stroke: '#666', strokeWidth: 2 },
        data: { label: edge.label || '' },
      }));
    }, [data?.edges]);

    const [nodes, setLocalNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setLocalEdges, onEdgesChange] = useEdgesState(initialEdges);

    // 更新历史记录状态
    const updateHistoryState = useCallback(() => {
      setCanUndo(historyRef.current.canUndo());
      setCanRedo(historyRef.current.canRedo());
    }, []);

    // 保存状态到历史
    const saveState = useCallback(() => {
      historyRef.current.push({ nodes: getNodes(), edges: getEdges() });
      updateHistoryState();
    }, [getNodes, getEdges, updateHistoryState]);

    // 初始化历史记录
    useEffect(() => {
      if (nodes.length > 0 || edges.length > 0) {
        historyRef.current.push({ nodes, edges });
        updateHistoryState();
      }
    }, []);

    // 选中变化处理
    const onSelectionChange = useCallback(({ nodes: selected, edges: selectedEdges }: { nodes: Node[]; edges: Edge[] }) => {
      setSelectedNodes(selected);
      setSelectedEdges(selectedEdges);
    }, []);

    // 连接处理
    const onConnect = useCallback((params: Connection) => {
      setLocalEdges((eds) => addEdge({
        ...params,
        type: currentEdgeStyle,
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#666' },
        style: { stroke: '#666', strokeWidth: 2 },
        data: { label: '' },
      }, eds));
      setTimeout(saveState, 0);
    }, [setLocalEdges, currentEdgeStyle, saveState]);

    // 添加节点
    const handleAddShape = useCallback((shapeType: string, color?: string) => {
      let shapeConfig: { type: string; label: string; color: string } | undefined;
      for (const lib of Object.values(SHAPE_LIBRARIES)) {
        const found = lib.shapes.find(s => s.type === shapeType);
        if (found) {
          shapeConfig = found;
          break;
        }
      }
      
      const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
      const centerX = reactFlowBounds ? reactFlowBounds.width / 2 : 300;
      const centerY = reactFlowBounds ? reactFlowBounds.height / 2 : 200;
      
      const newNode: Node = {
        id: `node_${Date.now()}`,
        type: shapeType,
        position: { 
          x: centerX - 70 + (Math.random() - 0.5) * 40, 
          y: centerY - 25 + (Math.random() - 0.5) * 40 
        },
        data: { 
          label: shapeConfig?.label || '新节点',
          color: color || shapeConfig?.color || 'blue',
          fontSize: 14,
          borderWidth: 2,
        },
      };
      
      addNodes([newNode]);
      setTimeout(saveState, 0);
    }, [addNodes, saveState]);

    // 修改节点属性
    const handleUpdateNode = useCallback((updates: Partial<Node['data']>) => {
      if (selectedNodes.length === 0) return;
      
      setNodes(
        getNodes().map(node => 
          selectedNodes.find(n => n.id === node.id)
            ? { ...node, data: { ...node.data, ...updates } }
            : node
        )
      );
      setTimeout(saveState, 0);
    }, [selectedNodes, setNodes, getNodes, saveState]);

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
        setTimeout(saveState, 0);
      }
    }, [selectedEdges, setLocalEdges, getEdges, saveState]);

    // 删除选中元素
    const handleDelete = useCallback(() => {
      setNodes(getNodes().filter(node => !selectedNodes.find(n => n.id === node.id)));
      setEdges(getEdges().filter(edge => !selectedEdges.find(e => e.id === edge.id)));
      setTimeout(saveState, 0);
    }, [selectedNodes, selectedEdges, setNodes, setEdges, getNodes, getEdges, saveState]);

    // 撤销
    const handleUndo = useCallback(() => {
      const state = historyRef.current.undo();
      if (state) {
        setLocalNodes(state.nodes);
        setLocalEdges(state.edges);
        updateHistoryState();
      }
    }, [setLocalNodes, setLocalEdges, updateHistoryState]);

    // 重做
    const handleRedo = useCallback(() => {
      const state = historyRef.current.redo();
      if (state) {
        setLocalNodes(state.nodes);
        setLocalEdges(state.edges);
        updateHistoryState();
      }
    }, [setLocalNodes, setLocalEdges, updateHistoryState]);

    // 键盘快捷键
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
          e.preventDefault();
          handleRedo();
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (selectedNodes.length > 0 || selectedEdges.length > 0) {
            handleDelete();
          }
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleUndo, handleRedo, handleDelete, selectedNodes, selectedEdges]);

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
            fontSize: Number(node.data.fontSize || 14),
            borderWidth: Number(node.data.borderWidth || 2),
          },
        })),
        edges: getEdges().map(edge => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle ?? undefined,
          targetHandle: edge.targetHandle ?? undefined,
          label: edge.label ? String(edge.label) : undefined,
          type: edge.type as string | undefined,
          style: edge.style ? { 
            stroke: String(edge.style.stroke || '#666'),
            strokeWidth: Number(edge.style.strokeWidth || 2)
          } : undefined,
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
          color: node.data.color || 'blue',
          fontSize: node.data.fontSize || 14,
          borderWidth: node.data.borderWidth || 2,
        },
      }));
      
      const convertedEdges: Edge[] = newData.edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        label: edge.label,
        type: edge.type || 'straight',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#666' },
        style: edge.style || { stroke: '#666', strokeWidth: 2 },
        data: { label: edge.label || '' },
      }));
      
      setLocalNodes(convertedNodes);
      setLocalEdges(convertedEdges);
      historyRef.current.clear();
      historyRef.current.push({ nodes: convertedNodes, edges: convertedEdges });
      updateHistoryState();
      setTimeout(() => fitView({ padding: 0.2 }), 50);
    }, [setLocalNodes, setLocalEdges, fitView, updateHistoryState]);

    // 导出为图片
    const exportAsImage = useCallback(async (fileName = '流程图') => {
      if (!reactFlowWrapper.current) return;
      
      try {
        const dataUrl = await htmlToImage.toPng(reactFlowWrapper.current, {
          backgroundColor: '#ffffff',
          pixelRatio: 2,
        });
        
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `${fileName}_${new Date().toISOString().slice(0, 10)}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (error) {
        console.error('导出图片失败:', error);
        alert('导出图片失败，请重试');
      }
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

    // 从 JSON 导入
    const importFromJson = useCallback((jsonString: string): boolean => {
      try {
        const data = JSON.parse(jsonString);
        if (!data.nodes || !Array.isArray(data.nodes)) {
          return false;
        }
        setDataInternal(data);
        return true;
      } catch (error) {
        console.error('导入失败:', error);
        return false;
      }
    }, [setDataInternal]);

    // 暴露方法
    useImperativeHandle(ref, () => ({
      getData: getCurrentData,
      setData: setDataInternal,
      clearCanvas: () => {
        setNodes([]);
        setEdges([]);
        historyRef.current.clear();
        updateHistoryState();
      },
      exportAsImage,
      exportAsJson,
      importFromJson,
      importData: setDataInternal,
      zoomIn: () => zoomIn(),
      zoomOut: () => zoomOut(),
      fitView: () => fitView({ padding: 0.2 }),
      undo: handleUndo,
      redo: handleRedo,
    }), [getCurrentData, setDataInternal, exportAsImage, exportAsJson, importFromJson, setNodes, setEdges, zoomIn, zoomOut, fitView, handleUndo, handleRedo, updateHistoryState]);

    // 获取选中节点的数据
    const selectedNodeData = selectedNodes.length === 1 ? selectedNodes[0].data : null;

    return (
      <div className="w-full h-full flex flex-col bg-gray-50">
        {/* 顶部工具栏 */}
        <div className="bg-white border-b border-gray-200 px-2 py-1.5 flex items-center gap-1 flex-shrink-0">
          {/* 文件操作 */}
          <div className="flex items-center gap-1 px-2 border-r border-gray-200">
            <button
              onClick={() => setDataInternal({ nodes: [], edges: [] })}
              className="p-1.5 hover:bg-gray-100 rounded text-xs"
              title="新建 (Ctrl+N)"
            >
              📄 新建
            </button>
            <label className="p-1.5 hover:bg-gray-100 rounded text-xs cursor-pointer">
              📂 导入
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      const content = event.target?.result as string;
                      if (importFromJson(content)) {
                        alert('导入成功');
                      } else {
                        alert('导入失败，文件格式不正确');
                      }
                    };
                    reader.readAsText(file);
                  }
                }}
              />
            </label>
          </div>
          
          {/* 编辑操作 */}
          <div className="flex items-center gap-1 px-2 border-r border-gray-200">
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed"
              title="撤销 (Ctrl+Z)"
            >
              ↩️
            </button>
            <button
              onClick={handleRedo}
              disabled={!canRedo}
              className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed"
              title="重做 (Ctrl+Y / Ctrl+Shift+Z)"
            >
              ↪️
            </button>
            <div className="w-px h-4 bg-gray-200 mx-1" />
            <button
              onClick={handleDelete}
              disabled={selectedNodes.length === 0 && selectedEdges.length === 0}
              className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed"
              title="删除 (Delete)"
            >
              🗑️
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
            >
              📦 形状
            </button>
            <button
              onClick={() => setShowFormatPanel(!showFormatPanel)}
              className={`px-2 py-1 text-xs rounded ${showFormatPanel ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}`}
            >
              🎨 属性
            </button>
          </div>
          
          {/* 导出 */}
          <div className="flex items-center gap-1 px-2 ml-auto">
            <button
              onClick={() => exportAsJson()}
              className="px-3 py-1.5 bg-gray-500 text-white text-xs rounded hover:bg-gray-600"
            >
              导出 JSON
            </button>
            <button
              onClick={() => exportAsImage()}
              className="px-3 py-1.5 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
            >
              导出 PNG
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
                              {shape.type === 'start' || shape.type === 'end' || shape.type === 'ellipse' ? (
                                <div className="w-4 h-3 rounded-full" style={{ background: colors.stroke }} />
                              ) : shape.type === 'circle' ? (
                                <div className="w-3 h-3 rounded-full" style={{ background: colors.stroke }} />
                              ) : shape.type === 'diamond' || shape.type === 'decision' ? (
                                <div className="w-3 h-3 rotate-45" style={{ background: colors.stroke }} />
                              ) : (
                                <div className="w-4 h-3" style={{ background: colors.stroke, opacity: 0.5 }} />
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
              snapGrid={[10, 10]}
              deleteKeyCode={null}
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

          {/* 右侧属性面板 */}
          {showFormatPanel && (
            <div className="w-64 bg-white border-l border-gray-200 overflow-y-auto flex-shrink-0">
              {/* 节点属性 */}
              {selectedNodeData ? (
                <div className="p-4 space-y-4">
                  <div className="text-sm font-medium text-gray-700 border-b pb-2">节点属性</div>
                  
                  {/* 文本编辑 */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">文本</label>
                    <input
                      type="text"
                      value={String(selectedNodeData.label || '')}
                      onChange={(e) => handleUpdateNode({ label: e.target.value })}
                      className="w-full px-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  {/* 颜色选择 */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">颜色</label>
                    <div className="grid grid-cols-5 gap-1">
                      {Object.entries(COLOR_PRESETS).map(([key, colors]) => (
                        <button
                          key={key}
                          onClick={() => handleUpdateNode({ color: key })}
                          className={`w-8 h-8 rounded border-2 ${
                            selectedNodeData.color === key ? 'border-blue-500' : 'border-gray-200'
                          }`}
                          style={{ background: colors.fill }}
                          title={colors.name}
                        />
                      ))}
                    </div>
                  </div>
                  
                  {/* 字体大小 */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">字体大小: {Number(selectedNodeData.fontSize || 14)}px</label>
                    <input
                      type="range"
                      min={10}
                      max={24}
                      value={Number(selectedNodeData.fontSize || 14)}
                      onChange={(e) => handleUpdateNode({ fontSize: parseInt(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                  
                  {/* 边框宽度 */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">边框宽度: {Number(selectedNodeData.borderWidth || 2)}px</label>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      value={Number(selectedNodeData.borderWidth || 2)}
                      onChange={(e) => handleUpdateNode({ borderWidth: parseInt(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                </div>
              ) : selectedEdges.length > 0 ? (
                <div className="p-4 space-y-4">
                  <div className="text-sm font-medium text-gray-700 border-b pb-2">连线属性</div>
                  <div className="text-xs text-gray-500">
                    已选中 {selectedEdges.length} 条连线
                  </div>
                </div>
              ) : (
                <div className="p-4">
                  <div className="text-sm font-medium text-gray-700 border-b pb-2 mb-4">属性</div>
                  <div className="text-xs text-gray-500">
                    选择一个节点或连线以编辑属性
                  </div>
                  
                  {/* 快捷键说明 */}
                  <div className="mt-6 pt-4 border-t">
                    <div className="text-xs font-medium text-gray-600 mb-2">快捷键</div>
                    <div className="space-y-1 text-xs text-gray-400">
                      <div>Ctrl+Z: 撤销</div>
                      <div>Ctrl+Y: 重做</div>
                      <div>Delete: 删除</div>
                      <div>双击: 编辑文本</div>
                      <div>拖拽: 移动节点</div>
                      <div>Shift+点击: 多选</div>
                    </div>
                  </div>
                </div>
              )}
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
