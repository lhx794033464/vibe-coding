/**
 * 腾讯文档 MCP 客户端
 * 通过 MCP (Model Context Protocol) Streamable HTTP 传输协议
 * 与腾讯文档 MCP Server 通信，支持读取文档/表格数据
 * 
 * MCP Server: https://docs.qq.com/openapi/mcp
 * 文档: https://cloud.tencent.com/developer/mcp/server/11803
 */

interface MCPRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: number;
  result?: Record<string, unknown>;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

const MCP_SERVER_URL = 'https://docs.qq.com/openapi/mcp';

export class TencentDocsClient {
  private token: string;
  private requestId = 0;
  private initialized = false;

  constructor(token: string) {
    this.token = token;
  }

  private nextId(): number {
    return ++this.requestId;
  }

  /**
   * 发送 MCP JSON-RPC 请求
   */
  private async sendRequest(method: string, params?: Record<string, unknown>): Promise<MCPResponse> {
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: this.nextId(),
      method,
      ...(params ? { params } : {}),
    };

    const response = await fetch(MCP_SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': this.token,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`MCP 请求失败: HTTP ${response.status} - ${text}`);
    }

    const contentType = response.headers.get('content-type') || '';

    // 处理 SSE 流式响应
    if (contentType.includes('text/event-stream')) {
      return this.parseSSEResponse(response);
    }

    // 处理 JSON 响应
    const data = await response.json();
    return data as MCPResponse;
  }

  /**
   * 解析 SSE 流式响应，提取最终的 JSON-RPC 响应
   */
  private async parseSSEResponse(response: Response): Promise<MCPResponse> {
    const text = await response.text();
    const lines = text.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.substring(6));
          if (data.jsonrpc === '2.0') {
            return data as MCPResponse;
          }
        } catch {
          // 跳过非 JSON 行
        }
      }
    }

    throw new Error('SSE 响应中未找到有效的 JSON-RPC 数据');
  }

  /**
   * 初始化 MCP 连接（必须首先调用）
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const response = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'xingchen-delivery-platform',
        version: '1.0.0',
      },
    });

    if (response.error) {
      throw new Error(`MCP 初始化失败: ${response.error.message}`);
    }

    // 发送 initialized 通知
    await this.sendNotification('notifications/initialized');
    this.initialized = true;
  }

  /**
   * 发送 MCP 通知（无需响应）
   */
  private async sendNotification(method: string, params?: Record<string, unknown>): Promise<void> {
    await fetch(MCP_SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.token,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method,
        ...(params ? { params } : {}),
      }),
    });
  }

  /**
   * 获取可用工具列表
   */
  async listTools(): Promise<unknown[]> {
    await this.initialize();
    const response = await this.sendRequest('tools/list');
    if (response.error) {
      throw new Error(`获取工具列表失败: ${response.error.message}`);
    }
    return (response.result?.tools as unknown[]) || [];
  }

  /**
   * 调用 MCP 工具
   */
  async callTool(name: string, arguments_: Record<string, unknown>): Promise<unknown> {
    await this.initialize();
    const response = await this.sendRequest('tools/call', {
      name,
      arguments: arguments_,
    });

    if (response.error) {
      const errorMsg = response.error.message;
      if (errorMsg.includes('400006')) {
        throw new Error('Token 鉴权失败，请检查腾讯文档 Token 是否正确');
      }
      if (errorMsg.includes('400007')) {
        throw new Error('VIP 权限不足，腾讯文档 MCP 需要腾讯文档 VIP');
      }
      throw new Error(`调用工具 ${name} 失败: ${errorMsg}`);
    }

    // MCP tool 结果格式: { content: [{ type: "text", text: "..." }] }
    const result = response.result;
    if (result?.content && Array.isArray(result.content)) {
      const textContent = result.content.find((c: Record<string, unknown>) => c.type === 'text');
      if (textContent?.text) {
        try {
          return JSON.parse(textContent.text as string);
        } catch {
          return textContent.text;
        }
      }
    }

    return result;
  }

  // ===== 业务方法：封装常用操作 =====

  /**
   * 查询文档空间节点
   */
  async querySpaceNode(parentId?: string, pageToken?: string): Promise<SpaceNodeResult> {
    const args: Record<string, unknown> = {};
    if (parentId) args.parent_id = parentId;
    if (pageToken) args.page_token = pageToken;
    return this.callTool('query_space_node', args) as Promise<SpaceNodeResult>;
  }

  /**
   * 搜索文档
   */
  async searchSpaceFile(keyword: string, pageToken?: string): Promise<SearchResult> {
    const args: Record<string, unknown> = { keyword };
    if (pageToken) args.page_token = pageToken;
    return this.callTool('search_space_file', args) as Promise<SearchResult>;
  }

  /**
   * 获取文档内容
   */
  async getContent(fileId: string): Promise<ContentResult> {
    return this.callTool('get_content', { file_id: fileId }) as Promise<ContentResult>;
  }

  /**
   * 获取智能表格的工作表列表
   */
  async listSmartSheetTables(fileId: string): Promise<SmartSheetTablesResult> {
    return this.callTool('smartsheet.list_tables', { file_id: fileId }) as Promise<SmartSheetTablesResult>;
  }

  /**
   * 获取智能表格的字段列表
   */
  async listSmartSheetFields(fileId: string, sheetId: string): Promise<SmartSheetFieldsResult> {
    return this.callTool('smartsheet.list_fields', { file_id: fileId, sheet_id: sheetId }) as Promise<SmartSheetFieldsResult>;
  }

  /**
   * 获取智能表格的记录数据
   */
  async listSmartSheetRecords(fileId: string, sheetId: string, pageSize?: number, pageToken?: string): Promise<SmartSheetRecordsResult> {
    const args: Record<string, unknown> = { file_id: fileId, sheet_id: sheetId };
    if (pageSize) args.page_size = pageSize;
    if (pageToken) args.page_token = pageToken;
    return this.callTool('smartsheet.list_records', args) as Promise<SmartSheetRecordsResult>;
  }

  /**
   * 获取所有智能表格记录（自动翻页）
   */
  async getAllSmartSheetRecords(fileId: string, sheetId: string): Promise<SmartSheetRecord[]> {
    const allRecords: SmartSheetRecord[] = [];
    let pageToken: string | undefined;

    do {
      const result = await this.listSmartSheetRecords(fileId, sheetId, 100, pageToken);
      if (result.records) {
        allRecords.push(...result.records);
      }
      pageToken = result.page_token;
    } while (pageToken);

    return allRecords;
  }

  /**
   * 获取 Excel 表格内容（通过 get_content 获取）
   */
  async getExcelContent(fileId: string): Promise<ContentResult> {
    return this.getContent(fileId);
  }
}

