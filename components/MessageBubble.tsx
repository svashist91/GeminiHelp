
import React from 'react';
import { Message, Role } from '../types';

interface MessageBubbleProps {
  message: Message;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isDrona = message.role === Role.DRONA;

  return (
    <div className={`flex w-full mb-6 ${isDrona ? 'justify-start' : 'justify-end'}`}>
      <div className={`flex max-w-[85%] md:max-w-[70%] ${isDrona ? 'flex-row' : 'flex-row-reverse'}`}>
        <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center text-white font-bold shadow-lg ${
          isDrona ? 'bg-indigo-600 ml-0 mr-3' : 'bg-emerald-600 mr-0 ml-3'
        }`}>
          {isDrona ? 'D' : 'U'}
        </div>
        <div className={`relative px-5 py-4 rounded-2xl shadow-sm ${
          isDrona 
            ? 'bg-slate-800 text-slate-200 border border-slate-700' 
            : 'bg-emerald-700 text-emerald-50'
        }`}>
          {isDrona && (
            <div className="text-xs font-semibold text-indigo-400 mb-1 uppercase tracking-wider">
              Drona
            </div>
          )}
          <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-700">
            {message.content || (message.isStreaming ? <div className="animate-pulse flex space-x-2">
              <div className="h-2 w-2 bg-slate-500 rounded-full"></div>
              <div className="h-2 w-2 bg-slate-500 rounded-full"></div>
              <div className="h-2 w-2 bg-slate-500 rounded-full"></div>
            </div> : null)}
          </div>
          <div className={`text-[10px] mt-2 opacity-40 ${isDrona ? 'text-left' : 'text-right'}`}>
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
