'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Upload, Download } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { useAuth } from '@/contexts/AuthContext';

export default function NewCustomerPage() {
  const router = useRouter();
  const { user, getAuthHeader } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    status: '',
    sales_order_no: '',
    implementation_order_no: '',
    implementation_fee: '',
    implementation_days: '',
    opened_at: format(new Date(), "yyyy-MM-dd"),
    version: '',
    modules: '',
    industry: '',
    salesperson: '',
    implementation_type: '',
    expiry_date: '',
    delivery_consultant: user?.username || '',
    special_requirements: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      alert('请输入客户名称');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          name: formData.name,
          status: formData.status || null,
          sales_order_no: formData.sales_order_no || null,
          implementation_order_no: formData.implementation_order_no || null,
          implementation_fee: formData.implementation_fee ? parseInt(formData.implementation_fee) : null,
          implementation_days: formData.implementation_days ? parseFloat(formData.implementation_days) : null,
          opened_at: formData.opened_at || null,
          version: formData.version || null,
          modules: formData.modules || null,
          industry: formData.industry || null,
          salesperson: formData.salesperson || null,
          implementation_type: formData.implementation_type || null,
          expiry_date: formData.expiry_date || null,
          delivery_consultant: formData.delivery_consultant || null,
          special_requirements: formData.special_requirements || null,
        }),
      });

      if (response.ok) {
        router.push('/customers');
      } else {
        const data = await response.json();
        alert(data.error || '创建失败');
      }
    } catch (error) {
      console.error('创建客户失败:', error);
      alert('创建失败');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportLoading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      let successCount = 0;
      let failCount = 0;

      for (const row of jsonData as Record<string, unknown>[]) {
        try {
          const response = await fetch('/api/customers', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...getAuthHeader(),
            },
            body: JSON.stringify({
              name: row['客户名称'] || row['name'] || '',
              status: row['客户状态'] || row['status'] || null,
              sales_order_no: row['销售订单号'] || row['sales_order_no'] || null,
              implementation_order_no: row['实施订单号'] || row['implementation_order_no'] || null,
              implementation_fee: row['实施费'] || row['implementation_fee'] || null,
              implementation_days: row['实施人天'] || row['implementation_days'] || null,
              opened_at: row['开通时间'] || row['opened_at'] || null,
              version: row['版本'] || row['version'] || null,
              modules: row['购买模块'] || row['modules'] || null,
              industry: row['行业背景'] || row['industry'] || null,
              salesperson: row['业务员'] || row['salesperson'] || null,
              implementation_type: row['实施类型'] || row['implementation_type'] || null,
              expiry_date: row['到期日'] || row['expiry_date'] || null,
              delivery_consultant: row['交付顾问'] || row['delivery_consultant'] || null,
            }),
          });

          if (response.ok) {
            successCount++;
          } else {
            failCount++;
          }
        } catch {
          failCount++;
        }
      }

      alert(`导入完成：成功 ${successCount} 条，失败 ${failCount} 条`);
      if (successCount > 0) {
        router.push('/customers');
      }
    } catch (error) {
      console.error('导入失败:', error);
      alert('导入失败，请检查文件格式');
    } finally {
      setImportLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const downloadTemplate = () => {
    const template = [
      {
        '客户名称': '示例客户',
        '客户状态': '未上线',
        '销售订单号': 'SO2024001',
        '实施订单号': 'IM2024001',
        '实施费': 100000,
        '实施人天': 10,
        '开通时间': '2024-01-01',
        '版本': '专业版',
        '购买模块': '进销存',
        '行业背景': '制造业',
        '业务员': '张三',
        '实施类型': '单模块',
        '到期日': '2025-12-31',
        '交付顾问': '李四',
      },
    ];
    
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '客户导入模板');
    XLSX.writeFile(wb, '客户导入模板.xlsx');
  };

  const formFields = [
    { key: 'name', label: '客户名称', required: true, placeholder: '请输入客户名称' },
    { key: 'status', label: '客户状态', placeholder: '如：未上线、已上线、已验收等' },
    { key: 'sales_order_no', label: '销售订单号', placeholder: '请输入销售订单号' },
    { key: 'implementation_order_no', label: '实施订单号', placeholder: '请输入实施订单号' },
    { key: 'implementation_fee', label: '实施费（元）', placeholder: '请输入实施费', type: 'number' },
    { key: 'implementation_days', label: '实施人天', placeholder: '请输入实施人天', type: 'number' },
    { key: 'opened_at', label: '开通时间', type: 'date' },
    { key: 'version', label: '版本', placeholder: '如：标准版、专业版、旗舰版' },
    { key: 'modules', label: '购买模块', placeholder: '如：财务、进销存、生产等' },
    { key: 'industry', label: '行业背景', placeholder: '请输入行业' },
    { key: 'salesperson', label: '业务员', placeholder: '请输入业务员' },
    { key: 'implementation_type', label: '实施类型', placeholder: '如：单模块、多模块等' },
    { key: 'expiry_date', label: '到期日', placeholder: '如：2025-12-31' },
    { key: 'delivery_consultant', label: '交付顾问', placeholder: '请输入交付顾问' },
  ];

  return (
    <div className="h-full p-6 overflow-auto">
      <div className="space-y-6">
        {/* 页面标题 */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回
          </Button>
          <h1 className="text-2xl font-bold text-gray-900">添加客户</h1>
        </div>

      <Tabs defaultValue="manual" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="manual">手动填写</TabsTrigger>
          <TabsTrigger value="import">表格导入</TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>客户档案</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {formFields.map(({ key, label, required, placeholder, type }) => (
                    <div key={key} className="space-y-2">
                      <Label htmlFor={key}>
                        {label} {required && <span className="text-red-500">*</span>}
                      </Label>
                      <Input
                        id={key}
                        type={type || 'text'}
                        min={type === 'number' ? '0' : undefined}
                        step={type === 'number' ? '0.01' : undefined}
                        value={(formData as Record<string, string>)[key]}
                        onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                        placeholder={placeholder}
                        required={required}
                      />
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="special_requirements">特殊要求</Label>
                  <Textarea
                    id="special_requirements"
                    value={formData.special_requirements}
                    onChange={(e) => setFormData({ ...formData, special_requirements: e.target.value })}
                    placeholder="请输入特殊要求"
                    rows={3}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => router.back()}>
                    取消
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? '保存中...' : '保存'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="import" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>表格导入</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-500">
                支持 Excel (.xlsx) 和 CSV 格式，请先下载模板查看字段格式。
              </p>
              
              <div className="flex gap-4">
                <Button variant="outline" onClick={downloadTemplate}>
                  <Download className="w-4 h-4 mr-2" />
                  下载模板
                </Button>
                
                <Button asChild>
                  <label className="cursor-pointer">
                    <Upload className="w-4 h-4 mr-2" />
                    {importLoading ? '导入中...' : '选择文件'}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={importLoading}
                    />
                  </label>
                </Button>
              </div>

              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium mb-2">字段说明：</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• <strong>客户名称</strong>：必填字段</li>
                  <li>• 其他字段均为选填，均为文本输入</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}
