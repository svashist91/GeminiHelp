import dotenv from 'dotenv';
import path from 'path';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Modality } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import cors from 'cors';
import http from 'http';
import fs from 'fs';
import multer, { FileFilterCallback } from 'multer';
import { DRONA_SYSTEM_PROMPT, DRONA_INTERACTION_PROMPT } from '../src/prompts/drona';
import Stripe from 'stripe';
import { extractDocxText } from './extractors/docx';
import { createClerkClient, verifyToken } from '@clerk/backend';

// Always load server/.env (backend-only secrets)
dotenv.config({ path: path.resolve(__dirname, ".env") });
console.log("[env] loaded from", path.resolve(__dirname, ".env"));
console.log("[env] CLERK_SECRET_KEY set?", !!process.env.CLERK_SECRET_KEY);
console.log("[env] SUPABASE_URL set?", !!process.env.SUPABASE_URL);
console.log("[env] SUPABASE_SERVICE_ROLE_KEY set?", !!process.env.SUPABASE_SERVICE_ROLE_KEY);
console.log("[env] GOOGLE_API_KEY set?", !!process.env.GOOGLE_API_KEY);



// Safe pdf-parse import for CommonJS/ESM interop
const pdfParseModule = require("pdf-parse");

// pdf-parse v2.4.5 exports PDFParse as a class, not a function
// We need to instantiate it and call getText()
const PDFParse = pdfParseModule?.PDFParse || pdfParseModule?.default?.PDFParse || pdfParseModule;

if (!PDFParse || typeof PDFParse !== "function") {
  const keys = pdfParseModule && typeof pdfParseModule === "object" ? Object.keys(pdfParseModule).join(",") : "n/a";
  throw new Error(`pdf-parse import error: PDFParse class not found. Got ${typeof pdfParseModule}; keys=${keys}`);
}

// --- CONFIGURATION ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_KEY = process.env.GOOGLE_API_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !GEMINI_KEY) {
  console.error("❌ CRITICAL ERROR: Missing API Keys.");
  process.exit(1);
}

if (!STRIPE_SECRET_KEY) {
  console.warn("[env] STRIPE_SECRET_KEY missing: billing/webhooks disabled");
}
if (!STRIPE_WEBHOOK_SECRET) {
  console.warn("[env] STRIPE_WEBHOOK_SECRET missing: webhook verification will fail");
}
if (!CLERK_SECRET_KEY) {
  console.error("[env] CLERK_SECRET_KEY missing: auth/search will fail");
}



// Initialize Stripe client
const stripe = new Stripe(STRIPE_SECRET_KEY || '', { apiVersion: '2025-12-15.clover' });

// --- TEMP UPLOAD DIRECTORY SETUP ---
const TEMP_UPLOAD_DIR = path.resolve(__dirname, '.tmp_uploads');
const TTL_MINUTES = 30;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// Ensure temp directory exists
if (!fs.existsSync(TEMP_UPLOAD_DIR)) {
  fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });
  console.log(`📁 Created temp upload directory: ${TEMP_UPLOAD_DIR}`);
}

// --- MULTER CONFIGURATION ---
const allowedMimeTypes = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
  'text/plain',
  'text/markdown',
  'application/json',
  'text/csv'
];

const storage = multer.diskStorage({
  destination: (_req: any, _file: any, cb: (error: Error | null, destination: string) => void) => {
    cb(null, TEMP_UPLOAD_DIR);
  },
  filename: (_req: any, file: any, cb: (error: Error | null, filename: string) => void) => {
    // Generate safe filename: timestamp-random-safeOriginalName
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${timestamp}-${random}-${safeName}`);
  }
});

const fileFilter = (_req: any, file: any, cb: FileFilterCallback) => {
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} not allowed. Allowed types: ${allowedMimeTypes.join(', ')}`));
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB
  }
});

