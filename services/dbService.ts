import { createClient } from '@supabase/supabase-js';
import { PlanContext, createEmptyPlanContext, validatePlanContext } from '../shared/contextSchema';

const API_URL = 'http://localhost:3001/api';

// Supabase client for direct database operations
const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

// Add this type somewhere near the top (optional but helps)
export type ProjectContextRow = {
  project_id: string;
  context_json: PlanContext;
  version: number;
  created_at: string;
  updated_at: string;
};

export async function getProjectContext(projectId: string): Promise<ProjectContextRow> {
  if (!supabase) {
    throw new Error('Supabase client not initialized. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }

  const { data, error } = await supabase
    .from('project_context')
    .select('project_id, context_json, version, created_at, updated_at')
    .eq('project_id', projectId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch project_context for project_id=${projectId}: ${error.message}`);
  }
  if (!data) {
    throw new Error(`project_context row missing for project_id=${projectId}`);
  }

  const fallbackContext = createEmptyPlanContext();

  if (!data?.context_json) {
    return { ...(data as ProjectContextRow), context_json: fallbackContext };
  }

  try {
    const validated = validatePlanContext(data.context_json);
    const hasValidShape =
      validated?.schema_version === "plan@1" &&
      Array.isArray(validated.root_step_ids) &&
      !!validated.steps &&
      typeof validated.steps === "object" &&
      !Array.isArray(validated.steps);

    if (!hasValidShape) {
      console.error(
        `[CONTEXT] Invalid context_json for project_id=${projectId}`,
        data.context_json
      );
      return { ...(data as ProjectContextRow), context_json: fallbackContext };
    }
    return { ...(data as ProjectContextRow), context_json: validated };
  } catch (e) {
    console.error(
      `[CONTEXT] Invalid context_json for project_id=${projectId}`,
      data.context_json,
      e
    );
    return { ...(data as ProjectContextRow), context_json: fallbackContext };
  }
}




export interface AuditLogEntry {
  session_id: string;
  // user_id?: string | null;
  image_path: string;
  diff_percentage: number;
  created_at: string; // ISO string
}

export type DBProject = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
};

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

  // 1. Fetch all projects for the user
  async getProjects(userId: string): Promise<DBProject[]> {
    if (!supabase) {
      throw new Error('Supabase client not initialized. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.');
    }
    const { data, error } = await supabase
      .from('projects')
      .select('id, user_id, name, description, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching projects:', error);
      throw error;
    }
    return (data ?? []) as DBProject[];
  },

  // 2. Create a new project
  async createProject(userId: string, name: string, description?: string | null): Promise<DBProject> {
    if (!supabase) {
      throw new Error('Supabase client not initialized. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.');
    }
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Project name is required');
    }
    const { data, error } = await supabase
      .from('projects')
      .insert([{ user_id: userId, name: trimmed, description: description ?? null }])
      .select('id, user_id, name, description, created_at')
      .single();

    if (error) {
      console.error('Error creating project:', error);
      throw error;
    }
    return data as DBProject;
  },

  // 3. Delete a project (and cascade delete sessions)
  async deleteProject(projectId: string) {
    await fetch(`${API_URL}/projects/${projectId}`, { method: 'DELETE' });
  },

  async getSessions(userId: string) {
    const res = await fetch(`${API_URL}/sessions?userId=${userId}`);
    return res.json();
  },

  async saveSession(session: any, userId: string, projectId?: string | null) {
    await fetch(`${API_URL}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: session.id,
        userId,
        title: session.title,
        createdAt: session.createdAt,
        projectId: projectId ?? session.project_id ?? null
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