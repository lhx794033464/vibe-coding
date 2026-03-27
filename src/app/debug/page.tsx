'use client';

import { useEffect, useState } from 'react';

export default function DiagnosticsPage() {
  const [results, setResults] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const runDiagnostics = async () => {
      const diagnostics: Record<string, any> = {
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        tests: {},
      };

      // 1. 检查 Supabase 配置 API
      try {
        const configRes = await fetch('/api/config');
        const configData = await configRes.json();
        diagnostics.tests.configApi = {
          success: configRes.ok,
          hasUrl: !!configData.supabaseUrl,
          hasKey: !!configData.supabaseAnonKey,
          error: configRes.ok ? null : configData.error,
        };
      } catch (e: any) {
        diagnostics.tests.configApi = {
          success: false,
          error: e.message,
        };
      }

      // 2. 尝试获取当前会话
      try {
        const { createBrowserClient } = await import('@supabase/ssr');
        const configRes = await fetch('/api/config');
        const configData = await configRes.json();
        
        const supabase = createBrowserClient(
          configData.supabaseUrl,
          configData.supabaseAnonKey
        );
        
        const { data, error } = await supabase.auth.getSession();
        diagnostics.tests.session = {
          hasSession: !!data.session,
          error: error?.message || null,
        };

        if (data.session) {
          const { data: userData, error: userError } = await supabase.auth.getUser();
          diagnostics.tests.user = {
            hasUser: !!userData.user,
            userId: userData.user?.id,
            error: userError?.message || null,
          };

          // 尝试查询 user_profiles
          if (userData.user) {
            try {
              const { data: profile, error: profileError } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('user_id', userData.user.id)
                .single();
              
              diagnostics.tests.userProfiles = {
                success: !profileError || profileError.code === 'PGRST116',
                exists: !!profile,
                error: profileError?.message || null,
                code: profileError?.code || null,
              };
            } catch (e: any) {
              diagnostics.tests.userProfiles = {
                success: false,
                error: e.message,
              };
            }

            // 尝试查询 customers
            try {
              const { data: customers, error: customersError } = await supabase
                .from('customers')
                .select('count', { count: 'exact', head: true });
              
              diagnostics.tests.customers = {
                success: !customersError,
                error: customersError?.message || null,
              };
            } catch (e: any) {
              diagnostics.tests.customers = {
                success: false,
                error: e.message,
              };
            }
          }
        }
      } catch (e: any) {
        diagnostics.tests.session = {
          success: false,
          error: e.message,
        };
      }

      setResults(diagnostics);
      setLoading(false);
    };

    runDiagnostics();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p>正在诊断...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Supabase 诊断报告</h1>
        
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">基本信息</h2>
          <pre className="bg-gray-100 p-4 rounded overflow-auto text-sm">
            {JSON.stringify({
              timestamp: results.timestamp,
              userAgent: results.userAgent,
            }, null, 2)}
          </pre>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">测试结果</h2>
          <pre className="bg-gray-100 p-4 rounded overflow-auto text-sm">
            {JSON.stringify(results.tests, null, 2)}
          </pre>
        </div>

        <div className="mt-6 flex gap-4">
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            重新诊断
          </button>
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `diagnostics-${Date.now()}.json`;
              a.click();
            }}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            导出报告
          </button>
        </div>
      </div>
    </div>
  );
}