// ===== 类型定义 =====

interface SpaceNode {
  node_id: string;
  title: string;
  type: string;
  doc_type?: string;
  url?: string;
  updated_at?: string;
  children_count?: number;
}

interface SpaceNodeResult {
  nodes: SpaceNode[];
  has_next: boolean;
  page_token?: string;
}

interface SearchFileItem {
  node_id: string;
  title: string;
  type: string;
  doc_type?: string;
  url?: string;
  updated_at?: string;
}

interface SearchResult {
  files: SearchFileItem[];
  has_next: boolean;
  page_token?: string;
}

interface ContentResult {
  content: string;
  title?: string;
  type?: string;
}

interface SmartSheetTable {
  sheet_id: string;
  title: string;
  record_count?: number;
}

interface SmartSheetTablesResult {
  tables: SmartSheetTable[];
}

interface SmartSheetField {
  field_id: string;
  field_name: string;
  field_type: number;
  property?: Record<string, unknown>;
}

interface SmartSheetFieldsResult {
  fields: SmartSheetField[];
}

interface SmartSheetRecord {
  record_id: string;
  fields: Record<string, unknown>;
}

interface SmartSheetRecordsResult {
  records: SmartSheetRecord[];
  total?: number;
  has_next: boolean;
  page_token?: string;
}

export type {
  SpaceNode,
  SpaceNodeResult,
  SearchFileItem,
  SearchResult,
  ContentResult,
  SmartSheetTable,
  SmartSheetTablesResult,
  SmartSheetField,
  SmartSheetFieldsResult,
  SmartSheetRecord,
  SmartSheetRecordsResult,
};
