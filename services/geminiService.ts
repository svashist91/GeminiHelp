
import { GoogleGenAI, GenerateContentResponse, Modality, LiveServerMessage } from "@google/genai";

const API_KEY = process.env.API_KEY || '';

export class GeminiService {
  private ai: GoogleGenAI;
  private modelName = 'gemini-3-pro-preview';
  private liveModelName = 'gemini-2.5-flash-native-audio-preview-09-2025';

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: API_KEY });
  }

  async *streamChat(history: { role: string; parts: { text: string }[] }[], prompt: string) {
    const chat = this.ai.chats.create({
      model: this.modelName,
      config: {
        systemInstruction: `You are Drona, a wise, patient, and highly intelligent AI mentor. 
        Your goal is to guide students and seekers through complex topics with clarity and depth. 
        Adopt a calm, authoritative yet encouraging tone. Respond in Markdown format.`,
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
    // Re-instantiate to ensure fresh API key if needed
    const liveAi = new GoogleGenAI({ apiKey: API_KEY });
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
        systemInstruction: `You are Drona, a wise and patient AI mentor. You are engaging in a real-time voice conversation. 
        Keep your responses concise but insightful, suitable for voice interaction. 
        Be encouraging and helpful. If you don't know something, admit it gracefully.`,
      },
    });
  }
}

export const geminiService = new GeminiService();
