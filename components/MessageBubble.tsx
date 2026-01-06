
import React from 'react';
import { Message, Role } from '../types';
import { useUser } from '@clerk/clerk-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MessageBubbleProps {
  message: Message;
  highlighted?: boolean;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, highlighted }) => {
  const isDrona = message.role === Role.DRONA;
  const { user } = useUser();

  // Get user initials for fallback
  const getUserInitials = () => {
    if (!user) return 'U';
    const firstName = user.firstName || '';
    const lastName = user.lastName || '';
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase();
    }
    if (firstName) return firstName[0].toUpperCase();
    if (lastName) return lastName[0].toUpperCase();
    if (user.fullName) {
      const parts = user.fullName.trim().split(' ');
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
      }
      return parts[0][0].toUpperCase();
    }
    return 'U';
  };

  // Format file size helper
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const highlightClasses = highlighted ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-white dark:ring-offset-slate-900 shadow-lg' : '';

  return (
    <div id={`msg-${message.id}`} className={`flex w-full mb-6 ${isDrona ? 'justify-start' : 'justify-end'}`}>
      <div className={`flex max-w-[85%] md:max-w-[70%] ${isDrona ? 'flex-row' : 'flex-row-reverse'}`}>
        {isDrona ? (
          <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center text-white font-bold shadow-lg bg-indigo-600 ml-0 mr-3">
            D
          </div>
        ) : (
          <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center text-white font-bold shadow-lg bg-emerald-600 mr-0 ml-3 ring-2 ring-emerald-500 overflow-hidden">
            {user?.imageUrl ? (
              <img 
                src={user.imageUrl} 
                alt={user.fullName || 'User'} 
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <span>{getUserInitials()}</span>
            )}
          </div>
        )}
        <div className={`relative px-5 py-4 rounded-2xl shadow-sm border ${highlightClasses} ${
          isDrona 
            ? 'bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700' 
            : 'bg-emerald-600 dark:bg-emerald-700 text-white dark:text-emerald-50 border-emerald-500 dark:border-emerald-600'
        }`}>
          {isDrona && (
            <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-1 uppercase tracking-wider">
              Drona
            </div>
          )}
          
          {/* Render attachments if any */}
          {message.attachments && message.attachments.length > 0 && (
            <div className={`mb-3 flex flex-wrap gap-2 ${isDrona ? 'justify-start' : 'justify-end'}`}>
              {message.attachments.map((att) => {
                // Render image previews
                if (att.mimeType.startsWith('image/') && att.previewUrl) {
                  return (
                    <img
                      key={att.id}
                      src={att.previewUrl}
                      alt={att.name}
                      className="w-28 h-28 object-cover rounded-xl border border-slate-300 dark:border-slate-600"
                    />
                  );
                }
                // Render file chips for non-images
                return (
                  <div
                    key={att.id}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
                      isDrona
                        ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                        : 'bg-white/20 text-white'
                    }`}
                  >
                    <span className={isDrona ? 'text-slate-600 dark:text-slate-400' : 'text-white/80'}>📎</span>
                    <span className={isDrona ? 'text-slate-700 dark:text-slate-300' : 'text-white'}>
                      {att.name}
                    </span>
                    <span className={isDrona ? 'text-slate-500 dark:text-slate-500' : 'text-white/60'}>•</span>
                    <span className={`text-xs ${isDrona ? 'text-slate-500 dark:text-slate-500' : 'text-white/60'}`}>
                      {formatFileSize(att.size)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          
          {message.isStreaming && !message.content ? (
            <div className="animate-pulse flex space-x-2 py-2">
              <div className="h-2 w-2 bg-slate-400 rounded-full"></div>
              <div className="h-2 w-2 bg-slate-400 rounded-full"></div>
              <div className="h-2 w-2 bg-slate-400 rounded-full"></div>
            </div>
          ) : message.content ? (
            <div className={`prose dark:prose-invert max-w-none ${
              isDrona 
                ? 'prose-slate dark:prose-invert' 
                : 'prose-invert'
            } prose-p:leading-relaxed prose-headings:font-semibold prose-code:bg-slate-200 dark:prose-code:bg-slate-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-slate-900 dark:prose-pre:bg-slate-950 prose-pre:border prose-pre:border-slate-700 prose-pre:rounded-lg prose-pre:overflow-x-auto prose-ul:list-disc prose-ol:list-decimal prose-li:my-1`}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ node, inline, className, children, ...props }: any) {
                    return inline ? (
                      <code 
                        className={`${className || ''} bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-sm`} 
                        {...props}
                      >
                        {children}
                      </code>
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  },
                  pre({ node, className, children, ...props }: any) {
                    return (
                      <pre 
                        className={`${className || ''} bg-slate-900 dark:bg-slate-950 border border-slate-700 rounded-lg p-4 overflow-x-auto`} 
                        {...props}
                      >
                        {children}
                      </pre>
                    );
                  },
                  ul({ node, className, children, ...props }: any) {
                    return (
                      <ul className={`${className || ''} list-disc pl-6 my-2 space-y-1`} {...props}>
                        {children}
                      </ul>
                    );
                  },
                  ol({ node, className, children, ...props }: any) {
                    return (
                      <ol className={`${className || ''} list-decimal pl-6 my-2 space-y-1`} {...props}>
                        {children}
                      </ol>
                    );
                  },
                  li({ node, className, children, ...props }: any) {
                    return (
                      <li className={`${className || ''} my-1`} {...props}>
                        {children}
                      </li>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          ) : null}
          <div className={`text-[10px] mt-2 opacity-60 ${isDrona ? 'text-left' : 'text-right'}`}>
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
