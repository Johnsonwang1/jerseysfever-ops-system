import { Settings } from 'lucide-react';

export function SettingsPage() {
  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="w-6 h-6" />
        <h1 className="text-xl font-semibold">设置</h1>
      </div>
      <div className="text-center py-16 text-gray-400">
        <Settings className="w-16 h-16 mx-auto mb-4 opacity-50" />
        <p>设置功能开发中...</p>
      </div>
    </div>
  );
}
