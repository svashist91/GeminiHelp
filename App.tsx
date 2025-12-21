
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Message, Role, ChatSession } from './types';
import { geminiService } from './services/geminiService';
import MessageBubble from './components/MessageBubble';
import InputBar from './components/InputBar';
import VoiceOverlay from './components/VoiceOverlay';
import { decode, decodeAudioData, createBlob } from './utils/audioUtils';
import { LiveServerMessage } from '@google/genai';

const App: React.FC = () => {
  const [session, setSession] = useState<ChatSession>({
    id: 'default',
    title: 'New Session',
    messages: [],
    createdAt: new Date(),
  });
  
  // Voice State
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Audio Context References
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const liveSessionRef = useRef<any>(null);
  
  // Transcription References
  const currentInputTransRef = useRef('');
  const currentOutputTransRef = useRef('');
  const lastUserMsgIdRef = useRef<string | null>(null);
  const lastDronaMsgIdRef = useRef<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [session.messages, scrollToBottom]);

  const stopAllAudio = () => {
    sourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  };

  const startVoiceMode = async () => {
    setIsVoiceActive(true);
    setIsLoading(true);

    try {
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      sessionPromiseRef.current = geminiService.connectLive({
        onopen: () => {
          console.log('Live session opened');
          setIsLoading(false);
          
          const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
          const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
          
          scriptProcessor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const pcmBlob = createBlob(inputData);
            sessionPromiseRef.current?.then((session) => {
              session.sendRealtimeInput({ media: pcmBlob });
            });
          };

          source.connect(scriptProcessor);
          scriptProcessor.connect(inputAudioContextRef.current!.destination);
        },
        onmessage: async (message: LiveServerMessage) => {
          // Handle Audio
          const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
          if (base64Audio && outputAudioContextRef.current) {
            setIsSpeaking(true);
            const ctx = outputAudioContextRef.current;
            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
            
            const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(ctx.destination);
            
            source.addEventListener('ended', () => {
              sourcesRef.current.delete(source);
              if (sourcesRef.current.size === 0) setIsSpeaking(false);
            });

            source.start(nextStartTimeRef.current);
            nextStartTimeRef.current += audioBuffer.duration;
            sourcesRef.current.add(source);
          }

          // Handle Interruptions
          if (message.serverContent?.interrupted) {
            stopAllAudio();
            setIsSpeaking(false);
          }

          // Handle Transcriptions
          if (message.serverContent?.inputTranscription) {
            setIsListening(true);
            const text = message.serverContent.inputTranscription.text;
            currentInputTransRef.current += text;
            updateTranscriptions();
          }

          if (message.serverContent?.outputTranscription) {
            const text = message.serverContent.outputTranscription.text;
            currentOutputTransRef.current += text;
            updateTranscriptions();
          }

          if (message.serverContent?.turnComplete) {
            setIsListening(false);
            currentInputTransRef.current = '';
            currentOutputTransRef.current = '';
            lastUserMsgIdRef.current = null;
            lastDronaMsgIdRef.current = null;
          }
        },
        onerror: (e) => {
          console.error('Live Error:', e);
          stopVoiceMode();
        },
        onclose: () => {
          console.log('Live connection closed');
          stopVoiceMode();
        }
      });

      sessionPromiseRef.current.then(session => {
        liveSessionRef.current = session;
      });

    } catch (err) {
      console.error('Failed to start voice mode:', err);
      setIsVoiceActive(false);
      setIsLoading(false);
    }
  };

  const updateTranscriptions = () => {
    setSession(prev => {
      let newMessages = [...prev.messages];

      // Update User Transcription
      if (currentInputTransRef.current) {
        if (!lastUserMsgIdRef.current) {
          lastUserMsgIdRef.current = Date.now().toString() + '-user';
          newMessages.push({
            id: lastUserMsgIdRef.current,
            role: Role.USER,
            content: currentInputTransRef.current,
            timestamp: new Date()
          });
        } else {
          newMessages = newMessages.map(m => 
            m.id === lastUserMsgIdRef.current ? { ...m, content: currentInputTransRef.current } : m
          );
        }
      }

      // Update Drona Transcription
      if (currentOutputTransRef.current) {
        if (!lastDronaMsgIdRef.current) {
          lastDronaMsgIdRef.current = Date.now().toString() + '-drona';
          newMessages.push({
            id: lastDronaMsgIdRef.current,
            role: Role.DRONA,
            content: currentOutputTransRef.current,
            timestamp: new Date(),
            isStreaming: true
          });
        } else {
          newMessages = newMessages.map(m => 
            m.id === lastDronaMsgIdRef.current ? { ...m, content: currentOutputTransRef.current } : m
          );
        }
      }

      return { ...prev, messages: newMessages };
    });
  };

  const stopVoiceMode = () => {
    setIsVoiceActive(false);
    setIsSpeaking(false);
    setIsListening(false);
    stopAllAudio();
    if (liveSessionRef.current) {
      try { liveSessionRef.current.close(); } catch (e) {}
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
  };

  const handleSend = async (text: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: Role.USER,
      content: text,
      timestamp: new Date(),
    };

    const dronaMessageId = (Date.now() + 1).toString();
    const initialDronaMessage: Message = {
      id: dronaMessageId,
      role: Role.DRONA,
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };

    setSession(prev => ({
      ...prev,
      messages: [...prev.messages, userMessage, initialDronaMessage]
    }));

    setIsLoading(true);

    try {
      const history = session.messages.map(m => ({
        role: m.role === Role.USER ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));

      const stream = geminiService.streamChat(history, text);
      let accumulatedText = '';

      for await (const chunk of stream) {
        accumulatedText += chunk;
        setSession(prev => ({
          ...prev,
          messages: prev.messages.map(m => 
            m.id === dronaMessageId 
              ? { ...m, content: accumulatedText } 
              : m
          )
        }));
      }

      setSession(prev => ({
        ...prev,
        messages: prev.messages.map(m => 
          m.id === dronaMessageId ? { ...m, isStreaming: false } : m
        )
      }));
    } catch (error) {
      console.error('Error in chat:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 overflow-hidden">
      <VoiceOverlay 
        isActive={isVoiceActive} 
        isSpeaking={isSpeaking} 
        isListening={isListening}
        onClose={stopVoiceMode}
      />

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-slate-900/50 backdrop-blur-xl border-b border-slate-800 z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-500/20">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white serif italic">Drona</h1>
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">Master AI Mentor</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={startVoiceMode}
            className={`p-2.5 rounded-full transition-all ${isVoiceActive ? 'bg-indigo-600 text-white animate-pulse' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
            title="Start Voice Session"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
          </button>
          
          <button 
            onClick={() => setSession({ id: Date.now().toString(), title: 'New Session', messages: [], createdAt: new Date() })}
            className="text-slate-400 hover:text-white transition-colors p-2.5 rounded-full hover:bg-slate-800"
            title="New Chat"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
        </div>
      </header>

      {/* Main Chat Area */}
      <main className="flex-1 overflow-y-auto px-4 py-8 relative" ref={scrollRef}>
        <div className="max-w-4xl mx-auto min-h-full flex flex-col">
          {session.messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-8 animate-in fade-in zoom-in duration-700">
              <div className="relative">
                <div className="absolute inset-0 bg-indigo-500 blur-3xl opacity-10 rounded-full animate-pulse"></div>
                <div className="w-24 h-24 bg-gradient-to-br from-indigo-500 to-emerald-500 rounded-3xl flex items-center justify-center shadow-2xl transform rotate-12 transition-transform hover:rotate-0 cursor-pointer">
                  <span className="text-4xl font-bold text-white serif italic">D</span>
                </div>
              </div>
              <div className="max-w-md">
                <h2 className="text-3xl font-bold text-white serif mb-3 italic">Welcome, Seeker.</h2>
                <p className="text-slate-400 leading-relaxed">
                  I am Drona, your intelligent mentor. Ask me via text or click the microphone to speak with me directly.
                </p>
              </div>
            </div>
          ) : (
            session.messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))
          )}
        </div>
      </main>

      {/* Input Bar */}
      <InputBar onSend={handleSend} disabled={isLoading} />
    </div>
  );
};

export default App;
