/**
 * 聊天消息组件
 * 渲染用户消息、AI 消息和系统消息
 */

import { Bot, User, Loader2 } from 'lucide-react';
import type { ChatMessage as ChatMessageType } from '@/lib/ad-creative/types';
import { ImageGrid } from './ImageGrid';

interface ChatMessageProps {
  message: ChatMessageType;
  onImageClick?: (imageId: string, imageUrl: string) => void;
}

export function ChatMessage({ message, onImageClick }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  // 系统消息
  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div className="bg-gray-100 text-gray-600 text-sm px-4 py-2 rounded-full">
          {message.content}
        </div>
      </div>
    );
  }

  // 用户消息
  if (isUser) {
    return (
      <div className="flex justify-end gap-2">
        <div className="max-w-[80%]">
          <div className="bg-purple-600 text-white px-4 py-2 rounded-2xl rounded-tr-sm">
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          </div>
          {/* 用户上传的图片 */}
          {message.uploadedImages && message.uploadedImages.length > 0 && (
            <div className="flex gap-1 mt-2 justify-end">
              {message.uploadedImages.map((img, idx) => (
                <img
                  key={idx}
                  src={img}
                  alt=""
                  className="w-12 h-12 object-cover rounded-lg border border-purple-200"
                />
              ))}
            </div>
          )}
        </div>
        <div className="flex-shrink-0 w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
          <User className="w-4 h-4 text-purple-600" />
        </div>
      </div>
    );
  }

  // AI 消息
  return (
    <div className="flex gap-2">
      <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-full flex items-center justify-center">
        <Bot className="w-4 h-4 text-white" />
      </div>
      <div className="max-w-[85%]">
        <div className="bg-gray-100 px-4 py-2 rounded-2xl rounded-tl-sm">
          {message.isLoading ? (
            <div className="flex items-center gap-2 text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">{message.content}</span>
            </div>
          ) : (
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{message.content}</p>
          )}
        </div>

        {/* 图片网格 */}
        {message.images && message.images.length > 0 && onImageClick && (
          <ImageGrid images={message.images} onImageClick={onImageClick} />
        )}

        {/* 时间戳 */}
        <p className="text-xs text-gray-400 mt-1 ml-2">
          {message.timestamp.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
    </div>
  );
}
