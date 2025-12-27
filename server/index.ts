import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import cors from 'cors';
import http from 'http';

dotenv.config({ path: '../.env' }); // Load keys from root .env

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

const PORT = 3001;
const MODEL_NAME = 'gemini-2.0-flash-exp';

// --- 1. HTTP Endpoint for Text Chat ---
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history } = req.body;
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    // Reconstruct valid history for the SDK
    const chat = client.chats.create({
      model: MODEL_NAME,
      history: history || [], 
    });

    const result = await chat.sendMessageStream(message);
    
    // Stream response back to client
    res.setHeader('Content-Type', 'text/plain');
    for await (const chunk of result) {
      res.write(chunk.text);
    }
    res.end();
  } catch (error) {
    console.error('Chat Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- 2. WebSocket Endpoint for Live Mode ---
wss.on('connection', async (ws: WebSocket) => {
  console.log('Client connected to Live Proxy');

  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let session: any = null;

  try {
    // Connect to Gemini on the backend
    session = await client.live.connect({
      model: MODEL_NAME,
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
        // Copy your "Patient Teacher" prompt here!
        systemInstruction: `You are Drona... (Paste your full system prompt here)...`,
      },
    });

    // Forward Gemini events -> Client
    session.on('open', () => {
        console.log('Connected to Gemini');
    });

    session.on('message', (msg: any) => {
      // Forward the raw message object to the frontend
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    });

    session.on('close', () => {
      console.log('Gemini session closed');
      ws.close();
    });

    // Forward Client events -> Gemini
    ws.on('message', (data) => {
      // The frontend sends raw JSON stringified messages or blobs
      try {
        const parsed = JSON.parse(data.toString());
        // If it's real-time input (audio/video), forward it
        if (parsed.realtimeInput) {
            session.sendRealtimeInput(parsed.realtimeInput);
        }
      } catch (e) {
        console.error('Error parsing client message', e);
      }
    });

    ws.on('close', () => {
      console.log('Client disconnected');
      session.close();
    });

  } catch (err) {
    console.error('Gemini Connection Failed:', err);
    ws.close();
  }
});

server.listen(PORT, () => {
  console.log(`Proxy Server running on http://localhost:${PORT}`);
});