// --- TTL CLEANUP FUNCTION ---
const cleanupOldFiles = () => {
  try {
    const files = fs.readdirSync(TEMP_UPLOAD_DIR);
    const now = Date.now();
    const ttlMs = TTL_MINUTES * 60 * 1000;
    let deletedCount = 0;

    files.forEach(file => {
      const filePath = path.join(TEMP_UPLOAD_DIR, file);
      try {
        const stats = fs.statSync(filePath);
        const age = now - stats.mtimeMs;
        
        if (age > ttlMs) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      } catch (err) {
        console.warn(`Failed to process file ${file}:`, err);
      }
    });

    if (deletedCount > 0) {
      console.log(`🧹 Cleaned up ${deletedCount} old file(s) from temp directory`);
    }
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
};

// Start cleanup interval
setInterval(cleanupOldFiles, CLEANUP_INTERVAL_MS);
console.log(`🧹 File cleanup scheduled: every ${CLEANUP_INTERVAL_MS / 1000 / 60} minutes, TTL: ${TTL_MINUTES} minutes`);

// Run cleanup on boot
cleanupOldFiles();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());

// --- FILE UPLOAD ROUTE (Ephemeral - temp storage only) ---
app.post('/api/upload', upload.array('files'), async (req: express.Request, res: express.Response) => {
  try {
    const files = (req as any).files as Array<{
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      filename: string;
      path: string;
      size: number;
    }>;
    
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    // Return file metadata (fileId is the stored filename)
    const uploadedFiles = files.map(file => ({
      fileId: file.filename,
      name: file.originalname,
      mimeType: file.mimetype,
      size: file.size
    }));

    console.log(`📎 Uploaded ${uploadedFiles.length} file(s) to temp storage`);
    res.json({ files: uploadedFiles });
  } catch (error: any) {
    console.error('Upload error:', error);
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 20MB.' });
      }
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// --- CRITICAL: STRIPE WEBHOOK ROUTE (Must be BEFORE app.use(express.json)) ---
app.post('/api/webhooks', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  if (!STRIPE_WEBHOOK_SECRET) {
    console.error('❌ STRIPE_WEBHOOK_SECRET is not configured');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  let event;

  try {
    // 1. Verify the event came from Stripe
    event = stripe.webhooks.constructEvent(req.body, sig as string, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error(`❌ Webhook signature verification failed: ${err.message}`);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // 2. Handle the "Checkout Completed" event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    
    // Extract data from session
    const userId = session.client_reference_id;
    const subscriptionId = session.subscription as string;
    const customerId = session.customer as string;

    if (!userId) {
      console.error('❌ No userId found in checkout session');
      return res.status(400).json({ error: 'Missing userId in checkout session' });
    }

    try {
      // Determine tier based on amount_total (2000 cents = Advanced, 5000 cents = Pro)
      const amount = session.amount_total || 0;
      let tier = 'free';
      if (amount === 2000) tier = 'advanced';
      if (amount === 5000) tier = 'pro';

      console.log(`💰 Payment received from ${userId} for ${tier} plan`);

      // 3. Update PROFILE with Stripe Customer ID
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId);

      if (profileError) {
        console.error('❌ Error updating profile:', profileError);
        return res.status(500).json({ error: 'Failed to update profile' });
      }

      // 4. Fetch subscription details to get current_period_end
      let currentPeriodEnd: Date;
      if (subscriptionId) {
        try {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          // Access current_period_end from the subscription object
          const periodEnd = (subscription as any).current_period_end;
          if (periodEnd && typeof periodEnd === 'number') {
            currentPeriodEnd = new Date(periodEnd * 1000);
          } else {
            // Fallback to 30 days from now
            currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          }
        } catch (subError: any) {
          console.error('❌ Error fetching subscription:', subError);
          // Fallback to 30 days from now
          currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        }
      } else {
        // Fallback if no subscription ID
        currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      }

      // 5. Upsert SUBSCRIPTION
      const { error: subscriptionError } = await supabase
        .from('subscriptions')
        .upsert({
          id: subscriptionId,
          user_id: userId,
          status: 'active',
          tier: tier,
          current_period_end: currentPeriodEnd.toISOString()
        }, { onConflict: 'id' });

      if (subscriptionError) {
        console.error('❌ Error saving subscription:', subscriptionError);
        return res.status(500).json({ error: 'Failed to save subscription' });
      }

      console.log(`✅ Successfully processed subscription for user ${userId}`);
    } catch (error: any) {
      console.error('❌ Error processing checkout session:', error);
      return res.status(500).json({ error: error.message || 'Internal server error' });
    }
  }

  res.json({ received: true });
});


app.use(express.json()); 

const PORT = 3001;
const CHAT_MODEL = "gemini-2.5-flash";
const LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-09-2025";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- HELPER: Compact History ---
const compactHistory = (messages: any[]): { role: string; parts: { text: string }[] }[] => {
  if (!Array.isArray(messages)) return [];

  // Filter and clean messages
  const cleaned = messages
    .map((msg: any) => {
      // Ensure role is only user or model
      const role = msg.role === 'user' ? 'user' : 'model';
      
      // Extract parts
      if (!Array.isArray(msg.parts)) return null;
      
      const parts = msg.parts
        .map((p: { text?: any }): { text: string } | null => {
          const text = String(p.text || '').trim();
          // Drop empty/streaming partials
          if (!text || text.length === 0) return null;
          // Truncate very long content to 2000 chars
          const truncated = text.length > 2000 ? text.slice(0, 2000) + '...' : text;
          return { text: truncated };
        })
        .filter((p: { text: string } | null): p is { text: string } => p !== null);
      
      if (!parts.length) return null;
      
      return { role, parts };
    })
    .filter((msg): msg is { role: string; parts: { text: string }[] } => msg !== null);

  // Keep last 12 messages max
  return cleaned.slice(-12);
};

// --- HELPER: Timeout Wrapper ---
const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string = 'Operation timed out'
): Promise<{ ok: true; value: T } | { ok: false; error: string }> => {
  return Promise.race([
    promise.then(value => ({ ok: true as const, value })),
    new Promise<{ ok: false; error: string }>((resolve) =>
      setTimeout(() => resolve({ ok: false, error: errorMessage }), timeoutMs)
    )
  ]);
};

// --- HELPER: Process Attachment Files ---
const processAttachment = async (fileId: string): Promise<{ part: any; mimeType: string; size: number } | null> => {
  const filePath = path.join(TEMP_UPLOAD_DIR, fileId);
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  Attachment file not found: ${fileId}`);
    return null;
  }

  const stats = fs.statSync(filePath);
  const fileBuffer = fs.readFileSync(filePath);
  
  // Determine mime type from file extension or use default
  const ext = path.extname(fileId).toLowerCase();
  let mimeType = 'application/octet-stream';
  
  // Try to infer from extension
  const mimeMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.csv': 'text/csv'
  };
  
  if (mimeMap[ext]) {
    mimeType = mimeMap[ext];
  }
  
  // Log only metadata (safety requirement)
  console.log(`📎 Processing attachment: fileId=${fileId}, mimeType=${mimeType}, size=${stats.size} bytes`);

  try {
    // Handle images (png, jpg, webp)
    if (mimeType.startsWith('image/')) {
      const base64 = fileBuffer.toString('base64');
      return {
        part: {
          inlineData: {
            mimeType: mimeType,
            data: base64
          }
        },
        mimeType,
        size: stats.size
      };
    }
    
    // Handle text files (txt, md, json, csv)
    if (mimeType.startsWith('text/') || mimeType === 'application/json') {
      const text = fileBuffer.toString('utf-8');
      const maxChars = 50000;
      const truncated = text.length > maxChars 
        ? text.slice(0, maxChars) + `\n\n[File truncated: original length was ${text.length} characters]`
        : text;
      
      // Extract original filename from fileId (remove timestamp-random- prefix)
      const originalName = fileId.replace(/^\d+-[a-z0-9]+-/, '');
      
      return {
        part: {
          text: `FILE: ${originalName}\n\n${truncated}`
        },
        mimeType,
        size: stats.size
      };
    }
    
    // Handle PDFs (detect by mimeType or filename extension)
    if (mimeType === 'application/pdf' || fileId.toLowerCase().endsWith('.pdf')) {
      try {
        // Extract original filename from fileId (remove timestamp-random- prefix)
        const originalName = fileId.replace(/^\d+-[a-z0-9]+-/, '');
        
        // Debug: log pdf-parse module info (only when processing PDF)
        console.log("[PDF] pdf-parse typeof:", typeof pdfParseModule);
        console.log("[PDF] pdf-parse keys:", pdfParseModule && typeof pdfParseModule === "object" ? Object.keys(pdfParseModule).join(",") : null);
        
        // Ensure we have a Node Buffer
        const buffer = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer);
        
        // Parse PDF using PDFParse class (v2.4.5 API)
        const pdfInstance = new PDFParse({ data: buffer, verbosity: 0 });
        const result = await pdfInstance.getText({ max: 25 });
        let text = (result?.text || "").trim();
        
        // Clean up instance
        await pdfInstance.destroy();
        
        // Debug: log extracted text length
        console.log("[PDF] extracted chars:", text.length);
        
        // Handle empty text (scanned/image PDF)
        if (!text || text.length === 0) {
          return {
            part: {
              text: `PDF: ${originalName}\n\nPDF attached but no extractable text found (scanned image).`
            },
            mimeType: 'application/pdf',
            size: stats.size
          };
        }
        
        // Cap text length to 60,000 characters
        const maxChars = 60000;
        if (text.length > maxChars) {
          text = text.slice(0, maxChars) + '\n\n[Truncated: PDF too long. Ask user to specify page/section.]';
        }
        
        return {
          part: {
            text: `PDF: ${originalName}\n\n${text}`
          },
          mimeType: 'application/pdf',
          size: stats.size
        };
      } catch (pdfError: any) {
        // Error handling: don't throw, return safe note part
        console.error("[PDF] extraction failed:", pdfError?.stack || pdfError);
        const originalName = fileId.replace(/^\d+-[a-z0-9]+-/, '');
        return {
          part: {
            text: `PDF: ${originalName}\n\n[Could not extract text from this PDF. Please try a different file or specify pages.]`
          },
          mimeType: 'application/pdf',
          size: stats.size
        };
      }
    }
    
    // Handle DOCX files (detect by mimeType or filename extension)
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileId.toLowerCase().endsWith('.docx')) {
      try {
        // Extract original filename from fileId (remove timestamp-random- prefix)
        const originalName = fileId.replace(/^\d+-[a-z0-9]+-/, '');
        
        // Ensure we have a Node Buffer
        const buffer = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer);
        
        // Extract DOCX text with 10s timeout
        const extractionResult = await withTimeout(
          extractDocxText(buffer),
          10000,
          'Extraction timeout. Please retry.'
        );
        
        if (!extractionResult.ok) {
          console.error("[DOCX] extraction timeout or failed:", extractionResult.error);
          return {
            part: {
              text: `DOCX: ${originalName}\n\n[Could not extract text from this DOCX: ${extractionResult.error}]`
            },
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            size: stats.size
          };
        }
        
        let text = extractionResult.value;
        
        // Debug: log extracted text length
        console.log("[DOCX] extracted chars:", text.length);
        
        // Handle empty text
        if (!text || text.length === 0) {
          return {
            part: {
              text: `DOCX: ${originalName}\n\nDOCX extracted 0 chars`
            },
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            size: stats.size
          };
        }
        
        // Cap text length to 60,000 characters
        const maxChars = 60000;
        if (text.length > maxChars) {
          text = text.slice(0, maxChars) + '\n\n[Truncated: DOCX too long. Ask user to specify section.]';
        }
        
        return {
          part: {
            text: `=== ATTACHMENT: ${originalName} (DOCX) ===\n${text}\n=== END ATTACHMENT ===`
          },
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: stats.size
        };
      } catch (docxError: any) {
        // Error handling: don't throw, return safe note part
        console.error("[DOCX] extraction failed:", docxError?.stack || docxError);
        const originalName = fileId.replace(/^\d+-[a-z0-9]+-/, '');
        return {
          part: {
            text: `DOCX: ${originalName}\n\n[Could not extract text from this DOCX. Please try a different file.]`
          },
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: stats.size
        };
      }
    }
    
    // Fallback for unknown types
    console.warn(`⚠️  Unsupported file type: ${mimeType} for ${fileId}`);
    return null;
  } catch (error: any) {
    console.error(`❌ Error processing attachment ${fileId}:`, error.message);
    return null;
  }
};

// --- USER SYNC ROUTE ---
app.post('/api/users', async (req, res) => {
  const { id, email, fullName } = req.body;

  if (!id) return res.status(400).json({ error: 'Missing User ID' });

  // "Upsert" = Update if exists, Insert if new
  const { error } = await supabase
    .from('profiles')
    .upsert({ 
      id: id, 
      email: email, 
      full_name: fullName,
      // We don't touch stripe_customer_id here, that's handled separately
    }, { onConflict: 'id' });

  if (error) {
    console.error("❌ Error syncing user profile:", error);
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true });
});


// --- 1. CHAT ROUTE (FIXED) ---
app.post('/api/chat', async (req, res) => {
  const attachmentIds: string[] = req.body.attachmentIds || [];
  const filesToDelete: string[] = [];

  try {
    const { message, history } = req.body;

    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Invalid or empty message' });
    }
    
    // Apply compactHistory to prevent prompt drift
    const compactedHistory = compactHistory(history || []);
    
    const client = new GoogleGenAI({ apiKey: GEMINI_KEY });
    
    // Build user message parts (attachments first, then text)
    const attachmentParts: any[] = [];
    
    // Process attachments if any
    if (Array.isArray(attachmentIds) && attachmentIds.length > 0) {
      for (const fileId of attachmentIds) {
        const processed = await processAttachment(fileId);
        if (processed && processed.part) {
          attachmentParts.push(processed.part);
          filesToDelete.push(fileId);
        }
      }
    }
    
    // Combine attachment parts with user message text
    const userParts: any[] = [
      ...attachmentParts,
      { text: message.trim() }
    ];
    
    // Combine history + current message into a single contents array
    const contents = [
      ...compactedHistory,
      { role: 'user', parts: userParts }
    ];
    
    // Use models.generateContentStream instead of chats.create().sendMessageStream()
    const result = await client.models.generateContentStream({
      model: CHAT_MODEL,
      config: {
        systemInstruction: DRONA_SYSTEM_PROMPT,
        temperature: 0.4,
        maxOutputTokens: 600
      },
      contents
    });
    
    // Set proper streaming headers
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    
    for await (const chunk of result) {
      const chunkText = chunk.text; 
      if (chunkText) {
        res.write(chunkText);
      }
    }
    res.end();

  } catch (error: any) {
    console.error("🔥 Chat API Error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    } else {
      res.end();
    }
  } finally {
    // Delete temp files after response completes (success or error)
    for (const fileId of filesToDelete) {
      try {
        const filePath = path.join(TEMP_UPLOAD_DIR, fileId);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`🗑️  Deleted temp file: ${fileId}`);
        }
      } catch (deleteError: any) {
        // Ignore deletion errors (file may have been cleaned up by TTL)
        console.warn(`⚠️  Failed to delete temp file ${fileId}:`, deleteError.message);
      }
    }
  }
});

// --- 2. DB ROUTES (Existing) ---
app.get('/api/sessions', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });
  
  const { data: sessions } = await supabase.from('sessions').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (!sessions) return res.json([]);

  const sessionIds = sessions.map(s => s.id);
  const { data: messages } = await supabase.from('messages').select('*').in('session_id', sessionIds).order('timestamp', { ascending: true });
  
  const fullSessions = sessions.map(s => ({
    ...s,
    createdAt: s.created_at,
    messages: messages?.filter(m => m.session_id === s.id).map(m => ({ ...m, timestamp: m.timestamp })) || []
  }));
  res.json(fullSessions);
});

app.post('/api/sessions', async (req, res) => {
  const { id, userId, title, createdAt } = req.body;
  await supabase.from('sessions').upsert({ id, user_id: userId, title, created_at: createdAt });
  res.json({ success: true });
});

app.post('/api/messages', async (req, res) => {
  const { id, sessionId, role, content, timestamp } = req.body;
  await supabase.from('messages').insert({ id, session_id: sessionId, role, content, timestamp });
  res.json({ success: true });
});

app.delete('/api/sessions/:id', async (req, res) => {
  await supabase.from('sessions').delete().eq('id', req.params.id);
  res.json({ success: true });
});

// --- SEARCH ROUTE ---
// GET /api/chat/search?q=term&limit=20
// 
// Test with curl:
// curl "http://localhost:3001/api/chat/search?q=pluto" \
//   -H "Authorization: Bearer <clerk_jwt>"
//
app.get('/api/chat/search', async (req, res) => {
  try {
    // Authenticate Clerk user
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    let userId: string;

    try {
      if (CLERK_SECRET_KEY) {
        // Verify the JWT token and extract userId
        const { sub } = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });
        if (!sub) {
          return res.status(401).json({ error: 'Invalid token: missing user ID' });
        }
        userId = sub;
        console.log('[search] userId:', userId);
      } else {
        // Fallback: if Clerk not configured, allow userId from query (for dev)
        console.warn('[search] CLERK_SECRET_KEY not set, using userId from query (dev only)');
        userId = req.query.userId as string;
        if (!CLERK_SECRET_KEY) {
          return res.status(500).json({ error: "Server misconfigured: CLERK_SECRET_KEY missing" });
        }
        
      }
    } catch (authError: any) {
      console.error('[search] Clerk auth error:', authError.message);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Parse query parameters
    const q = req.query.q as string;
    const limitParam = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const limit = Math.min(limitParam, 50); // Cap at 50

    // Validate query
    if (!q || q.trim().length < 2) {
      return res.json({ query: q || '', results: [] });
    }

    const query = q.trim();
    console.log('[search] query:', query, 'limit:', limit);

    // Call Supabase RPC function
    const { data: searchResults, error: searchError } = await supabase.rpc('search_chat_messages', {
      p_user_id: userId,
      p_query: query,
      p_limit: limit
    });

    if (searchError) {
      console.error('[search] Supabase error:', searchError);
      return res.status(500).json({ error: 'Search failed', details: searchError.message });
    }

    if (!searchResults || searchResults.length === 0) {
      console.log('[search] result count: 0');
      return res.json({ query, results: [] });
    }

    console.log('[search] result count:', searchResults.length);

    // Group results by session_id
    const sessionMap = new Map<string, {
      sessionId: string;
      sessionTitle: string;
      hits: Array<{
        messageId: string;
        role: string;
        createdAt: string;
        snippet: string;
        rank: number;
      }>;
    }>();

    // Get session titles
    const sessionIds = [...new Set(searchResults.map((r: any) => r.session_id))];
    const { data: sessions } = await supabase
      .from('sessions')
      .select('id, title')
      .in('id', sessionIds);

    const sessionTitleMap = new Map(
      (sessions || []).map((s: any) => [s.id, s.title || 'Untitled Session'])
    );

    // Group results
    for (const result of searchResults) {
      const sessionId = result.session_id;
      if (!sessionMap.has(sessionId)) {
        sessionMap.set(sessionId, {
          sessionId,
          sessionTitle: sessionTitleMap.get(sessionId) || 'Untitled Session',
          hits: []
        });
      }

      const sessionGroup = sessionMap.get(sessionId)!;
      sessionGroup.hits.push({
        messageId: result.message_id || result.id,
        role: result.role,
        createdAt: result.created_at || result.timestamp,
        snippet: result.snippet || result.content?.substring(0, 200) || '',
        rank: result.rank || 0
      });
    }

    // Convert map to array and sort by top rank
    const results = Array.from(sessionMap.values()).map(group => ({
      ...group,
      hits: group.hits.sort((a, b) => b.rank - a.rank)
    })).sort((a, b) => {
      const aTopRank = Math.max(...a.hits.map(h => h.rank));
      const bTopRank = Math.max(...b.hits.map(h => h.rank));
      return bTopRank - aTopRank;
    });

    res.json({ query, results });
  } catch (error: any) {
    console.error('[search] Unexpected error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// --- 3. LIVE ROUTE ---
wss.on('connection', async (ws: WebSocket) => {
  console.log("[WS] client connected");
  console.log("[LIVE] connecting model=", LIVE_MODEL);
  
  let session: any;
  const client = new GoogleGenAI({ apiKey: GEMINI_KEY });
  
  try {
    session = await client.live.connect({
      model: LIVE_MODEL,
      callbacks: {
        onmessage: (msg: any) => {
          if (msg?.error) console.error("[LIVE] msg.error:", msg.error);
          ws.send(JSON.stringify(msg));
        },
        onerror: (err: any) => { 
          console.error("[LIVE] session error:", err); 
          try { ws.close(); } catch {}
        },
        onclose: () => {
          console.log("[LIVE] session closed");
          try { ws.close(); } catch {}
        }
      },
      config: { 
        systemInstruction: DRONA_INTERACTION_PROMPT,
        responseModalities: [Modality.AUDIO], 
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } 
      }
    });
  } catch (e) {
    console.error("[LIVE] connect failed:", e);
    try { ws.close(); } catch {}
    return;
  }


  ws.on('message', (data) => { 
    try { 
      session.sendRealtimeInput(JSON.parse(data.toString()).realtimeInput); 
    } catch(e) {
      console.error("[WS] message send error:", e);
    }
  });

  ws.on("close", (code, reason) => {
    console.warn("[WS] closed", { code, reason: reason?.toString() });
    try { session.close(); } catch {}
  });

  ws.on("error", (err) => {
    console.error("[WS] error:", err);
    try { session.close(); } catch {}
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 Proxy Server running on http://localhost:${PORT}`);
});


