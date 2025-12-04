import { useEffect, useState } from 'react';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

// 全局同步状态
let syncCount = 0;
let lastResult: { success: boolean; message: string } | null = null;
let listeners: (() => void)[] = [];

// 开始同步
export function startSync() {
  syncCount++;
  lastResult = null;
  notifyListeners();
}

// 结束同步
export function endSync(success: boolean, message?: string) {
  syncCount = Math.max(0, syncCount - 1);
  lastResult = { success, message: message || (success ? '同步成功' : '同步失败') };
  notifyListeners();
  
  // 3秒后清除结果
  setTimeout(() => {
    if (lastResult?.message === message) {
      lastResult = null;
      notifyListeners();
    }
  }, 3000);
}

function notifyListeners() {
  listeners.forEach(fn => fn());
}

// 同步指示器组件
export function SyncIndicator() {
  const [, forceUpdate] = useState({});
  
  useEffect(() => {
    const update = () => forceUpdate({});
    listeners.push(update);
    return () => {
      listeners = listeners.filter(fn => fn !== update);
    };
  }, []);
  
  // 没有同步中也没有结果，不显示
  if (syncCount === 0 && !lastResult) return null;
  
  return (
    <div className="fixed bottom-4 right-4 z-50">
      {syncCount > 0 ? (
        // 同步中
        <div className="flex items-center gap-2 px-4 py-3 bg-blue-500 text-white rounded-full shadow-lg">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-medium">
            同步中{syncCount > 1 ? ` (${syncCount})` : ''}...
          </span>
        </div>
      ) : lastResult ? (
        // 显示结果
        <div className={`flex items-center gap-2 px-4 py-3 rounded-full shadow-lg ${
          lastResult.success ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {lastResult.success ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <XCircle className="w-5 h-5" />
          )}
          <span className="text-sm font-medium">{lastResult.message}</span>
        </div>
      ) : null}
    </div>
  );
}
