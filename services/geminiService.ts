export class GeminiService {
  private proxyUrl = 'http://localhost:3001';
  private wsUrl = 'ws://localhost:3001';

  // Upload files and get file IDs
  async uploadFiles(files: File[]): Promise<string[]> {
    // Use FormData for multipart/form-data upload
    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });

    const response = await fetch(`${this.proxyUrl}/api/upload`, {
      method: 'POST',
      body: formData
      // Don't set Content-Type header - browser will set it with boundary
    });

    if (!response.ok) {
      throw new Error(`File upload failed: ${response.statusText}`);
    }

    const result = await response.json();
    // Server returns { files: [...] }, extract fileId from each
    const filesArray = result.files || result;
    return filesArray.map((file: { fileId: string; name: string; mimeType: string }) => file.fileId);
  }

  // 1. Text Chat via Proxy
  async *streamChat(history: any[], prompt: string, attachmentIds: string[] = []) {
    const response = await fetch(`${this.proxyUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: prompt, history, attachmentIds })
    });

    if (!response.body) return;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield decoder.decode(value, { stream: true });
    }
  }

  // 2. Live Mode via WebSocket Proxy
  connectLive(callbacks: {
    onopen: () => void;
    onmessage: (message: any) => void;
    onerror: (e: Event) => void;
    onclose: (e: { code: number; reason: string; wasClean: boolean }) => void;
  }) {
    const ws = new WebSocket(this.wsUrl);

    ws.onopen = () => {
      callbacks.onopen?.();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        callbacks.onmessage?.(msg);
      } catch (error) {
        console.error('[WS] JSON parse error:', error);
        callbacks.onerror?.(error as Event);
      }
    };

    ws.onerror = (e) => {
      callbacks.onerror?.(e);
    };

    ws.onclose = (e) => {
      callbacks.onclose?.({
        code: e.code,
        reason: e.reason || '',
        wasClean: e.wasClean
      });
    };

    // Return an object that mimics the SDK session interface
    return Promise.resolve({
      sendRealtimeInput: (input: any) => {
        if (ws.readyState === WebSocket.OPEN) {
          // Wrap the input in a structure the server expects
          ws.send(JSON.stringify({ realtimeInput: input }));
        }
      },
      close: () => ws.close()
    });
  }
}

export const geminiService = new GeminiService();