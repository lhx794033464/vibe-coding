'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Upload, Download } from 'lucide-react';
import { CustomerStatus, STATUS_CONFIG, INDUSTRY_OPTIONS, ProductVersion, ProductModule, VERSION_CONFIG, MODULE_OPTIONS } from '@/types';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { useAuth } from '@/contexts/AuthContext';
import { getAuthHeader } from '@/services/authService';

export default function NewCustomerPage() {
  const router = useRouter();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    sales_order_no: '',
    implementation_order_no: '',
    implementation_fee: '',
    implementation_days: '',
    opened_at: format(new Date(), "yyyy-MM-dd"),
    version: '' as ProductVersion | '',
    modules: [] as ProductModule[],
    industry: '',
    special_requirements: '',
    status: 'not_online' as CustomerStatus,
    delivery_consultant: user?.username || '',
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
          sales_order_no: formData.sales_order_no || null,
          implementation_order_no: formData.implementation_order_no || null,
          implementation_fee: formData.implementation_fee ? parseInt(formData.implementation_fee) : null,
          implementation_days: formData.implementation_days ? parseFloat(formData.implementation_days) : null,
          opened_at: formData.opened_at || null,
          version: formData.version || null,
          modules: formData.modules.length > 0 ? formData.modules : null,
          industry: formData.industry || null,
          special_requirements: formData.special_requirements || null,
          status: formData.status,
          delivery_consultant: formData.delivery_consultant || null,
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
              sales_order_no: row['销售订单号'] || row['sales_order_no'] || null,
              implementation_order_no: row['实施订单号'] || row['implementation_order_no'] || null,
              implementation_fee: row['实施费'] || row['implementation_fee'] || null,
              implementation_days: row['实施人天'] || row['implementation_days'] || null,
              opened_at: row['开通时间'] || row['opened_at'] || null,
              industry: row['行业背景'] || row['industry'] || null,
              special_requirements: row['特殊要求'] || row['special_requirements'] || null,
              delivery_consultant: row['交付顾问'] || row['delivery_consultant'] || null,
              status: mapStatus(row['状态'] || row['status']),
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

  const mapStatus = (status: unknown): CustomerStatus => {
    const statusMap: Record<string, CustomerStatus> = {
      '未上线': 'not_online',
      '已上线未验收': 'online_not_accepted',
      '已验收': 'accepted',
      '不上线': 'not_going_online',
      '延期上线': 'delayed_online',
      '部分上线': 'partially_online',
    };
    return statusMap[String(status)] || 'not_online';
  };

  const downloadTemplate = () => {
    const template = [
      {
        '客户名称': '示例客户',
        '销售订单号': 'SO2024001',
        '实施订单号': 'IM2024001',
        '实施费': 100000,
        '实施人天': 10,
        '开通时间': '2024-01-01',
        '行业背景': '制造业',
        '特殊要求': '需要定制开发',
        '状态': '未上线',
      },
    ];
    
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '客户导入模板');
    XLSX.writeFile(wb, '客户导入模板.xlsx');
  };

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
                  <div className="space-y-2">
                    <Label htmlFor="name">客户名称 <span className="text-red-500">*</span></Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="请输入客户名称"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="status">客户状态</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(v) => setFormData({ ...formData, status: v as CustomerStatus })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper" side="bottom" align="start">
                        {Object.entries(STATUS_CONFIG).map(([key, value]) => (
                          <SelectItem key={key} value={key}>{value.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="sales_order_no">销售订单号</Label>
                    <Input
                      id="sales_order_no"
                      value={formData.sales_order_no}
                      onChange={(e) => setFormData({ ...formData, sales_order_no: e.target.value })}
                      placeholder="请输入销售订单号"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="implementation_order_no">实施订单号</Label>
                    <Input
                      id="implementation_order_no"
                      value={formData.implementation_order_no}
                      onChange={(e) => setFormData({ ...formData, implementation_order_no: e.target.value })}
                      placeholder="请输入实施订单号"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="implementation_fee">实施费（元）</Label>
                    <Input
                      id="implementation_fee"
                      type="number"
                      min="0"
                      value={formData.implementation_fee}
                      onChange={(e) => setFormData({ ...formData, implementation_fee: e.target.value })}
                      placeholder="请输入实施费"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="implementation_days">实施人天</Label>
                    <Input
                      id="implementation_days"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.implementation_days}
                      onChange={(e) => setFormData({ ...formData, implementation_days: e.target.value })}
                      placeholder="请输入实施人天"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="opened_at">开通时间</Label>
                    <Input
                      id="opened_at"
                      type="date"
                      value={formData.opened_at}
                      onChange={(e) => setFormData({ ...formData, opened_at: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="version">产品版本</Label>
                    <Select
                      value={formData.version}
                      onValueChange={(v) => setFormData({ ...formData, version: v as ProductVersion })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="请选择版本" />
                      </SelectTrigger>
                      <SelectContent position="popper" side="bottom" align="start">
                        {Object.entries(VERSION_CONFIG).map(([key, value]) => (
                          <SelectItem key={key} value={key}>{value.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>产品模块</Label>
                    <div className="flex flex-wrap gap-2 p-3 border rounded-md min-h-[42px]">
                      {MODULE_OPTIONS.map((module) => (
                        <label
                          key={module.value}
                          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm cursor-pointer transition-colors ${
                            formData.modules.includes(module.value)
                              ? 'bg-blue-100 text-blue-700 border border-blue-300'
                              : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={formData.modules.includes(module.value)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({ ...formData, modules: [...formData.modules, module.value] });
                              } else {
                                setFormData({ ...formData, modules: formData.modules.filter(m => m !== module.value) });
                              }
                            }}
                          />
                          {module.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="industry">行业背景</Label>
                    <Select
                      value={formData.industry}
                      onValueChange={(v) => setFormData({ ...formData, industry: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="请选择行业" />
                      </SelectTrigger>
                      <SelectContent position="popper" side="bottom" align="start">
                        {INDUSTRY_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>{option}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="delivery_consultant">交付顾问</Label>
                  <Input
                    id="delivery_consultant"
                    value={formData.delivery_consultant}
                    onChange={(e) => setFormData({ ...formData, delivery_consultant: e.target.value })}
                    placeholder="请输入交付顾问"
                  />
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
                  <li>• <strong>状态</strong>：未上线、已上线未验收、已验收、不上线、延期上线、部分上线</li>
                  <li>• 其他字段均为选填</li>
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
