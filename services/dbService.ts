import { createClient } from '@supabase/supabase-js';

const API_URL = 'http://localhost:3001/api';

// Supabase client for direct database operations
const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export interface AuditLogEntry {
  session_id: string;
  // user_id?: string | null;
  image_path: string;
  diff_percentage: number;
  created_at: string; // ISO string
}

export const dbService = {
  async syncUser(user: any) {
    await fetch(`${API_URL}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: user.id,
        email: user.primaryEmailAddress?.emailAddress,
        fullName: user.fullName
      })
    });
  },

  async getSessions(userId: string) {
    const res = await fetch(`${API_URL}/sessions?userId=${userId}`);
    return res.json();
  },

  async saveSession(session: any, userId: string) {
    await fetch(`${API_URL}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: session.id,
        userId,
        title: session.title,
        createdAt: session.createdAt
      })
    });
  },

  async saveMessage(message: any, sessionId: string) {
    await fetch(`${API_URL}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: message.id,
        sessionId,
        role: message.role,
        content: message.content,
        timestamp: message.timestamp
      })
    });
  },

  async deleteSession(sessionId: string) {
    await fetch(`${API_URL}/sessions/${sessionId}`, { method: 'DELETE' });
  },

  async saveAuditLog(entry: AuditLogEntry) {
    if (!supabase) {
      throw new Error('Supabase client not initialized. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.');
    }
    
    const { data, error } = await supabase
      .from('audit_logs')
      .insert([entry]);

    if (error) {
      console.error('Error saving audit log:', error);
      throw error;
    }
    
    return data;
  }
};