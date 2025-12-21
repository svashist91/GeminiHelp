
import { GoogleGenAI, GenerateContentResponse, Modality, LiveServerMessage } from "@google/genai";

// Removed the intermediate API_KEY constant to comply with the strict guideline of using process.env.API_KEY directly.

export class GeminiService {
  private ai: GoogleGenAI;
  private modelName = 'gemini-3-pro-preview';
  private liveModelName = 'gemini-2.5-flash-native-audio-preview-09-2025';

  constructor() {
    // ALWAYS use process.env.API_KEY directly when initializing the client as per guidelines.
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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
      // Using .text property instead of .text() method as per guidelines.
      yield response.text || '';
    }
  }

  connectLive(callbacks: {
    onopen: () => void;
    onmessage: (message: LiveServerMessage) => void;
    onerror: (e: ErrorEvent) => void;
    onclose: (e: CloseEvent) => void;
  }) {
    // ALWAYS use process.env.API_KEY directly when initializing the client for each connection.
    const liveAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
    return liveAi.live.connect({
      model: this.liveModelName,
      callbacks,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        systemInstruction: `You are Drona, a wise and patient AI mentor. You are engaging in a real-time voice and vision conversation. 
        You can see the user's screen through periodic snapshots and hear their voice. 
        Keep your responses concise but insightful. Use what you see on the screen to provide context-aware guidance. 
        Be encouraging and helpful. If you don't know something, admit it gracefully.`,
      },
    });
  }
}

export const geminiService = new GeminiService();
