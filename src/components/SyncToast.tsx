import { useEffect, useState } from 'react';
import { Loader2, CheckCircle, XCircle, X } from 'lucide-react';

// Toast 状态
interface ToastState {
  id: string;
  message: string;
  status: 'pending' | 'success' | 'error';
  details?: string; // 详细错误信息
}

// 全局状态
let toasts: ToastState[] = [];
let toastIdCounter = 0;
let listeners: (() => void)[] = [];

function notifyListeners() {
  listeners.forEach(fn => fn());
}

// 开始同步 - 返回 toastId
export function startSync(message?: string): string {
  const id = `toast-${++toastIdCounter}`;
  toasts.push({
    id,
    message: message || '同步中...',
    status: 'pending',
  });
  notifyListeners();
  return id;
}

// 手动关闭 toast
export function dismissToast(toastId: string) {
  toasts = toasts.filter(t => t.id !== toastId);
  notifyListeners();
}

// 结束同步 - 支持两种调用方式
// 1. endSync(success, message) - 简单模式
// 2. endSync(toastId, success, message) - 带 ID 模式
export function endSync(
  toastIdOrSuccess: string | boolean,
  successOrMessage?: boolean | string,
  message?: string
) {
  let toastId: string | undefined;
  let success: boolean;
  let finalMessage: string;

  if (typeof toastIdOrSuccess === 'string') {
    // 带 ID 模式: endSync(toastId, success, message)
    toastId = toastIdOrSuccess;
    success = successOrMessage as boolean;
    finalMessage = message || (success ? '同步成功' : '同步失败');
  } else {
    // 简单模式: endSync(success, message)
    success = toastIdOrSuccess;
    finalMessage = (successOrMessage as string) || (success ? '同步成功' : '同步失败');
  }

  if (toastId) {
    // 更新指定 toast
    const toast = toasts.find(t => t.id === toastId);
    if (toast) {
      toast.status = success ? 'success' : 'error';
      toast.message = finalMessage;
    }
  } else {
    // 更新最后一个 pending toast
    const pendingToast = toasts.find(t => t.status === 'pending');
    if (pendingToast) {
      pendingToast.status = success ? 'success' : 'error';
      pendingToast.message = finalMessage;
    }
  }

  notifyListeners();

  // 成功：3秒后消失，失败：需要手动关闭（或 30 秒后自动消失）
  const duration = success ? 3000 : 30000;
  const targetId = toastId || toasts.find(t => t.status !== 'pending')?.id;
  
  setTimeout(() => {
    if (targetId) {
      toasts = toasts.filter(t => t.id !== targetId);
      notifyListeners();
    }
  }, duration);
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

  // 没有 toast，不显示
  if (toasts.length === 0) return null;

  // 显示所有 toast
  const pendingCount = toasts.filter(t => t.status === 'pending').length;
  const errorToasts = toasts.filter(t => t.status === 'error');
  const successToasts = toasts.filter(t => t.status === 'success');
  const pendingToast = toasts.find(t => t.status === 'pending');

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end">
      {/* 错误提示 - 大且醒目，带关闭按钮 */}
      {errorToasts.map(toast => (
        <div 
          key={toast.id}
          className="flex items-center gap-3 px-5 py-4 bg-red-600 text-white rounded-xl shadow-2xl max-w-sm animate-shake border-2 border-red-400"
        >
          <XCircle className="w-6 h-6 flex-shrink-0" />
          <div className="flex-1">
            <div className="font-semibold">同步失败</div>
            <div className="text-sm opacity-90">{toast.message}</div>
          </div>
          <button
            onClick={() => dismissToast(toast.id)}
            className="p-1 hover:bg-red-500 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      ))}

      {/* 成功提示 */}
      {successToasts.map(toast => (
        <div 
          key={toast.id}
          className="flex items-center gap-2 px-4 py-3 bg-green-500 text-white rounded-full shadow-lg max-w-md"
        >
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      ))}

      {/* 进行中提示 */}
      {pendingToast && (
        <div className="flex items-center gap-2 px-4 py-3 bg-blue-500 text-white rounded-full shadow-lg max-w-md">
          <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
          <span className="text-sm font-medium truncate">
            {pendingToast.message}
            {pendingCount > 1 ? ` (+${pendingCount - 1})` : ''}
          </span>
        </div>
      )}
    </div>
  );
}
