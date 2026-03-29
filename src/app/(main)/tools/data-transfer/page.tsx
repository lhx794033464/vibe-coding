'use client';

import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeftRight, 
  Upload, 
  FileSpreadsheet, 
  Download, 
  CheckCircle2, 
  AlertCircle,
  FileUp,
  Loader2,
  FileText
} from 'lucide-react';
import Link from 'next/link';

// 类型定义
interface LogEntry {
  time: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warn';
}

interface FileState {
  name: string;
  ready: boolean;
}

export default function DataTransferPage() {
  const [subjectFile, setSubjectFile] = useState<FileState>({ name: '等待上传...', ready: false });
  const [voucherFile, setVoucherFile] = useState<FileState>({ name: '等待上传...', ready: false });
  const [logs, setLogs] = useState<LogEntry[]>([
    { time: new Date().toLocaleTimeString(), message: '准备就绪，请上传文件...', type: 'info' }
  ]);
  const [processing, setProcessing] = useState(false);
  
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const voucherInputRef = useRef<HTMLInputElement>(null);

  // 日志函数
  const log = (message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), message, type }]);
  };

  // 处理文件选择
  const handleFileSelect = (
    event: React.ChangeEvent<HTMLInputElement>, 
    setFileState: (state: FileState) => void,
    fileType: string
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      setFileState({ name: file.name, ready: true });
      log(`已加载${fileType}: ${file.name}`, 'info');
    }
  };

  // 智能读取Excel
  const readExcelSmart = async (file: File, keywords: string[]): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          // 动态导入xlsx库
          const XLSX = await import('xlsx');
          const workbook = XLSX.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          
          const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
          let headerIndex = 0;
          for (let i = 0; i < Math.min(rawRows.length, 15); i++) {
            const rowStr = JSON.stringify(rawRows[i]);
            if (keywords.some(k => rowStr.includes(k))) {
              headerIndex = i;
              break;
            }
          }
          
          const jsonData = XLSX.utils.sheet_to_json(sheet, { range: headerIndex, defval: "" });
          resolve(jsonData as any[]);
        } catch (err) { 
          reject(err); 
        }
      };
      reader.readAsArrayBuffer(file);
    });
  };

  // 导出Excel
  const exportToExcel = async (jsonData: any[], headers: string[], fileName: string) => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(jsonData, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, fileName);
  };

  // 根据科目代码判断金蝶类别
  const getKingdeeCategory = (code: string): string => {
    const topCode = parseInt(code.substring(0, 4));
    if (isNaN(topCode)) return "其他";

    // 资产类
    if (topCode >= 1001 && topCode <= 1499) return "流动资产";
    if (topCode >= 1501 && topCode <= 1999) return "非流动资产";
    
    // 负债类
    if (topCode >= 2001 && topCode <= 2499) return "流动负债";
    if (topCode >= 2501 && topCode <= 2999) return "非流动负债";
    
    // 权益类
    if (topCode >= 4000 && topCode <= 4999) return "所有者权益";
    
    // 损益类细分
    if (topCode === 6001) return "营业收入";
    if (topCode >= 6051 && topCode <= 6301) return "其他收益";
    if (topCode >= 6401 && topCode <= 6403) return "营业成本及税金";
    if (topCode >= 6601 && topCode <= 6604) return "期间费用";
    if (topCode >= 6701 && topCode <= 6711) return "其他损失";
    if (topCode === 6801) return "所得税";
    if (topCode === 6901) return "以前年度损益调整";
    
    // 兜底逻辑
    const firstChar = code.charAt(0);
    if (firstChar === '5') return "成本";
    if (firstChar === '3') return "共同";
    
    return "其他";
  };

  // 转换凭证
  const convertVouchers = (data: any[], auxItemSet: Map<string, any>) => {
    const result: any[] = [];
    let lastDate = "";
    let lastWord = "记";
    let lastNo = "";
    let entrySeq = 0;

    data.forEach(row => {
      if (!row['科目'] && !row['借方金额'] && !row['贷方金额'] && !row['分录摘要']) return;
      if (String(row['凭证号']).includes('合计')) return;

      if (row['凭证号']) {
        lastDate = row['凭证日期'];
        const vStr = String(row['凭证号']);
        if (vStr.includes('-')) {
          lastWord = vStr.split('-')[0];
          lastNo = vStr.split('-')[1];
        } else {
          lastNo = vStr;
        }
        entrySeq = 0;
      }
      entrySeq++;

      let subCode = "";
      let subName = "";
      if (row['科目']) {
        const parts = String(row['科目']).split(" ");
        subCode = parts[0];
        subName = parts.length > 1 ? parts.slice(1).join(" ") : "";
      }

      const kRow: any = {
        "日期": lastDate,
        "凭证字": lastWord,
        "凭证号": lastNo,
        "附件数": "",
        "分录序号": entrySeq,
        "摘要": row['分录摘要'] || row['摘要'] || "",
        "科目代码": subCode,
        "科目名称": subName,
        "借方金额": row['借方金额'] || 0,
        "贷方金额": row['贷方金额'] || 0,
        "客户": "", "供应商": "", "职员": "", "项目": "", "部门": "", "存货": "",
        "自定义辅助核算类别": "", "自定义辅助核算编码": "",
        "自定义辅助核算类别1": "", "自定义辅助核算编码1": "",
        "数量": row['数量'] || "",
        "单价": row['单价'] || "",
        "原币金额": row['借方原币'] || row['贷方原币'] || "",
        "币别": "RMB",
        "汇率": row['汇率'] || ""
      };

      // 辅助核算解析
      if (row['辅助核算']) {
        const matches = String(row['辅助核算']).matchAll(/【\s*(.*?)\s*:\s*(.*?)\s*\/\s*(.*?)\s*】/g);
        const customItems: { type: string; code: string }[] = [];

        for (const match of matches) {
          let type = match[1].trim();
          const code = match[2].trim();
          const name = match[3].trim();

          if (type === '人员') type = '职员';
          auxItemSet.set(`${type}_${code}`, { "类别": type, "编码": code, "名称": name });

          if (["客户", "供应商", "职员", "项目", "部门", "存货"].includes(type)) {
            kRow[type] = code;
          } else {
            customItems.push({ type, code });
          }
        }

        if (customItems.length > 0) {
          kRow["自定义辅助核算类别"] = customItems[0].type;
          kRow["自定义辅助核算编码"] = customItems[0].code;
        }
        if (customItems.length > 1) {
          kRow["自定义辅助核算类别1"] = customItems[1].type;
          kRow["自定义辅助核算编码1"] = customItems[1].code;
        }
      }

      result.push(kRow);
    });
    return result;
  };

  // 转换科目
  const convertSubjects = (data: any[]) => {
    return data.map(row => {
      const code = String(row['编码'] || row['科目编码'] || "");
      const name = String(row['名称'] || row['科目名称'] || "");
      if (!code) return null;

      const category = getKingdeeCategory(code);
      let direction = "借";
      const firstChar = code.charAt(0);
      
      if (row['余额方向']) {
        direction = row['余额方向'];
      } else {
        if (['2', '3'].includes(firstChar) || (firstChar === '5' && code.startsWith('50'))) {
          direction = "贷";
        }
      }

      let isCash = "否";
      if (name.includes("现金") || name.includes("银行") || code.startsWith("1001") || code.startsWith("1002")) {
        isCash = "是";
      }

      let auxCat = "";
      const rawAux = row['辅助核算'];
      if (rawAux && String(rawAux).trim() !== "") {
        auxCat = String(rawAux).replace(/人员/g, "职员").replace(/\*\|/g, "/").replace(/\*/g, "").replace(/\|/g, "/");
      }

      return {
        "编码": code,
        "名称": name,
        "类别": category,
        "余额方向": direction,
        "是否现金科目": isCash,
        "辅助核算类别": auxCat
      };
    }).filter(item => item !== null);
  };

  // 主处理函数
  const processData = async () => {
    const subFile = subjectInputRef.current?.files?.[0];
    const vouFile = voucherInputRef.current?.files?.[0];

    if (!subFile || !vouFile) {
      log("错误：请确保两个文件都已上传！", "error");
      return;
    }

    setProcessing(true);

    try {
      log("开始解析源文件...", "info");

      const subData = await readExcelSmart(subFile, ['科目编码', '编码', '科目名称']);
      const vouData = await readExcelSmart(vouFile, ['凭证号', '凭证日期', '科目']);

      if (!subData.length || !vouData.length) throw new Error("文件读取失败或内容为空");
      
      log(`源文件读取成功：科目 ${subData.length} 行，凭证 ${vouData.length} 行`, "success");

      const auxItemSet = new Map<string, any>();

      log("正在生成凭证导入数据...", "info");
      const voucherResult = convertVouchers(vouData, auxItemSet);

      log("正在生成科目导入数据...", "info");
      const subjectResult = convertSubjects(subData);

      log("正在生成辅助核算资料...", "info");
      const auxResult = Array.from(auxItemSet.values());

      log("正在导出文件...", "info");
      
      await exportToExcel(voucherResult, [
        "日期", "凭证字", "凭证号", "附件数", "分录序号", "摘要", 
        "科目代码", "科目名称", "借方金额", "贷方金额", 
        "客户", "供应商", "职员", "项目", "部门", "存货",
        "自定义辅助核算类别", "自定义辅助核算编码",
        "自定义辅助核算类别1", "自定义辅助核算编码1",
        "数量", "单价", "原币金额", "币别", "汇率"
      ], "1_凭证导入模板_金蝶.xlsx");

      await exportToExcel(subjectResult, [
        "编码", "名称", "类别", "余额方向", "是否现金科目", "辅助核算类别"
      ], "2_科目导入模板_金蝶.xlsx");

      await exportToExcel(auxResult, [
        "类别", "编码", "名称"
      ], "3_辅助核算项目_金蝶.xlsx");

      log("转换完成！请检查下载文件夹。", "success");
      log(`共生成：凭证 ${voucherResult.length} 条，科目 ${subjectResult.length} 个，辅助项目 ${auxResult.length} 个`, "info");

    } catch (e: any) {
      console.error(e);
      log(`转换失败: ${e.message}`, "error");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="h-full bg-slate-50 overflow-auto">
      <div className="max-w-4xl mx-auto p-6">
        {/* 页面头部 */}
        <div className="mb-6">
          <Link href="/tools" className="text-sm text-slate-500 hover:text-slate-700 mb-2 inline-flex items-center gap-1">
            <ArrowLeftRight className="w-4 h-4" />
            返回工具列表
          </Link>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <ArrowLeftRight className="w-7 h-7 text-green-600" />
            导账工具
          </h1>
          <p className="text-slate-500 mt-1">用友YonSuite → 金蝶精斗云 严格模板转换</p>
        </div>

        {/* 上传区域 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* 科目文件上传 */}
          <Card className={`border-2 border-dashed transition-all ${
            subjectFile.ready ? 'border-green-300 bg-green-50/50' : 'border-slate-200'
          }`}>
            <CardContent className="p-6">
              <label className="cursor-pointer block text-center">
                <input
                  ref={subjectInputRef}
                  type="file"
                  accept=".xls,.xlsx"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e, setSubjectFile, '科目列表')}
                />
                <div className="flex flex-col items-center">
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-3 ${
                    subjectFile.ready ? 'bg-green-100' : 'bg-slate-100'
                  }`}>
                    {subjectFile.ready ? (
                      <CheckCircle2 className="w-7 h-7 text-green-600" />
                    ) : (
                      <FileSpreadsheet className="w-7 h-7 text-slate-400" />
                    )}
                  </div>
                  <span className="font-medium text-slate-700 mb-1">1. 上传科目列表</span>
                  <span className="text-xs text-slate-500">{subjectFile.name}</span>
                </div>
              </label>
            </CardContent>
          </Card>

          {/* 凭证文件上传 */}
          <Card className={`border-2 border-dashed transition-all ${
            voucherFile.ready ? 'border-green-300 bg-green-50/50' : 'border-slate-200'
          }`}>
            <CardContent className="p-6">
              <label className="cursor-pointer block text-center">
                <input
                  ref={voucherInputRef}
                  type="file"
                  accept=".xls,.xlsx"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e, setVoucherFile, '凭证列表')}
                />
                <div className="flex flex-col items-center">
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-3 ${
                    voucherFile.ready ? 'bg-green-100' : 'bg-slate-100'
                  }`}>
                    {voucherFile.ready ? (
                      <CheckCircle2 className="w-7 h-7 text-green-600" />
                    ) : (
                      <FileSpreadsheet className="w-7 h-7 text-slate-400" />
                    )}
                  </div>
                  <span className="font-medium text-slate-700 mb-1">2. 上传凭证列表</span>
                  <span className="text-xs text-slate-500">{voucherFile.name}</span>
                </div>
              </label>
            </CardContent>
          </Card>
        </div>

        {/* 转换按钮 */}
        <Button
          onClick={processData}
          disabled={!subjectFile.ready || !voucherFile.ready || processing}
          className="w-full h-14 text-lg font-semibold bg-green-600 hover:bg-green-700"
          size="lg"
        >
          {processing ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              正在转换...
            </>
          ) : (
            <>
              <Download className="w-5 h-5 mr-2" />
              转换并生成三个标准文件
            </>
          )}
        </Button>

        {/* 输出文件说明 */}
        <div className="mt-3 text-center text-sm text-slate-500">
          将生成严格符合金蝶要求的：凭证导入.xlsx、科目导入.xlsx、辅助资料.xlsx
        </div>

        {/* 日志面板 */}
        <Card className="mt-6 bg-slate-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              转换日志
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 overflow-y-auto font-mono text-xs space-y-1">
              {logs.map((log, index) => (
                <div
                  key={index}
                  className={`py-1 border-b border-slate-800 ${
                    log.type === 'success' ? 'text-green-400' :
                    log.type === 'error' ? 'text-red-400' :
                    log.type === 'warn' ? 'text-yellow-400' :
                    'text-blue-400'
                  }`}
                >
                  <span className="text-slate-500">[{log.time}]</span> {log.message}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 使用说明 */}
        <Card className="mt-6 bg-blue-50 border-blue-100">
          <CardContent className="p-4">
            <h3 className="font-medium text-blue-800 mb-2">📋 使用说明</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• 支持用友YonSuite导出的科目列表和凭证列表（Excel格式）</li>
              <li>• 科目列表需包含：科目编码、科目名称、余额方向、辅助核算等字段</li>
              <li>• 凭证列表需包含：凭证号、凭证日期、科目、借方金额、贷方金额等字段</li>
              <li>• 转换后的文件可直接导入金蝶精斗云系统</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
