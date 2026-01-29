import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Message, Role, ChatSession } from '../types';
import { geminiService } from '../services/geminiService';
import MessageBubble from '../components/MessageBubble';
import InputBar from '../components/InputBar';
import VoiceOverlay from '../components/VoiceOverlay';
import Sidebar from '../components/Sidebar';
import { decode, decodeAudioData, createBlob } from '../utils/audioUtils';
import { LiveServerMessage } from '@google/genai';
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
  useUser,
  useAuth
} from "@clerk/clerk-react";
import { dbService, getProjectContext } from '../services/dbService';
import { applyProjectContextPatch } from '../services/contextApi';
import { Patch, PlanContext, createEmptyPlanContext, validatePlanContext } from '../shared/contextSchema';
import PricingModal from '../components/PricingModal';
import SearchModal from '../components/SearchModal';
import { useContextRecorder } from './hooks/useContextRecorder';
import { usePlanContextWriter } from './hooks/usePlanContextWriter';
import PlanPanel from './components/plan/PlanPanel';

type Project = {
  id: string;
  name: string;
  createdAt: string;
};

const LandingPage = () => (
  <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white p-6 text-center">
    <div className="w-24 h-24 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl flex items-center justify-center shadow-2xl mb-8 transform rotate-12">
      <span className="text-5xl font-bold serif italic">D</span>
    </div>
    <h1 className="text-4xl md:text-6xl font-bold serif mb-6">Master Your Craft</h1>
    <p className="text-slate-400 text-lg max-w-xl mb-10 leading-relaxed">
      Drona is an AI mentor that sees what you see. Connect your screen and microphone for real-time, expert guidance on any task.
    </p>
    <SignInButton mode="modal">
      <button className="px-8 py-4 bg-white text-slate-900 rounded-full font-bold text-lg hover:bg-indigo-50 transition-all shadow-lg hover:shadow-indigo-500/20 transform hover:-translate-y-1">
        Start Mentorship
      </button>
    </SignInButton>
  </div>
  
);

