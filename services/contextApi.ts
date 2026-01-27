// services/contextApi.ts
import {
    Patch,
    PlanContext,
    validatePlanContext,
    createEmptyPlanContext
  } from '../shared/contextSchema';
  
  type ApplyPatchSuccess = {
    ok: true;
    newVersion: number;
    context: PlanContext;
  };
  
  type ApplyPatchConflict = {
    ok: false;
    error: 'version_conflict';
    currentVersion: number;
    context: PlanContext;
  };
  
  type ApplyPatchError = {
    ok: false;
    error: 'unauthorized' | 'invalid_patch' | 'invalid_request' | 'server_error';
    message?: string;
  status?: number;
  };
  
  export async function applyProjectContextPatch(args: {
    projectId: string;
    baseVersion: number;
    patch: Patch;
    apiBaseUrl?: string; // defaults to http://localhost:3001
    /**
     * Optional token getter (recommended): pass getToken from Clerk useAuth().
     * If not provided, we fall back to window.Clerk (works in many cases, but less reliable).
     */
    getToken?: () => Promise<string | null>;
  }): Promise<ApplyPatchSuccess | ApplyPatchConflict | ApplyPatchError> {
    const {
      projectId,
      baseVersion,
      patch,
      apiBaseUrl = 'http://localhost:3001',
      getToken
    } = args;
  
    const fallbackGetToken = async (): Promise<string | null> => {
      const clerk = (window as any).Clerk;
      if (clerk?.session?.getToken) {
        return await clerk.session.getToken();
      }
      return null;
    };
  
  console.groupCollapsed('[contextApi] applyPatch');
  console.log('request', {
    projectId,
    baseVersion,
    patch_id: patch?.patch_id,
    opsCount: patch?.ops?.length ?? 0,
    ops: patch?.ops ?? []
  });

  const requestUrl = `${apiBaseUrl}/api/projects/${projectId}/context/apply`;

  try {
    const token = await (getToken ? getToken() : fallbackGetToken());
    console.log('auth', { token: token ? token.slice(0, 10) : null });
    console.log('url', requestUrl);

    if (!token) {
      return { ok: false, error: 'unauthorized', message: 'Missing auth token' };
    }

    const res = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ base_version: baseVersion, patch })
    });

    console.log('responseMeta', {
        status: res.status,
        contentType: res.headers.get('content-type'),
      });


    const responseText = await res.text();
    console.log('response', { status: res.status, responseText });

    let data: any = null;
    try {
      data = JSON.parse(responseText);
      console.log('responseJson', data);
    } catch (parseError) {
      console.error('responseJson parse error', parseError);
    }
  
    const safeContext = (raw: any): PlanContext => {
      try {
        return validatePlanContext(raw);
      } catch {
        return createEmptyPlanContext();
      }
    };
  
    if (res.status === 401) {
      return { ok: false, error: 'unauthorized', message: responseText, status: res.status };
    }

    if (res.status === 409) {
      const conflict = {
        ok: false as const,
        error: 'version_conflict' as const,
        currentVersion: data?.current_version ?? baseVersion,
        context: safeContext(data?.context_json)
      };
      console.log('conflict', conflict);
      return conflict;
    }

    if (!res.ok) {
      const error: ApplyPatchError['error'] =
        data?.error === 'invalid_patch'
          ? 'invalid_patch'
          : data?.error === 'invalid_request'
            ? 'invalid_request'
            : 'server_error';

      return { ok: false, error, message: responseText, status: res.status };
    }

    return {
      ok: true,
      newVersion: data?.new_version ?? baseVersion + 1,
      context: safeContext(data?.context_json)
    };
  } catch (error: any) {
    console.error('applyPatch error', error?.stack || error);
    return {
      ok: false,
      error: 'server_error',
      message: error?.message || String(error)
    };
  } finally {
    console.groupEnd();
  }
  }
  