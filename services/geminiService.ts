
import { GoogleGenAI, GenerateContentResponse, Modality, LiveServerMessage } from "@google/genai";

export class GeminiService {
  private ai: GoogleGenAI;
  private modelName = 'gemini-3-pro-preview';
  private liveModelName = 'gemini-2.5-flash-native-audio-preview-09-2025';

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: (import.meta as any).env.VITE_GOOGLE_API_KEY });
  }

  private getSystemInstruction(isLive: boolean = false) {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    
    const base = `You are Drona, a wise, patient, and highly intelligent AI mentor. 
    Your goal is to guide students and seekers through complex topics with clarity and depth. 
    Adopt a calm, authoritative yet encouraging tone. 
    IMPORTANT: Current Date is ${dateStr} and Current Time is ${timeStr}. Use this information to answer any questions about the current date, time, or for performing calculations involving time.`;

    if (isLive) {
      return `${base} You are engaging in "Interaction Mode" (real-time voice and vision). You can see the user's shared screen and hear their voice. Use the visual information from the screen to provide context-aware mentorship. Keep your responses concise but insightful.`;
    }
    return `${base} Respond in Markdown format.`;
  }

  async *streamChat(history: { role: string; parts: { text: string }[] }[], prompt: string) {
    const chat = this.ai.chats.create({
      model: this.modelName,
      config: {
        systemInstruction: this.getSystemInstruction(),
        temperature: 0.7,
      }
    });

    const result = await chat.sendMessageStream({ message: prompt });
    
    for await (const chunk of result) {
      const response = chunk as GenerateContentResponse;
      yield response.text || '';
    }
  }

  connectLive(callbacks: {
    onopen: () => void;
    onmessage: (message: LiveServerMessage) => void;
    onerror: (e: ErrorEvent) => void;
    onclose: (e: CloseEvent) => void;
  }) {
    const liveAi = new GoogleGenAI({ apiKey: (import.meta as any).env.VITE_GOOGLE_API_KEY });
    return liveAi.live.connect({
      model: this.liveModelName,
      callbacks,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        systemInstruction: this.getSystemInstruction(true),
      },
    });
  }
}

export const geminiService = new GeminiService();
