
export enum Role {
  USER = 'user',
  DRONA = 'drona'
}

export type ChatAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  previewUrl?: string; // for images (objectURL)
};

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  attachments?: ChatAttachment[];
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
}