const App: React.FC = () => {
  // 1. State Hooks
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('drona_theme');
    return saved !== 'light';
  });

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const { user } = useUser();
  const { getToken } = useAuth();

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    const lastActive = localStorage.getItem('drona_active_id');
    return lastActive || '';
  });

  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => {
    const v = localStorage.getItem("drona_active_project_id");
    return v ? v : null;
  });
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectContext, setProjectContext] = useState<PlanContext | null>(null);
  const [isApplyingPatch, setIsApplyingPatch] = useState(false);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isInteractionMode, setIsInteractionMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isInteractionStreaming, setIsInteractionStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPricingOpen, setIsPricingOpen] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'plan'>('chat');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [areAllExpanded, setAreAllExpanded] = useState(true);

  type InteractionStatus = "idle" | "requesting_permissions" | "connecting" | "active" | "reconnecting" | "error";
  const [interactionStatus, setInteractionStatus] = useState<InteractionStatus>("idle");
  const [interactionError, setInteractionError] = useState<string>("");

  // 2. Refs
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const liveSessionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameIntervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const visionStreamRef = useRef<MediaStream | null>(null);

  const currentInputTransRef = useRef('');
  const currentOutputTransRef = useRef('');
  const lastUserMsgIdRef = useRef<string | null>(null);
  const lastDronaMsgIdRef = useRef<string | null>(null);
  
  // Transcript timeout safety
  const transcriptTimeoutRef = useRef<number | null>(null);
  const firstTranscriptTimeRef = useRef<number | null>(null);
  const sessionsRef = useRef<ChatSession[]>([]);
  const activeSessionIdRef = useRef<string>('');

  const stopRequestedRef = useRef(false);
  const reconnectAttemptedRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectingRef = useRef(false);
  const lastPlanCaptureMsgIdRef = useRef<string | null>(null);

  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const heartbeatRef = useRef<number | null>(null);

  // 3. Effects
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('drona_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('drona_theme', 'light');
    }
  }, [isDarkMode]);

  // Extract session loading logic into a reusable function
  const refreshSessions = useCallback(async () => {
    if (!user) return;
    try {
      const data = await dbService.getSessions(user.id);
      const parsed = data.map((s: any) => ({
        ...s,
        createdAt: new Date(s.createdAt),
        messages: s.messages.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp)
        }))
      }));
      setSessions(parsed);
    } catch (e) {
      console.error('Error refreshing sessions:', e);
    }
  }, [user]);

  const refreshProjects = useCallback(async () => {
    if (!user) return;
    try {
      const rows = await dbService.getProjects(user.id);
      const normalized: Project[] = (rows ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        createdAt: p.created_at ?? p.createdAt ?? new Date().toISOString(),
      }));
      setProjects(normalized);
    } catch (e) {
      console.error('Error refreshing projects:', e);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      setIsLoading(true);
      dbService.syncUser(user)
        .then(async () => {
          await refreshProjects();
          await refreshSessions();
        })
        .catch(error => console.error('Error syncing user:', error))
        .finally(() => setIsLoading(false));
    }
  }, [user, refreshProjects, refreshSessions]);

  useEffect(() => {
    localStorage.setItem('drona_active_id', activeSessionId);
  }, [activeSessionId]);

  useEffect(() => {
    if (activeProjectId) {
      localStorage.setItem("drona_active_project_id", activeProjectId);
    } else {
      localStorage.removeItem("drona_active_project_id");
    }
  }, [activeProjectId]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    return () => {
      // Cleanup reconnect timer on unmount
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    // Check if user just returned from Stripe
    const query = new URLSearchParams(window.location.search);
    const tier = query.get('tier');
    
    if (tier) {
      // 1. Clear the URL so they don't see the ugly parameters
      window.history.replaceState({}, document.title, "/");
      
      // 2. Show success (Simple alert for MVP, or a beautiful modal later)
      alert(`🎉 Payment Successful! You are now on the ${tier.toUpperCase()} plan.`);
      
      // TODO: In a production app, sync subscription_status to the database here
      // You would fetch the user's subscription status from your backend/DB
      // and update local state to unlock features accordingly
    }
  }, []);

  const activeSession = sessions.find(s => s.id === activeSessionId) || null;
  const filteredSessions = activeProjectId
    ? sessions.filter(session => session.project_id === activeProjectId)
    : sessions;
  const activeProject = projects.find(p => p.id === activeProjectId) || null;

  const formatShortDate = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  const handleCreateChatInProject = useCallback(() => {
    if (!activeProjectId) return;
    createNewSession();
  }, [activeProjectId]);

  const { applyFromExchange } = usePlanContextWriter();

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [activeSession?.messages, scrollToBottom]);

  // ✅ VISUAL AUDIT TRAIL
  // Silently watches for screen changes when interaction mode is active
  useContextRecorder({
    isActive: isInteractionMode,
    videoRef: videoRef,
    sessionId: activeSessionId,
    userId: user?.id,     
    getToken: getToken
  });

  // 4. Helper Functions
  const createNewSession = () => {
    const newId = Date.now().toString();
    const newSession: ChatSession = {
      id: newId,
      title: 'New Session',
      messages: [],
      createdAt: new Date(),
      project_id: activeProjectId ?? null,
    };
  
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newId);
  
    // Persist immediately so it survives refresh
    if (user) {
      dbService.saveSession(newSession, user.id, activeProjectId ?? null);
    }
  
    // If you have activeSessionIdRef, keep it synced
    if (typeof activeSessionIdRef !== 'undefined') {
      activeSessionIdRef.current = newId;
    }
  
    return newId;
  };
  

  const createProject = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!user) return;

    try {
      const created = await dbService.createProject(user.id, trimmed, null);
      const normalized: Project = {
        id: created.id,
        name: created.name,
        createdAt: created.created_at ?? new Date().toISOString(),
      };

      setProjects(prev => [normalized, ...prev]);
      setActiveProjectId(normalized.id);
      setActiveSessionId("");
    } catch (e) {
      console.error('Error creating project:', e);
      alert('Unable to create project. Please try again.');
    }
  }, [user]);

  const handleDeleteProject = async (projectId: string) => {
    try {
      await dbService.deleteProject(projectId);
      setProjects(prev => prev.filter(p => p.id !== projectId));
      setSessions(prev => prev.filter(s => s.project_id !== projectId));
      if (activeProjectId === projectId) {
        setActiveProjectId(null);
        setActiveSessionId('');
      }
    } catch (e) {
      console.error('Error deleting project:', e);
    }
  };

  const handleDeleteSessionConfirmed = async (sessionId: string) => {
    try {
      await dbService.deleteSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (activeSessionId === sessionId) setActiveSessionId('');
    } catch (e) {
      console.error('Error deleting session:', e);
    }
  };

  const handleSelectProject = useCallback((id: string) => {
    setActiveProjectId(id);
    // Clear the current chat when switching project context
    setActiveSessionId('');
    void (async () => {
      try {
        const ctx = await getProjectContext(id);
        console.log('[CONTEXT] project_context row:', ctx);
        console.log('[CONTEXT] context_json:', ctx.context_json);
        const next = ctx?.context_json;
        if (next && validatePlanContext(next)) {
          setProjectContext(next);
        } else {
          console.warn('[CONTEXT] Invalid or missing context_json; using empty context');
          setProjectContext(createEmptyPlanContext());
        }
      } catch (e) {
        console.error('[CONTEXT] Failed to load project context', e);
      }
    })();
  }, []);

  const handleApplyTestStep = useCallback(async () => {
    if (!activeProjectId) return;
    const baseContext = projectContext ?? createEmptyPlanContext();
    const baseVersion = baseContext.version || 1;
    const stepId = `step_${Date.now().toString()}`;
    const patch: Patch = {
      patch_id: `patch_${Date.now().toString()}`,
      ops: [
        {
          op: "upsert_step",
          step: {
            id: stepId,
            title: `Test step ${new Date().toLocaleTimeString()}`,
            status: "todo",
            parent: null,
            children: [],
            depends_on: []
          }
        },
        {
          op: "add_root_step",
          id: stepId
        }
      ]
    };

    setIsApplyingPatch(true);
    console.groupCollapsed('[UI] handleApplyTestStep');
    console.log('activeProjectId', activeProjectId);
    console.log('baseContext.version', baseContext.version);
    console.log('baseVersion (request)', baseVersion);
    console.log('patch_id', patch.patch_id);
    console.log('ops', patch.ops.map(op => op.op));
    console.log('patch', patch);
    try {
      const res = await applyProjectContextPatch({
        projectId: activeProjectId,
        baseVersion,
        patch,
        getToken
      });

      console.log('response', res);

      if (res.ok) {
        setProjectContext(res.context);
        return;
      }

      if ('error' in res && res.error === "version_conflict" && 'context' in res) {
        setProjectContext(res.context as PlanContext);
        return;
      }

      console.error('[context-apply] failed:', res);
      const errorMessage = [
        `error: ${(res as any).error ?? 'unknown'}`,
        `message: ${(res as any).message ?? 'n/a'}`,
        `status: ${(res as any).status ?? 'n/a'}`
      ].join('\n');
      alert(errorMessage);
    } finally {
      setIsApplyingPatch(false);
      console.groupEnd();
    }
  }, [activeProjectId, projectContext, getToken]);

  const handleSelectSession = async (id: string) => {
    setActiveSessionId(id);

    // If session exists but has no messages, refresh from DB
    const session = sessionsRef.current.find(s => s.id === id);
    if (user && (!session || session.messages.length === 0)) {
      try {
        const data = await dbService.getSessions(user.id);
        const parsed = data.map((s: any) => ({
          ...s,
          createdAt: new Date(s.createdAt),
          messages: s.messages.map((m: any) => ({
            ...m,
            timestamp: new Date(m.timestamp)
          }))
        }));
        setSessions(parsed);
      } catch (e) {
        console.error('Error refreshing sessions:', e);
      }
    }
  };

  const handleNavigateToMessage = useCallback(async (sessionId: string, messageId: string) => {
    setIsSearchOpen(false);
    await handleSelectSession(sessionId);

    window.setTimeout(() => {
      const el = document.getElementById(`msg-${messageId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setHighlightedMessageId(messageId);
      window.setTimeout(() => {
        setHighlightedMessageId(prev => (prev === messageId ? null : prev));
      }, 1500);
    }, 300);
  }, [handleSelectSession]);


  const stopAllAudio = () => {
    sourcesRef.current.forEach(source => {
      try {
        source.stop();
      } catch (e) {
        // noop
      }
    });
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  };

  const hasLiveAudio = (s: MediaStream | null) => !!s && s.getAudioTracks().some(t => t.readyState === "live");
  const hasLiveVideo = (s: MediaStream | null) => !!s && s.getVideoTracks().some(t => t.readyState === "live");

  // Convert Float32 PCM to Int16 PCM (little-endian) for Gemini Live
  const floatTo16BitPCM = (float32: Float32Array): Uint8Array => {
    const buffer = new ArrayBuffer(float32.length * 2);
    const view = new DataView(buffer);
    let offset = 0;
    for (let i = 0; i < float32.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, float32[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Uint8Array(buffer);
  };

  const ensureAudioCapturePipeline = () => {
    if (!inputAudioContextRef.current || !streamRef.current) return;
    if (scriptProcessorRef.current && mediaSourceRef.current) return; // already running

    const ctx = inputAudioContextRef.current;
    const source = ctx.createMediaStreamSource(streamRef.current);
    const processor = ctx.createScriptProcessor(4096, 1, 1);

    let debugLogged = false; // One-time debug log

    processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      
      // Use the helper for reliable Float32 -> Int16 conversion
      const pcmBlob = createBlob(inputData);
      
      if (liveSessionRef.current) {
        try {
          liveSessionRef.current.sendRealtimeInput({ media: pcmBlob });
        } catch (e) {
          console.error("Error sending audio frame:", e);
        }
      }
    };

    source.connect(processor);
    processor.connect(ctx.destination);

    mediaSourceRef.current = source;
    scriptProcessorRef.current = processor;
  };

  const softFailInteractionMode = (msg: string) => {
    // keep overlay up
    setIsInteractionMode(true);
          setIsLoading(false);
    setIsListening(false);
    setIsSpeaking(false);
    setInteractionStatus("error");
    setInteractionError(msg);
  };

  const onLiveMessage = useCallback(async (message: LiveServerMessage) => {
          const base64Audio =
            message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
          if (base64Audio && outputAudioContextRef.current) {
            setIsSpeaking(true);
            const ctx = outputAudioContextRef.current;
            nextStartTimeRef.current = Math.max(
              nextStartTimeRef.current,
              ctx.currentTime
            );
            const audioBuffer = await decodeAudioData(
              decode(base64Audio),
              ctx,
              24000,
              1
            );
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(ctx.destination);
            // Import and integrate the useContextRecorder hook
            source.addEventListener('ended', () => {
              sourcesRef.current.delete(source);
              if (sourcesRef.current.size === 0) setIsSpeaking(false);
            });

            source.start(nextStartTimeRef.current);
            nextStartTimeRef.current += audioBuffer.duration;
            sourcesRef.current.add(source);
          }

          if (message.serverContent?.interrupted) {
            stopAllAudio();
            setIsSpeaking(false);
          }

          if (message.serverContent?.inputTranscription) {
            useContextRecorder({
              isActive: isInteractionMode,
              videoRef: videoRef,
              sessionId: activeSessionId,
              userId: user?.id,
              getToken: getToken
            });

            const text = message.serverContent.inputTranscription.text;
            console.log("📝 [Front] Rx User Trans:", text);
            setIsListening(true);
            currentInputTransRef.current += text;
            syncInteractionModeTranscription();
          }

          if (message.serverContent?.outputTranscription) {
            const text = message.serverContent.outputTranscription.text;
            console.log("📝 [Front] Rx Drona Trans:", text);
            currentOutputTransRef.current += text;
            syncInteractionModeTranscription();
          }

          if (message.serverContent?.turnComplete) {
            console.log("🏁 [Front] Turn Complete. Triggering save...");
            // Turn complete: finalize transcripts and persist to DB
            await finalizeTranscriptTurn(false);
          }
  }, []);

  const reconnectLiveSession = async () => {
    if (stopRequestedRef.current) return;

    setIsInteractionMode(true);
    setInteractionStatus("connecting");
    setIsLoading(true);

    // close only the live session
    if (liveSessionRef.current) {
      try { liveSessionRef.current.close(); } catch {}
      liveSessionRef.current = null;
    }

    // reuse or reacquire streams
    if (!hasLiveVideo(visionStreamRef.current)) {
      setInteractionStatus("requesting_permissions");
      try {
        visionStreamRef.current = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 } });
        if (videoRef.current) {
          videoRef.current.srcObject = visionStreamRef.current;
          await videoRef.current.play().catch(() => {});
        }
      } catch (err) {
        softFailInteractionMode("Screen share permission denied. Please allow screen sharing to continue.");
        return;
      }
    }

    if (!hasLiveAudio(streamRef.current)) {
      setInteractionStatus("requesting_permissions");
      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        softFailInteractionMode("Microphone permission denied. Please allow microphone access to continue.");
        return;
      }
    }

    // DO NOT recreate audio contexts here (only if null)
    if (!inputAudioContextRef.current) {
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    }
    if (!outputAudioContextRef.current) {
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }

    // Setup audio processing if not already set up
    ensureAudioCapturePipeline();

    // Setup video frame capture if not already set up
    if (videoRef.current && visionStreamRef.current) {
      videoRef.current.srcObject = visionStreamRef.current;
      videoRef.current.play();

      // Only start interval if not already running
      if (frameIntervalRef.current === null) {
        frameIntervalRef.current = window.setInterval(() => {
          const canvas = canvasRef.current;
          const video = videoRef.current;
          if (canvas && video && video.readyState >= 2) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(video, 0, 0);
              const base64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
              const session = liveSessionRef.current;
              if (session) {
                try {
                  session.sendRealtimeInput({
                    media: { data: base64, mimeType: 'image/jpeg' }
                  });
                } catch {}
              }
            }
          }
        }, 1000);
      }
    }

    // reconnect live
    sessionPromiseRef.current = geminiService.connectLive({
      onopen: () => {
        reconnectAttemptsRef.current = 0;
        setInteractionStatus("active");
        setInteractionError("");
        setIsLoading(false);

        // Ensure audio capture pipeline is running
        ensureAudioCapturePipeline();
      },
      onmessage: onLiveMessage,
      onerror: (e: any) => scheduleReconnect("ws-error", e),
      onclose: (e: any) => scheduleReconnect("ws-close", e),
    });

    liveSessionRef.current = await sessionPromiseRef.current;
  };

  const scheduleReconnect = (why: string, evt?: any) => {
    if (stopRequestedRef.current) return;
    if (reconnectingRef.current) return;

    reconnectingRef.current = true;
    setInteractionStatus("reconnecting");

    const attempt = reconnectAttemptsRef.current + 1;
    reconnectAttemptsRef.current = attempt;

    const base = Math.min(4000, 250 * Math.pow(2, attempt - 1)); // 250, 500, 1000, 2000, 4000
    const jitter = Math.floor(Math.random() * 250);
    const delay = base + jitter;

    const code = evt?.code ? ` code=${evt.code}` : "";
    const reason = evt?.reason ? ` ${evt.reason}` : "";
    setInteractionError(`Live disconnected (${why}${code}${reason}). Reconnecting… (attempt ${attempt})`);

    if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      reconnectingRef.current = false;
      reconnectLiveSession().catch((e) => {
        scheduleReconnect("reconnect-failed", { reason: String(e?.message || e) });
      });
    }, delay);
  };

  const startInteractionMode = async () => {
    if (isInteractionMode) {
      hardStopInteractionMode();
      return;
    }

    stopRequestedRef.current = false;
    reconnectAttemptedRef.current = false;
    reconnectAttemptsRef.current = 0;
    reconnectingRef.current = false;
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    setInteractionError("");
    setInteractionStatus("requesting_permissions");

    let sessionId = activeSessionIdRef.current || activeSessionId;
    if (!sessionId) {
      sessionId = createNewSession();
    }
    activeSessionIdRef.current = sessionId;
    setIsInteractionMode(true);
    setIsLoading(true);

    try {
      let visionStream: MediaStream | null = null;
      try {
        visionStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 5 }
        });
        visionStreamRef.current = visionStream;
      } catch (err) {
        console.warn("Screen share disallowed or cancelled:", err);
        softFailInteractionMode("Screen share permission denied. Please allow screen sharing to use Interaction Mode.");
        return;
      }

      let audioStream: MediaStream;
      try {
        audioStream = await navigator.mediaDevices.getUserMedia({
          audio: true
        });
        streamRef.current = audioStream;
      } catch (err) {
        console.warn("Microphone permission denied:", err);
        softFailInteractionMode("Microphone permission denied. Please allow microphone access to use Interaction Mode.");
        return;
      }

      inputAudioContextRef.current = new (window.AudioContext ||
        (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext ||
        (window as any).webkitAudioContext)({ sampleRate: 24000 });

      setInteractionStatus("connecting");

      sessionPromiseRef.current = geminiService.connectLive({
        onopen: () => {
          setIsLoading(false);
          setInteractionStatus("active");

          // Setup audio capture pipeline
          ensureAudioCapturePipeline();

          // Setup video frame capture (only if not already running)
          if (videoRef.current && visionStream) {
            videoRef.current.srcObject = visionStream;
            videoRef.current.play();

            if (frameIntervalRef.current === null) {
              frameIntervalRef.current = window.setInterval(() => {
                const canvas = canvasRef.current;
                const video = videoRef.current;
                if (canvas && video && video.readyState >= 2) {
                  canvas.width = video.videoWidth;
                  canvas.height = video.videoHeight;
                  const ctx = canvas.getContext('2d');
                  if (ctx) {
                    ctx.drawImage(video, 0, 0);
                    const base64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
                    const session = liveSessionRef.current;
                    if (session) {
                      try {
                        session.sendRealtimeInput({
                          media: { data: base64, mimeType: 'image/jpeg' }
                        });
                      } catch {}
                    }
                  }
                }
              }, 1000);
            }
          }
        },
        onmessage: onLiveMessage,
        onerror: (e: any) => scheduleReconnect("ws-error", e),
        onclose: (e: any) => scheduleReconnect("ws-close", e)
      });

      sessionPromiseRef.current.then(session => {
        liveSessionRef.current = session;
      });
    } catch (err) {
      console.error("Error starting interaction mode:", err);
      softFailInteractionMode(`Failed to start Interaction Mode: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Finalize transcript turn: mark messages as complete, persist to DB, clear refs
  const finalizeTranscriptTurn = async (isTimeout = false) => {
    console.log("💾 [Front] Finalizing Turn. Session:", activeSessionIdRef.current);
    console.log("   > User Buffer:", currentInputTransRef.current);
    console.log("   > Drona Buffer:", currentOutputTransRef.current);
    
    // Clear timeout if it exists
    if (transcriptTimeoutRef.current) {
      window.clearTimeout(transcriptTimeoutRef.current);
      transcriptTimeoutRef.current = null;
    }

    try {
      const currentSessionId = activeSessionIdRef.current;
      
      if (currentSessionId) {
        // --- Persist to DB: Save User Message ---
        if (currentInputTransRef.current && currentInputTransRef.current.trim()) {
          const userMsgId = lastUserMsgIdRef.current || Date.now().toString() + '-int-u';
          console.log("   > Saving User Message to DB...");
          try {
            await dbService.saveMessage({
              id: userMsgId,
              role: Role.USER,
              content: currentInputTransRef.current.trim(),
              timestamp: new Date()
            }, currentSessionId);
            console.log("   ✅ User Message Saved!");
            
            // Ensure the ID is set for state updates
            if (!lastUserMsgIdRef.current) {
              lastUserMsgIdRef.current = userMsgId;
            }
          } catch (e) {
            console.error("   ❌ User Save FAILED:", e);
          }
        } else {
          console.log("   ⚠️ Skipping user message save - no content");
        }

        // --- Persist to DB: Save Drona Message ---
        if (currentOutputTransRef.current && currentOutputTransRef.current.trim()) {
          const dronaMsgId = lastDronaMsgIdRef.current || (Date.now() + 1).toString() + '-int-d';
          console.log("   > Saving Drona Message to DB...");
          try {
            await dbService.saveMessage({
              id: dronaMsgId,
              role: Role.DRONA,
              content: currentOutputTransRef.current.trim(),
              timestamp: new Date()
            }, currentSessionId);
            console.log("   ✅ Drona Message Saved!");
            
            // Ensure the ID is set for state updates
            if (!lastDronaMsgIdRef.current) {
              lastDronaMsgIdRef.current = dronaMsgId;
            }
          } catch (e) {
            console.error("   ❌ Drona Save FAILED:", e);
          }
        } else {
          console.log("   ⚠️ Skipping drona message save - no content");
        }

        // Finalize streaming state: mark messages as complete (remove isStreaming flag)
        setSessions(prev =>
          prev.map(s => {
            if (s.id !== currentSessionId) return s;
            
            let updatedMessages = s.messages.map(m => {
              if (m.id === lastUserMsgIdRef.current || m.id === lastDronaMsgIdRef.current) {
                return { ...m, isStreaming: false };
              }
              return m;
            });

            // Add timeout warning message if needed
            if (isTimeout && (lastUserMsgIdRef.current || lastDronaMsgIdRef.current)) {
              updatedMessages.push({
                id: Date.now().toString() + '-timeout',
                role: Role.DRONA,
                content: '⚠️ Interaction timed out — please retry.',
                timestamp: new Date(),
                isStreaming: false
              });
            }

            return {
              ...s,
              messages: updatedMessages
            };
          })
        );
      }
    } catch (e) {
      console.error('Error finalizing interaction mode messages:', e);
    }

    // Clear streaming state and refs
    setIsInteractionStreaming(false);
    setIsListening(false);
    currentInputTransRef.current = '';
    currentOutputTransRef.current = '';
    lastUserMsgIdRef.current = null;
    lastDronaMsgIdRef.current = null;
    firstTranscriptTimeRef.current = null;
  };

  // Streaming message update: update transcript text in real-time
  const syncInteractionModeTranscription = () => {
    // Track first transcript event for timeout safety
    if (!firstTranscriptTimeRef.current && 
        (currentInputTransRef.current.trim() || currentOutputTransRef.current.trim())) {
      firstTranscriptTimeRef.current = Date.now();
      setIsInteractionStreaming(true);
      console.log("[FRONTEND] 🚀 Starting transcript streaming");
      
      // Set up 12-second timeout safety
      transcriptTimeoutRef.current = window.setTimeout(() => {
        console.warn('Transcript timeout: finalizing turn after 12 seconds');
        finalizeTranscriptTurn(true);
      }, 12000);
    }

    setSessions(prev =>
      prev.map(s => {
        if (s.id !== activeSessionIdRef.current) return s;

        let newMessages = [...s.messages];

        // Streaming user message update - overwrite existing message or create new
        if (currentInputTransRef.current) {
          if (!lastUserMsgIdRef.current) {
            lastUserMsgIdRef.current =
              Date.now().toString() + '-int-u';
            console.log("[FRONTEND] ➕ Creating new user message in UI:", lastUserMsgIdRef.current);
            newMessages.push({
              id: lastUserMsgIdRef.current,
              role: Role.USER,
              content: currentInputTransRef.current,
              timestamp: new Date(),
              isStreaming: true
            });
          } else {
            console.log("[FRONTEND] 🔄 Updating existing user message:", lastUserMsgIdRef.current);
            newMessages = newMessages.map(m =>
              m.id === lastUserMsgIdRef.current
                ? { ...m, content: currentInputTransRef.current, isStreaming: true }
                : m
            );
          }
        }

        // Streaming drona message update - overwrite existing message or create new
        if (currentOutputTransRef.current) {
          if (!lastDronaMsgIdRef.current) {
            lastDronaMsgIdRef.current =
              Date.now().toString() + '-int-d';
            console.log("[FRONTEND] ➕ Creating new drona message in UI:", lastDronaMsgIdRef.current);
            newMessages.push({
              id: lastDronaMsgIdRef.current,
              role: Role.DRONA,
              content: currentOutputTransRef.current,
              timestamp: new Date(),
              isStreaming: true
            });
          } else {
            console.log("[FRONTEND] 🔄 Updating existing drona message:", lastDronaMsgIdRef.current);
            newMessages = newMessages.map(m =>
              m.id === lastDronaMsgIdRef.current
                ? { ...m, content: currentOutputTransRef.current, isStreaming: true }
                : m
            );
          }
        }

        const firstMsg =
          newMessages.find(m => m.role === Role.USER)?.content || s.title;
        const title =
          firstMsg.slice(0, 30) +
          (firstMsg.length > 30 ? '...' : '');

        // Persist title update to DB once we have real user text
        if (user && s.title === 'New Session' && title !== 'New Session') {
          const pid = s.project_id ?? activeProjectId ?? null;
          dbService.saveSession(
            {
              id: s.id,
              title,
              createdAt: s.createdAt,
              messages: [],
              project_id: pid
            } as any,
            user.id,
            pid
          );
        }

        return { ...s, messages: newMessages, title };
      })
    );
  };

  const hardStopInteractionMode = async () => {
    stopRequestedRef.current = true;
    setInteractionStatus("idle");
    setIsInteractionMode(false);
    setIsSpeaking(false);
    setIsListening(false);
    setIsLoading(false);
    stopAllAudio();

    // Finalize any pending transcripts before stopping
    if (isInteractionStreaming) {
      await finalizeTranscriptTurn(false);
    }

    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    
    // Clear transcript timeout if it exists
    if (transcriptTimeoutRef.current) {
      window.clearTimeout(transcriptTimeoutRef.current);
      transcriptTimeoutRef.current = null;
    }
    
    reconnectingRef.current = false;
    reconnectAttemptsRef.current = 0;

    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }

    // Disconnect audio nodes cleanly
    try { scriptProcessorRef.current?.disconnect(); } catch {}
    try { mediaSourceRef.current?.disconnect(); } catch {}
    scriptProcessorRef.current = null;
    mediaSourceRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (visionStreamRef.current) {
      visionStreamRef.current.getTracks().forEach(t => t.stop());
      visionStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (liveSessionRef.current) {
      try {
        liveSessionRef.current.close();
      } catch (e) {}
      liveSessionRef.current = null;
    }
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close();
      outputAudioContextRef.current = null;
    }

    // Refresh UI from DB to show latest transcripts
    await refreshSessions();
  };

  const handleSend = async (text: string, attachments?: any[]) => {
    let currentId = activeSessionId;
    let userMsg: Message;
    
    // Extract attachment metadata
    const selectedAttachments = attachments?.map((att, index) => ({
      id: `${Date.now()}-${index}`,
      name: att.file.name,
      mimeType: att.file.type || 'application/octet-stream',
      size: att.file.size,
      previewUrl: att.previewUrl
    })) || [];
    
    // Upload files first if attachments exist
    let attachmentIds: string[] = [];
    if (attachments && attachments.length > 0) {
      setIsLoading(true);
      try {
        const files = attachments.map((a: any) => a.file);
        attachmentIds = await geminiService.uploadFiles(files);
      } catch (error) {
        console.error('File upload failed:', error);
        // Continue without attachments if upload fails
      }
    }
    
    // Build message content with attachment info
    let messageContent = text;
    if (attachments && attachments.length > 0) {
      const fileNames = attachments.map((a: any) => a.file.name).join(', ');
      messageContent = `${text}\n\n[Attached: ${fileNames}]`;
    }
    
    if (!currentId) {
      const newId = Date.now().toString();
      currentId = newId;
      const newSession: ChatSession = {
        id: newId,
        title: text.slice(0, 30) + (text.length > 30 ? '...' : ''),
        messages: [],
        createdAt: new Date(),
        project_id: activeProjectId ?? null,
      };
      setSessions(prev => [newSession, ...prev]);

      // Generate userMsg here to save to DB below
      userMsg = {
        id: Date.now().toString(),
        role: Role.USER,
        content: messageContent,
        timestamp: new Date(),
        attachments: selectedAttachments.length > 0 ? selectedAttachments : undefined
      };
      dbService.saveMessage(userMsg, currentId);

      // Save the new session to the database
      dbService.saveSession(newSession, user!.id, activeProjectId ?? null);

      setActiveSessionId(newId);
    } else {
      userMsg = {
        id: Date.now().toString(),
        role: Role.USER,
        content: messageContent,
        timestamp: new Date(),
        attachments: selectedAttachments.length > 0 ? selectedAttachments : undefined
      };
      // Save user message to database for existing sessions
      dbService.saveMessage(userMsg, currentId);
    }

    const dronaId = (Date.now() + 1).toString();
    const dronaMsg: Message = {
      id: dronaId,
      role: Role.DRONA,
      content: '',
      timestamp: new Date(),
      isStreaming: true
    };

    setSessions(prev =>
      prev.map(s => {
        if (s.id === currentId) {
          const title =
            s.messages.length === 0
              ? text.slice(0, 30) +
                (text.length > 30 ? '...' : '')
              : s.title;
          return {
            ...s,
            messages: [...s.messages, userMsg, dronaMsg],
            title
          };
        }
        return s;
      })
    );

    // Persist session title update (only when first message sets title)
    if (user) {
      const newTitle = text.slice(0, 30) + (text.length > 30 ? '...' : '');
      const session = sessionsRef.current.find(s => s.id === currentId);

      // Only update DB if title is still default / empty
      if (!session || session.title === 'New Session') {
        const pid =
          (sessionsRef.current.find(s => s.id === currentId)?.project_id ?? activeProjectId ?? null);
        dbService.saveSession(
          {
            id: currentId,
            title: newTitle,
            createdAt: session?.createdAt ?? new Date(),
            messages: [], // ok if dbService ignores this field
            project_id: pid
          } as any,
          user.id,
          pid
        );
      }
    }

    setIsLoading(true);
    try {
      const history =
        (sessionsRef.current.find(s => s.id === currentId)?.messages || []).map(m => ({
          role: m.role === Role.USER ? 'user' : 'model',
          parts: [{ text: m.content }]
        }));

      const stream = geminiService.streamChat(history, text, attachmentIds);
      let accumulated = '';
      for await (const chunk of stream) {
        accumulated += chunk;
        setSessions(prev =>
          prev.map(s => {
            if (s.id === currentId) {
              return {
                ...s,
                messages: s.messages.map(m =>
                  m.id === dronaId
                    ? { ...m, content: accumulated }
                    : m
                )
              };
            }
            return s;
          })
        );
      }
      setSessions(prev =>
        prev.map(s => {
          if (s.id === currentId) {
            return {
              ...s,
              messages: s.messages.map(m =>
                m.id === dronaId
                  ? { ...m, isStreaming: false }
                  : m
              )
            };
          }
          return s;
        })
      );
      
      // Save the complete AI response message to database
      const finalDronaMsg: Message = {
        id: dronaId,
        role: Role.DRONA,
        content: accumulated,
        timestamp: new Date()
      };
      dbService.saveMessage(finalDronaMsg, currentId);

      if (!activeProjectId) return;
      if (lastPlanCaptureMsgIdRef.current === dronaId) return;
      lastPlanCaptureMsgIdRef.current = dronaId;

      try {
        const baseContext = projectContext ?? createEmptyPlanContext();
        console.groupCollapsed('[PlanWriter][UI] after assistant message finalized');
        console.log({
          activeProjectId,
          baseVersion: baseContext.version,
          rootCount: baseContext.root_step_ids.length
        });
        console.groupEnd();

        await applyFromExchange({
          projectId: activeProjectId,
          userText: text,
          assistantText: accumulated,
          baseContext,
          getToken,
          onNewContext: (ctx) => setProjectContext(ctx)
        });
      } catch (e) {
        console.error('[PlanWriter] failed to apply from exchange', e);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // 5. Main Render Return
  return (
    <div className="flex h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-200 overflow-hidden transition-colors duration-300">
      {/* 1. STATE: User is Signed OUT */}
      <SignedOut>
        <LandingPage />
      </SignedOut>

      {/* 2. STATE: User is Signed IN */}
      <SignedIn>
        <video ref={videoRef} className="hidden" aria-hidden="true" />
        <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

        <VoiceOverlay
          isActive={isInteractionMode}
          isSpeaking={isSpeaking}
          isListening={isListening}
          onClose={hardStopInteractionMode}
          status={interactionStatus}
          error={interactionError}
          onRetry={() => {
            reconnectAttemptsRef.current = 0;
            reconnectingRef.current = false;
            if (reconnectTimerRef.current) {
              window.clearTimeout(reconnectTimerRef.current);
              reconnectTimerRef.current = null;
            }
            reconnectLiveSession().catch((e) => {
              scheduleReconnect("manual-retry-failed", { reason: String(e?.message || e) });
            });
          }}
        />

        <Sidebar
          userId={user?.id}
          projects={projects}
          onCreateProject={createProject}
          sessions={filteredSessions}
          activeSessionId={activeSessionId}
          activeProjectId={activeProjectId}
          onSelectProject={handleSelectProject}
          onSelectSession={handleSelectSession}
          onNewChat={createNewSession}
          onDeleteProject={handleDeleteProject}
          onRequestDeleteSession={handleDeleteSessionConfirmed}
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
          onOpenPricing={() => setIsPricingOpen(true)}
          onOpenSearch={() => setIsSearchOpen(true)}
        />

        <div className="flex-1 flex flex-col relative min-w-0">
          <header className="flex items-center justify-between px-6 py-4 bg-slate-100 dark:bg-slate-900/50 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 z-10">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="md:hidden text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="3" y1="12" x2="21" y2="12"></line>
                  <line x1="3" y1="6" x2="21" y2="6"></line>
                  <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
              </button>
              <div className="hidden sm:flex items-center gap-3">
                <div className="p-2 bg-indigo-600 rounded-lg shadow-lg">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
                  </svg>
                </div>
                <div className="leading-tight">
                  <h1 className="text-lg font-bold text-slate-900 dark:text-white serif italic">
                    Drona
                  </h1>
                  <p className="text-[9px] text-slate-500 dark:text-slate-500 font-bold uppercase tracking-widest">
                    Master Mentor
                  </p>
                </div>
              </div>
            </div>

            {/* Centered Expand/Collapse All Toggle */}
            {activeTab === 'chat' && (
              <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 hidden md:block z-20">
                <button
                  onClick={() => setAreAllExpanded(!areAllExpanded)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 transition-colors border border-slate-200 dark:border-slate-700 shadow-sm"
                >
                  {areAllExpanded ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
                      <span>Collapse All</span>
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                      <span>Expand All</span>
                    </>
                  )}
                </button>
              </div>
            )}

            <div className="flex items-center gap-4">
              <div className="flex items-center rounded-full bg-slate-200 dark:bg-slate-800 p-1">
                <button
                  onClick={() => setActiveTab('chat')}
                  className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
                    activeTab === 'chat'
                      ? 'bg-white text-slate-900 dark:bg-slate-700 dark:text-white'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Chat
                </button>
                <button
                  onClick={() => setActiveTab('plan')}
                  className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
                    activeTab === 'plan'
                      ? 'bg-white text-slate-900 dark:bg-slate-700 dark:text-white'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Plan
                </button>
              </div>
              {activeProjectId && (
                <button
                  onClick={handleApplyTestStep}
                  disabled={isApplyingPatch}
                  className="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Add test step"
                >
                  {isApplyingPatch ? "Working..." : "➕ Test Step"}
                </button>
              )}
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-700 transition-all"
                title={
                  isDarkMode
                    ? "Switch to Daylight Mode"
                    : "Switch to Dark Mode"
                }
              >
                {isDarkMode ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="5"></circle>
                    <line x1="12" y1="1" x2="12" y2="3"></line>
                    <line x1="12" y1="21" x2="12" y2="23"></line>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                    <line x1="1" y1="12" x2="3" y2="12"></line>
                    <line x1="21" y1="12" x2="23" y2="12"></line>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                  </svg>
                )}
              </button>

              <UserButton
                appearance={{
                  elements: {
                    avatarBox:
                      "w-10 h-10 border-2 border-indigo-500 rounded-full"
                  }
                }}
              />
            </div>
          </header>

          <main
            className="flex-1 min-h-0 overflow-y-auto px-4 py-8 relative"
            ref={scrollRef}
          >
            <div
              className={
                activeTab === 'plan'
                  ? 'w-full h-full min-h-0 flex flex-col'
                  : 'max-w-4xl mx-auto min-h-full flex flex-col'
              }
            >
              {activeTab === 'plan' ? (
                <div className="flex-1 min-h-0">
                  <PlanPanel projectId={activeProjectId} />
                </div>
              ) : (
                <>
                  {!activeProjectId ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 animate-in fade-in zoom-in duration-700">
                      <div className="max-w-md px-6">
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white serif mb-2 italic">
                          Create or select a project
                        </h2>
                        <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
                          Projects are the top-level workspace. Create a project to start chatting.
                        </p>
                      </div>
                    </div>
                  ) : (!activeSessionId || !activeSession) ? (
                    <div className="w-full pt-6">
                      <button
                        onClick={handleCreateChatInProject}
                        className="w-full flex items-center gap-4 px-6 py-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all"
                      >
                        <div className="text-2xl leading-none">+</div>
                        <div className="flex-1 text-left">
                          <div className="text-slate-500 dark:text-slate-400 text-sm">
                            New chat in {activeProject?.name ?? "Project"}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 opacity-80"></div>
                      </button>

                      <div className="mt-8">
                        <div className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
                          Old chats
                        </div>

                        <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                          {filteredSessions.length === 0 ? (
                            <div className="p-6 text-slate-500 dark:text-slate-400 text-sm">
                              No chats yet in this project.
                            </div>
                          ) : (
                            filteredSessions.map((s) => (
                              <button
                                key={s.id}
                                onClick={() => handleSelectSession(s.id)}
                                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                              >
                                <div className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                                  {s.title || "Untitled Session"}
                                </div>
                                <div className="text-xs text-slate-400 dark:text-slate-500">
                                  {formatShortDate(s.createdAt)}
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {!activeSession ||
                      activeSession.messages.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-8 animate-in fade-in zoom-in duration-700">
                          <div className="relative">
                            <div className="absolute inset-0 bg-indigo-500 blur-3xl opacity-10 rounded-full animate-pulse"></div>
                            <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-emerald-500 rounded-2xl flex items-center justify-center shadow-2xl transform rotate-12">
                              <span className="text-3xl font-bold text-white serif italic">
                                D
                              </span>
                            </div>
                          </div>
                          <div className="max-w-md px-6">
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white serif mb-3 italic">
                              Welcome to the Arena of Wisdom
                            </h2>
                            <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
                              I am Drona, your master AI mentor. Start a conversation or hit the icon to begin your real-time <b>Interaction Mode</b> session.
                            </p>
                          </div>
                        </div>
                      ) : (
                        activeSession.messages.map(msg => (
                          <MessageBubble
                            key={msg.id}
                            message={msg}
                            highlighted={highlightedMessageId === msg.id}
                            shouldExpand={areAllExpanded}
                          />
                        ))
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </main>

          {activeTab === 'chat' && activeProjectId && activeSessionId && activeSession && (
            <InputBar
              onSend={handleSend}
              onVoiceClick={startInteractionMode}
              isVoiceActive={isInteractionMode}
              disabled={isLoading || isInteractionStreaming}
            />
          )}
        </div>

        <PricingModal
          isOpen={isPricingOpen}
          onClose={() => setIsPricingOpen(false)}
          userId={user?.id || ''}
        />

        <SearchModal
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          onSelectHit={handleNavigateToMessage}
          getToken={getToken}
        />
      </SignedIn>
    </div>
  );
};

export default App;