export class GeminiService {
  private proxyUrl = 'http://localhost:3001';
  private wsUrl = 'ws://localhost:3001';

  // 1. Text Chat via Proxy
  async *streamChat(history: any[], prompt: string) {
    const response = await fetch(`${this.proxyUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: prompt, history })
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
    onclose: (e: CloseEvent) => void;
  }) {
    const ws = new WebSocket(this.wsUrl);

    ws.onopen = () => {
      callbacks.onopen();
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      callbacks.onmessage(msg);
    };

    ws.onerror = (e) => callbacks.onerror(e);
    ws.onclose = (e) => callbacks.onclose(e);

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