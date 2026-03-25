'use client';

import { useCallback, useRef, forwardRef, useImperativeHandle, useMemo } from 'react';
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
} from '@xyflow/react';
import type { NodeTypes } from '@xyflow/react';
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

// 自定义节点样式
const nodeStyles: Record<string, React.CSSProperties> = {
  start: {
    background: '#d5e8d4',
    border: '2px solid #82b366',
    borderRadius: '50%',
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 500,
  },
  end: {
    background: '#f8cecc',
    border: '2px solid #b85450',
    borderRadius: '50%',
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 500,
  },
  process: {
    background: '#dae8fc',
    border: '2px solid #6c8ebf',
    borderRadius: '8px',
    padding: '12px 20px',
    fontSize: '13px',
    fontWeight: 500,
    minWidth: '120px',
    textAlign: 'center',
  },
  purchase: {
    background: '#dae8fc',
    border: '2px solid #6c8ebf',
    borderRadius: '8px',
    padding: '12px 20px',
    fontSize: '13px',
    fontWeight: 500,
    minWidth: '120px',
    textAlign: 'center',
  },
  sale: {
    background: '#ffe6cc',
    border: '2px solid #d79b00',
    borderRadius: '8px',
    padding: '12px 20px',
    fontSize: '13px',
    fontWeight: 500,
    minWidth: '120px',
    textAlign: 'center',
  },
  inventory: {
    background: '#e1d5e7',
    border: '2px solid #9673a6',
    borderRadius: '8px',
    padding: '12px 20px',
    fontSize: '13px',
    fontWeight: 500,
    minWidth: '120px',
    textAlign: 'center',
  },
  finance: {
    background: '#d5e8d4',
    border: '2px solid #82b366',
    borderRadius: '8px',
    padding: '12px 20px',
    fontSize: '13px',
    fontWeight: 500,
    minWidth: '120px',
    textAlign: 'center',
  },
  decision: {
    background: '#fff2cc',
    border: '2px solid #d6b656',
    borderRadius: '8px',
    padding: '12px 20px',
    fontSize: '13px',
    fontWeight: 500,
    minWidth: '100px',
    textAlign: 'center',
  },
};

// 自定义节点组件
const CustomNode = ({ data, type }: { data: { label: string }; type: string }) => {
  const style = nodeStyles[type] || nodeStyles.process;
  return (
    <div style={style}>
      {data.label}
    </div>
  );
};

// 转换节点类型映射
const nodeTypeMap: Record<string, string> = {
  start: 'start',
  end: 'end',
  process: 'process',
  purchase: 'purchase',
  sale: 'sale',
  inventory: 'inventory',
  finance: 'finance',
  decision: 'decision',
};

// 节点类型定义
const nodeTypes: NodeTypes = {
  start: (props: any) => <CustomNode {...props} type="start" />,
  end: (props: any) => <CustomNode {...props} type="end" />,
  process: (props: any) => <CustomNode {...props} type="process" />,
  purchase: (props: any) => <CustomNode {...props} type="purchase" />,
  sale: (props: any) => <CustomNode {...props} type="sale" />,
  inventory: (props: any) => <CustomNode {...props} type="inventory" />,
  finance: (props: any) => <CustomNode {...props} type="finance" />,
  decision: (props: any) => <CustomNode {...props} type="decision" />,
};

const FlowEditor = forwardRef<FlowEditorRef, FlowEditorProps>(
  ({ data, onDataChange, readOnly = false, onReady }, ref) => {
    const reactFlowWrapper = useRef<HTMLDivElement>(null);

    // 将 FlowNode 转换为 ReactFlow Node 格式
    const initialNodes: Node[] = useMemo(() => {
      if (!data?.nodes) return [];
      return data.nodes.map(node => ({
        id: node.id,
        type: nodeTypeMap[node.type] || 'process',
        position: node.position,
        data: node.data,
      }));
    }, [data?.nodes]);

    const initialEdges: Edge[] = useMemo(() => {
      if (!data?.edges) return [];
      return data.edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#333', strokeWidth: 2 },
      }));
    }, [data?.edges]);

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    // 连接处理
    const onConnect = useCallback(
      (params: Connection) => {
        setEdges((eds) => addEdge({
          ...params,
          animated: true,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: '#333', strokeWidth: 2 },
        }, eds));
      },
      [setEdges]
    );

    // 获取当前数据
    const getCurrentData = useCallback((): FlowData => {
      return {
        nodes: nodes.map(node => ({
          id: node.id,
          type: (node.type as string) || 'process',
          position: node.position,
          data: node.data as { label: string },
        })),
        edges: edges.map(edge => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: edge.label as string | undefined,
        })),
      };
    }, [nodes, edges]);

    // 设置数据
    const setDataInternal = useCallback((newData: FlowData) => {
      const convertedNodes: Node[] = newData.nodes.map(node => ({
        id: node.id,
        type: nodeTypeMap[node.type] || 'process',
        position: node.position,
        data: node.data,
      }));
      const convertedEdges: Edge[] = newData.edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#333', strokeWidth: 2 },
      }));
      setNodes(convertedNodes);
      setEdges(convertedEdges);
    }, [setNodes, setEdges]);

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
      fitView: () => {},
    }), [getCurrentData, setDataInternal, exportAsImage, exportAsJson, setNodes, setEdges]);

    return (
      <div ref={reactFlowWrapper} className="w-full h-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          attributionPosition="bottom-left"
          nodesDraggable={!readOnly}
          nodesConnectable={!readOnly}
          elementsSelectable={!readOnly}
        >
          <Controls />
          <MiniMap />
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        </ReactFlow>
      </div>
    );
  }
);

FlowEditor.displayName = 'FlowEditor';

export default FlowEditor;
