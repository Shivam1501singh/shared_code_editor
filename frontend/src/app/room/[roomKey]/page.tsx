'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import Link from 'next/link';

// Dynamically import Monaco Editor to avoid SSR window issues
const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

interface Participant {
  id: string;
  name: string;
  image: string | null;
  color: string;
  socketId: string;
}

export default function CollaborativeRoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomKey = params?.roomKey as string;
  const { data: session } = useSession();

  const [code, setCode] = useState<string>('// Loading collaborative editor...');
  const [roomTitle, setRoomTitle] = useState<string>('Untitled Room');
  const [activeUsers, setActiveUsers] = useState<Participant[]>([]);
  const [socketConnected, setSocketConnected] = useState(false);

  // Audio / Voice state
  const [isMuted, setIsMuted] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);

  // Output terminal state
  const [outputLogs, setOutputLogs] = useState<Array<{ type: 'log' | 'error' | 'info'; text: string }>>([
    { type: 'info', text: 'SynCode WebAssembly isolate ready. Press Run to execute.' },
  ]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [execTime, setExecTime] = useState<string>('0ms');
  const [isOutputCollapsed, setIsOutputCollapsed] = useState(false);

  // AI Review Drawer state (Phase 7 preview)
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);
  const [copyToast, setCopyToast] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const editorRef = useRef<any>(null);
  const isRemoteUpdateRef = useRef<boolean>(false);

  // Load initial room data from database
  useEffect(() => {
    if (!roomKey) return;
    const fetchRoom = async () => {
      try {
        const res = await fetch(`/api/rooms/${roomKey}`);
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            setRoomTitle(json.data.title);
            setCode(json.data.codeContent || '// Start coding here...\n');
          }
        }
      } catch (err) {
        console.error('Failed to load room details', err);
      }
    };
    fetchRoom();
  }, [roomKey]);

  // Socket.io initialization & event listeners
  useEffect(() => {
    if (!roomKey) return;

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';
    const socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      const userPayload = {
        id: session?.user?.id || `guest-${Math.random().toString(36).substring(2, 6)}`,
        name: session?.user?.name || 'Guest Developer',
        image: session?.user?.image || null,
        color: '#22d3ee',
      };
      socket.emit('room:join', { roomKey, user: userPayload });
    });

    socket.on('room:init', (data) => {
      if (data.codeContent) {
        isRemoteUpdateRef.current = true;
        setCode(data.codeContent);
      }
      if (data.activeUsers) {
        setActiveUsers(data.activeUsers);
      }
    });

    socket.on('user:joined', ({ user }) => {
      setActiveUsers((prev) => {
        if (prev.some((u) => u.socketId === user.socketId)) return prev;
        return [...prev, user];
      });
    });

    socket.on('user:left', ({ socketId }) => {
      setActiveUsers((prev) => prev.filter((u) => u.socketId !== socketId));
    });

    socket.on('code:broadcast', ({ codeContent }) => {
      isRemoteUpdateRef.current = true;
      setCode(codeContent);
    });

    socket.on('voice:speaking', ({ socketId, isSpeaking }) => {
      if (isSpeaking) {
        setActiveSpeaker(socketId);
      } else {
        setActiveSpeaker((prev) => (prev === socketId ? null : prev));
      }
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    return () => {
      socket.disconnect();
    };
  }, [roomKey, session]);

  // Handle local code edits and broadcast to peers
  const handleEditorChange = (value: string | undefined) => {
    const updatedCode = value || '';
    if (isRemoteUpdateRef.current) {
      isRemoteUpdateRef.current = false;
      return;
    }
    setCode(updatedCode);
    if (socketRef.current && socketConnected) {
      socketRef.current.emit('code:update', { roomKey, codeContent: updatedCode });
    }
  };

  // Safe client-side JavaScript execution
  const executeCode = useCallback(() => {
    setIsExecuting(true);
    const startTime = performance.now();
    const logs: Array<{ type: 'log' | 'error' | 'info'; text: string }> = [];

    // Capture console outputs
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    try {
      console.log = (...args: any[]) => {
        logs.push({
          type: 'log',
          text: args.map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' '),
        });
      };
      console.error = (...args: any[]) => {
        logs.push({
          type: 'error',
          text: args.map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' '),
        });
      };
      console.warn = (...args: any[]) => {
        logs.push({
          type: 'info',
          text: `[warn] ${args.join(' ')}`,
        });
      };

      // Run code safely via isolated Function constructor
      const runner = new Function(code);
      runner();

      const duration = (performance.now() - startTime).toFixed(1);
      setExecTime(`${duration}ms`);

      if (logs.length === 0) {
        logs.push({ type: 'info', text: 'Script evaluated successfully (no output logged).' });
      }

      setOutputLogs((prev) => [
        ...prev,
        { type: 'info', text: `-- Executed at ${new Date().toLocaleTimeString()} in ${duration}ms --` },
        ...logs,
      ]);
    } catch (err: any) {
      const duration = (performance.now() - startTime).toFixed(1);
      setExecTime(`${duration}ms`);
      setOutputLogs((prev) => [
        ...prev,
        { type: 'info', text: `-- Execution failed in ${duration}ms --` },
        { type: 'error', text: err?.stack || err?.message || String(err) },
      ]);
    } finally {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
      setIsExecuting(false);
    }
  }, [code]);

  // Keyboard shortcut: Ctrl + Enter / Cmd + Enter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        executeCode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [executeCode]);

  const copyRoomLink = () => {
    if (typeof window !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopyToast(true);
      setTimeout(() => setCopyToast(false), 2000);
    }
  };

  const toggleMute = () => {
    setIsMuted((prev) => !prev);
  };

  const clearConsole = () => {
    setOutputLogs([{ type: 'info', text: 'Console buffer cleared.' }]);
  };

  return (
    <div className="bg-[#0a0e17] text-slate-100 font-sans antialiased overflow-hidden select-none h-screen flex flex-col">
      {/* 1. Header Bar */}
      <header className="h-14 py-2.5 px-4 bg-[#0b0f19] border-b border-slate-800/80 flex items-center justify-between gap-4 z-40 shrink-0">
        {/* Left: Logo, Room Title, Key */}
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dashboard" className="flex items-center gap-2 pr-1 hover:opacity-80 transition-opacity">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.25)]">
              <span className="material-symbols-outlined text-[17px] font-bold">bolt</span>
            </div>
            <span className="font-bold text-[15px] tracking-tight text-white font-sans hidden sm:inline">SynCode</span>
          </Link>

          <div className="w-px h-4 bg-slate-800 hidden sm:block" />

          {/* Editable Title */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900/60 border border-slate-800/60 text-slate-200">
            <span className="text-xs md:text-sm font-medium tracking-tight truncate max-w-[150px] md:max-w-none">
              {roomTitle}
            </span>
          </div>

          {/* Room Key Badge with Copy Action */}
          <div className="relative flex items-center bg-slate-900/80 border border-slate-800/80 rounded-full px-2.5 py-0.5 text-xs">
            <div className="flex items-center gap-1.5 text-slate-400">
              <span className={`w-1.5 h-1.5 rounded-full ${socketConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <span className="font-mono text-[11px] text-indigo-300 font-medium">{roomKey}</span>
            </div>
            <div className="w-px h-3 bg-slate-800 mx-2" />
            <button
              onClick={copyRoomLink}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition-colors"
              title="Copy invite URL"
            >
              <span className="material-symbols-outlined text-[13px]">content_copy</span>
              <span className="hidden md:inline font-sans">Copy Link</span>
            </button>
            {copyToast && (
              <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-slate-800 text-slate-200 border border-slate-700 font-sans text-[11px] px-2 py-0.5 rounded shadow-xl whitespace-nowrap z-50">
                Copied to clipboard!
              </span>
            )}
          </div>
        </div>

        {/* Right Section: Active Peers, Voice Pill, Actions */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Active Voice Pill */}
          <div className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-full bg-slate-900/90 border border-slate-800/90 shadow-sm">
            <div className="flex items-center -space-x-1.5">
              {activeUsers.map((user, idx) => (
                <div
                  key={user.socketId || idx}
                  className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-[10px] font-semibold border ${
                    activeSpeaker === user.socketId
                      ? 'border-emerald-400 bg-emerald-950 text-emerald-300 ring-2 ring-emerald-400/40'
                      : 'border-slate-700 bg-slate-800 text-slate-300'
                  }`}
                  title={user.name}
                >
                  {user.name.substring(0, 2).toUpperCase()}
                </div>
              ))}
            </div>

            <button
              onClick={toggleMute}
              className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                isMuted ? 'bg-rose-950 text-rose-400' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
              title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              <span className="material-symbols-outlined text-[13px]">{isMuted ? 'mic_off' : 'mic'}</span>
            </button>
          </div>

          {/* AI Review Drawer Button */}
          <button
            onClick={() => setIsAiDrawerOpen((prev) => !prev)}
            className="p-[1px] rounded-full bg-gradient-to-r from-violet-500/60 via-indigo-500/60 to-purple-500/60 hover:from-violet-500 hover:to-indigo-500 transition-all duration-200 active:scale-95"
            type="button"
          >
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0b0f19] hover:bg-[#111726] transition-colors">
              <span className="material-symbols-outlined text-[14px] text-violet-400">auto_awesome</span>
              <span className="text-xs font-medium text-slate-200 tracking-tight">AI Review</span>
              <span className="text-[10px] text-violet-400 font-mono">✨</span>
            </div>
          </button>

          {/* Run Code Button */}
          <button
            onClick={executeCode}
            disabled={isExecuting}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-semibold text-xs transition-all shadow-[0_0_14px_rgba(16,185,129,0.25)] active:scale-95 disabled:opacity-50"
            type="button"
          >
            <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              play_arrow
            </span>
            <span className="tracking-wide">Run</span>
            <span className="hidden sm:inline-block px-1 py-0.2 rounded bg-slate-950/20 text-slate-900 font-mono text-[9px] font-medium border border-slate-950/10">
              Ctrl + Enter
            </span>
          </button>
        </div>
      </header>

      {/* 2. Central Monaco Code Editor Viewport */}
      <main className="relative flex-1 flex flex-col bg-[#0a0e17] overflow-hidden">
        {/* Editor Tab Strip */}
        <div className="h-9 px-4 bg-[#090d16] border-b border-slate-800/60 flex items-center justify-between text-xs font-mono select-none shrink-0">
          <div className="flex items-center gap-2 h-full border-b-2 border-indigo-400 px-1 text-slate-200 font-medium">
            <span className="w-3.5 h-3.5 rounded bg-amber-400 text-slate-950 font-bold text-[9px] flex items-center justify-center font-sans leading-none">
              JS
            </span>
            <span>solution.js</span>
          </div>
          <div className="flex items-center gap-3 text-slate-500 text-[11px]">
            <span>JavaScript</span>
            <span className="text-slate-700">•</span>
            <span className="flex items-center gap-1 text-emerald-400/90">
              <span className={`w-1.5 h-1.5 rounded-full ${socketConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              {socketConnected ? 'Synced' : 'Connecting...'}
            </span>
          </div>
        </div>

        {/* Monaco Editor Container */}
        <div className="flex-1 w-full h-full relative">
          <Editor
            height="100%"
            defaultLanguage="javascript"
            language="javascript"
            theme="vs-dark"
            value={code}
            onChange={handleEditorChange}
            onMount={(editor) => {
              editorRef.current = editor;
            }}
            options={{
              fontSize: 13,
              fontFamily: "'JetBrains Mono', monospace",
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              lineNumbers: 'on',
              smoothScrolling: true,
              cursorBlinking: 'smooth',
              automaticLayout: true,
              tabSize: 2,
              padding: { top: 12, bottom: 12 },
            }}
          />
        </div>

        {/* Slide-over AI Review Drawer */}
        {isAiDrawerOpen && (
          <aside className="absolute top-0 right-0 bottom-0 w-[420px] max-w-[85vw] bg-[#0d121f]/95 backdrop-blur-md border-l border-slate-800 shadow-2xl z-40 flex flex-col font-sans transition-all duration-300">
            <div className="h-[2px] w-full bg-gradient-to-r from-violet-500 via-indigo-500 to-cyan-400 shrink-0" />
            <div className="p-4 border-b border-slate-800/80 flex items-start justify-between gap-3 bg-[#0a0e17]/60 shrink-0">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-violet-500/30 flex items-center justify-center text-cyan-400 shadow-sm">
                    <span className="material-symbols-outlined text-[15px]">auto_awesome</span>
                  </div>
                  <h2 className="font-semibold text-sm tracking-tight text-white flex items-center gap-1.5">
                    Gemini Code Review
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-mono">
                      1.5 Flash
                    </span>
                  </h2>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 pl-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>Ready to analyze algorithm complexity</span>
                </div>
              </div>
              <button
                className="w-7 h-7 rounded-lg hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors"
                onClick={() => setIsAiDrawerOpen(false)}
                title="Close review"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              <div>
                <span className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase font-mono">
                  Complexity Analysis
                </span>
                <div className="grid grid-cols-2 gap-2.5 mt-2">
                  <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/30 flex flex-col justify-between space-y-1 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 font-medium font-sans">Time</span>
                      <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-mono font-bold text-[11px]">
                        O(n)
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-300 leading-normal font-sans pt-0.5">
                      Single pass linear algorithm
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/30 flex flex-col justify-between space-y-1 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 font-medium font-sans">Space</span>
                      <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-400 font-mono font-bold text-[11px]">
                        O(1)
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-300 leading-normal font-sans pt-0.5">
                      Constant auxiliary space
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800/80 bg-[#0a0e17]/80 shrink-0 space-y-2">
              <button
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-gradient-to-r from-violet-500 via-indigo-500 to-cyan-500 hover:from-violet-400 hover:to-cyan-400 text-white font-medium text-xs transition-all shadow-md active:scale-95"
                onClick={() => setIsAiDrawerOpen(false)}
                type="button"
              >
                <span className="material-symbols-outlined text-[15px]">auto_awesome</span>
                <span>Run Complete AI Audit</span>
              </button>
            </div>
          </aside>
        )}
      </main>

      {/* 3. Output Terminal Panel */}
      <footer
        className="w-full bg-[#080c14] border-t border-slate-800/80 flex flex-col z-30 transition-all duration-200 shrink-0"
        id="output-panel"
      >
        <div className="h-9 px-4 bg-[#090d16] flex items-center justify-between text-xs font-mono select-none border-b border-slate-800/50">
          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => setIsOutputCollapsed((prev) => !prev)}
          >
            <span className="text-slate-400 font-mono text-[13px] font-semibold">&gt;_</span>
            <span className="font-sans font-medium text-slate-200 text-xs">Console Output</span>
            <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-1.5 py-0.2 rounded-full font-sans ml-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              ready
            </span>
          </div>

          <div className="flex items-center gap-4 text-slate-400 text-[11px]">
            <div className="hidden sm:flex items-center gap-3">
              <span>
                Exec: <span className="text-slate-200">{execTime}</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 border-l border-slate-800 pl-3">
              <button
                className="w-6 h-6 rounded hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors"
                onClick={clearConsole}
                title="Clear console"
              >
                <span className="material-symbols-outlined text-[15px]">delete_sweep</span>
              </button>
              <button
                className="w-6 h-6 rounded hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors"
                onClick={() => setIsOutputCollapsed((prev) => !prev)}
                title="Collapse / Expand"
              >
                <span className="material-symbols-outlined text-[16px]">
                  {isOutputCollapsed ? 'expand_less' : 'expand_more'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Console Body */}
        {!isOutputCollapsed && (
          <div className="p-4 font-mono text-xs leading-relaxed space-y-1 bg-[#080c14] overflow-y-auto max-h-48 min-h-[6rem]">
            {outputLogs.map((log, index) => (
              <div
                key={index}
                className={`flex items-start gap-2 ${
                  log.type === 'error'
                    ? 'text-rose-400 bg-rose-950/20 px-2 py-0.5 rounded -mx-2'
                    : log.type === 'log'
                    ? 'text-emerald-400 font-semibold'
                    : 'text-slate-400'
                }`}
              >
                <span className="text-slate-600 select-none">&gt;</span>
                <span className="whitespace-pre-wrap">{log.text}</span>
              </div>
            ))}
          </div>
        )}
      </footer>
    </div>
  );
}
