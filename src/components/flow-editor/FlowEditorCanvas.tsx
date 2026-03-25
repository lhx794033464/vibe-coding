'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import LogicFlow from '@logicflow/core';
import { Menu, SelectionSelect, DndPanel } from '@logicflow/extension';
import '@logicflow/core/es/index.css';
import '@logicflow/extension/es/index.css';

// 流程图数据类型
export interface FlowNode {
  id: string;
  type: string;
  x: number;
  y: number;
  text?: string;
  properties?: Record<string, unknown>;
}

export interface FlowEdge {
  id: string;
  type: string;
  sourceNodeId: string;
  targetNodeId: string;
  text?: string;
  properties?: Record<string, unknown>;
}

export interface FlowData {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

interface FlowEditorCanvasProps {
  data?: FlowData;
  onDataChange?: (data: FlowData) => void;
  readOnly?: boolean;
}

// 节点样式配置
const NODE_STYLES: Record<string, { fill: string; stroke: string; nodeType: 'circle' | 'rect' | 'diamond' }> = {
  start: { fill: '#d5e8d4', stroke: '#82b366', nodeType: 'circle' },
  end: { fill: '#f8cecc', stroke: '#b85450', nodeType: 'circle' },
  process: { fill: '#dae8fc', stroke: '#6c8ebf', nodeType: 'rect' },
  purchase: { fill: '#dae8fc', stroke: '#6c8ebf', nodeType: 'rect' },
  sale: { fill: '#ffe6cc', stroke: '#d79b00', nodeType: 'rect' },
  inventory: { fill: '#e1d5e7', stroke: '#9673a6', nodeType: 'rect' },
  finance: { fill: '#d5e8d4', stroke: '#82b366', nodeType: 'rect' },
  decision: { fill: '#fff2cc', stroke: '#d6b656', nodeType: 'diamond' },
};

export default function FlowEditorCanvas({ data, onDataChange, readOnly = false }: FlowEditorCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lfRef = useRef<LogicFlow | null>(null);
  const [isReady, setIsReady] = useState(false);

  // 导出为图片
  const exportAsImage = useCallback(async (fileName = '业务流程图') => {
    if (!lfRef.current) return null;
    
    try {
      const lf = lfRef.current;
      const dataUrl = await lf.getSnapshot('#ffffff');
      
      const link = document.createElement('a');
      link.href = dataUrl as string;
      link.download = `${fileName}_${new Date().toISOString().slice(0, 10)}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      return dataUrl;
    } catch (error) {
      console.error('导出图片失败:', error);
      return null;
    }
  }, []);

  // 导出为 JSON
  const exportAsJson = useCallback((fileName = '业务流程图') => {
    if (!lfRef.current) return null;
    
    const graphData = lfRef.current.getGraphData() as FlowData;
    const jsonStr = JSON.stringify(graphData, null, 2);
    
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    return graphData;
  }, []);

  // 获取当前数据
  const getData = useCallback((): FlowData | null => {
    if (!lfRef.current) return null;
    return lfRef.current.getGraphData() as FlowData;
  }, []);

  // 设置数据并应用样式
  const setData = useCallback((newData: FlowData) => {
    if (!lfRef.current) return;
    
    // 转换节点类型：将自定义类型映射到基础类型
    const convertedData = {
      nodes: newData.nodes.map(node => {
        const style = NODE_STYLES[node.type] || NODE_STYLES.process;
        return {
          ...node,
          type: style.nodeType,
          properties: {
            ...node.properties,
            nodeType: node.type, // 保存原始类型
            fill: style.fill,
            stroke: style.stroke,
          },
        };
      }),
      edges: newData.edges,
    };
    
    lfRef.current.render(convertedData);
    
    // 渲染后设置节点样式
    setTimeout(() => {
      if (lfRef.current) {
        newData.nodes.forEach(node => {
          const style = NODE_STYLES[node.type];
          if (style) {
            lfRef.current?.setProperties(node.id, {
              fill: style.fill,
              stroke: style.stroke,
            });
          }
        });
        lfRef.current?.fitView(20);
      }
    }, 50);
  }, []);

  // 清空画布
  const clearCanvas = useCallback(() => {
    if (!lfRef.current) return;
    lfRef.current.clearData();
  }, []);

  // 放大
  const zoomIn = useCallback(() => {
    if (!lfRef.current) return;
    lfRef.current.zoom(true);
  }, []);

  // 缩小
  const zoomOut = useCallback(() => {
    if (!lfRef.current) return;
    lfRef.current.zoom(false);
  }, []);

  // 重置缩放
  const resetZoom = useCallback(() => {
    if (!lfRef.current) return;
    lfRef.current.resetZoom();
    lfRef.current.fitView(20);
  }, []);

  // 初始化 LogicFlow
  useEffect(() => {
    if (!containerRef.current || lfRef.current) return;

    const lf = new LogicFlow({
      container: containerRef.current,
      grid: {
        size: 20,
        visible: true,
        type: 'dot',
        config: {
          color: '#e0e0e0',
        },
      },
      background: {
        backgroundColor: '#fafbfc',
      },
      keyboard: {
        enabled: !readOnly,
      },
      isSilentMode: readOnly,
      stopScrollGraph: false,
      stopMoveGraph: false,
      allowRotation: true,
      allowResize: true,
    });

    // 使用扩展插件
    lf.use(Menu);
    lf.use(SelectionSelect);
    lf.use(DndPanel);

    // 设置默认边样式
    lf.setDefaultEdgeType('polyline');

    // 设置主题样式
    lf.setTheme({
      circle: {
        r: 35,
        strokeWidth: 2,
      },
      rect: {
        radius: 8,
        strokeWidth: 2,
        width: 140,
        height: 50,
      },
      diamond: {
        strokeWidth: 2,
        rx: 70,
        ry: 45,
      },
      polyline: {
        stroke: '#333333',
        strokeWidth: 2,
        hoverStroke: '#1890ff',
        selectedStroke: '#1890ff',
      },
      nodeText: {
        fontSize: 13,
        color: '#333333',
      },
      edgeText: {
        fontSize: 12,
        color: '#666666',
        textWidth: 100,
      },
    });

    // 设置拖拽面板节点
    lf.setPatternItems([
      {
        type: 'circle',
        text: '开始',
        label: '开始节点',
        className: 'lf-dnd-start',
      },
      {
        type: 'rect',
        text: '流程节点',
        label: '流程节点',
        className: 'lf-dnd-process',
      },
      {
        type: 'diamond',
        text: '判断',
        label: '判断节点',
        className: 'lf-dnd-decision',
      },
      {
        type: 'circle',
        text: '结束',
        label: '结束节点',
        className: 'lf-dnd-end',
      },
    ]);

    // 监听节点添加，自动设置样式
    lf.on('node:add', ({ data }) => {
      const textValue = data.text;
      const text = typeof textValue === 'string' ? textValue : (textValue?.value || '');
      const style = NODE_STYLES[data.type];
      
      // 根据文字内容判断节点类型
      let nodeStyle = style;
      if (!style) {
        if (text.includes('开始')) {
          nodeStyle = NODE_STYLES.start;
        } else if (text.includes('结束')) {
          nodeStyle = NODE_STYLES.end;
        } else if (text.includes('采购') || text.includes('采购申请') || text.includes('采购订单') || text.includes('采购入库') || text.includes('采购发票')) {
          nodeStyle = NODE_STYLES.purchase;
        } else if (text.includes('销售') || text.includes('销售报价') || text.includes('销售订单') || text.includes('销售出库') || text.includes('销售发票')) {
          nodeStyle = NODE_STYLES.sale;
        } else if (text.includes('库存') || text.includes('入库') || text.includes('出库') || text.includes('调拨')) {
          nodeStyle = NODE_STYLES.inventory;
        } else if (text.includes('付款') || text.includes('收款') || text.includes('财务')) {
          nodeStyle = NODE_STYLES.finance;
        } else if (text.includes('?') || text.includes('？') || text.includes('审批') || text.includes('判断')) {
          nodeStyle = NODE_STYLES.decision;
        } else {
          nodeStyle = NODE_STYLES.process;
        }
      }
      
      // 设置样式
      lf.setProperties(data.id, {
        fill: nodeStyle.fill,
        stroke: nodeStyle.stroke,
      });
    });

    // 监听数据变化
    lf.on('graph:updated', () => {
      if (onDataChange) {
        const graphData = lf.getGraphData() as FlowData;
        onDataChange(graphData);
      }
    });

    lfRef.current = lf;
    setIsReady(true);

    // 渲染初始数据
    if (data && data.nodes && data.nodes.length > 0) {
      setData(data);
    } else {
      lf.render({});
    }

    return () => {
      if (lfRef.current) {
        lfRef.current.clearData();
        lfRef.current = null;
      }
    };
  }, []);

  // 当外部数据变化时更新
  useEffect(() => {
    if (lfRef.current && data && isReady && data.nodes?.length > 0) {
      setData(data);
    }
  }, [data, isReady, setData]);

  return {
    containerRef,
    lfRef,
    isReady,
    exportAsImage,
    exportAsJson,
    getData,
    setData,
    clearCanvas,
    zoomIn,
    zoomOut,
    resetZoom,
  };
}
