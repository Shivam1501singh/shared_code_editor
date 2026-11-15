'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';
import { useParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import Link from 'next/link';
import { WebRTCVoiceManager } from '@/lib/webrtc';

// Dynamically import Monaco Editor to avoid SSR window issues
const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

interface Participant {
  id: string;
  name: string;
  image: string | null;
  color: string;
  socketId: string;
}

interface AIAnalysis {
  timeComplexity: string;
  spaceComplexity: string;
  complexityExplanation: string;
  errors: Array<{
    line?: number;
    severity: 'error' | 'warning' | 'info';
    message: string;
  }>;
  optimizationTips: string[];
  optimizedCode: string;
}

export default function CollaborativeRoomPage() {
  const params = useParams();
  const roomKey = params?.roomKey as string;
  const { data: session } = useSession();

  const [code, setCode] = useState<string>('// Loading collaborative editor...');
  const [roomTitle, setRoomTitle] = useState<string>('Untitled Room');
  const [roomHost, setRoomHost] = useState<{ id: string; name: string } | null>(null);
  const [activeUsers, setActiveUsers] = useState<Participant[]>([]);
  const [socketConnected, setSocketConnected] = useState(false);

  // WebRTC Voice State
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);
  const [activeSpeakerSocketId, setActiveSpeakerSocketId] = useState<string | null>(null);

  // Output terminal state
  const [outputLogs, setOutputLogs] = useState<Array<{ type: 'log' | 'error' | 'info'; text: string }>>([
    { type: 'info', text: 'SynCode WebAssembly isolate ready. Press Run to execute.' },
  ]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [execTime, setExecTime] = useState<string>('0ms');
  const [isOutputCollapsed, setIsOutputCollapsed] = useState(false);
  const [consoleHeight, setConsoleHeight] = useState(190);
  const isDraggingRef = useRef(false);

  // In-place Room Title Editing
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState('');
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  // Gemini AI Review state
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiData, setAiData] = useState<AIAnalysis | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Auto-Save & Cloud Persistence State
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [copyToast, setCopyToast] = useState(false);
  const [exportToast, setExportToast] = useState(false);
  const [consoleCopyToast, setConsoleCopyToast] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const voiceManagerRef = useRef<WebRTCVoiceManager | null>(null);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const isRemoteUpdateRef = useRef<boolean>(false);
  const remoteCursorDecorationsRef = useRef<Map<string, string[]>>(new Map());
  const remoteWidgetsRef = useRef<Map<string, any>>(new Map());

  // Unique per-tab collaborator seed and reactive profile
  const tabSeedRef = useRef<string>('');
  const userColorRef = useRef<string>('#38bdf8');
  const currentUserRef = useRef<{
    id: string;
    name: string;
    image: string | null;
    color: string;
  }>({
    id: 'guest',
    name: 'Collaborator',
    image: null,
    color: '#38bdf8',
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!tabSeedRef.current) {
      let seed = sessionStorage.getItem('syncode_tab_seed');
      if (!seed) {
        seed = Math.random().toString(36).substring(2, 7);
        sessionStorage.setItem('syncode_tab_seed', seed);
      }
      tabSeedRef.current = seed;
    }

    const palette = ['#38bdf8', '#818cf8', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb923c', '#2dd4bf'];
    const rawId = (session?.user?.id || 'guest') + '_' + tabSeedRef.current;
    let hash = 0;
    for (let i = 0; i < rawId.length; i++) {
      hash = (hash << 5) - hash + rawId.charCodeAt(i);
      hash |= 0;
    }
    const color = palette[Math.abs(hash) % palette.length];
    userColorRef.current = color;

    const resolvedName = session?.user?.name || `Guest (${tabSeedRef.current})`;
    const updatedUser = {
      id: session?.user?.id || `guest-${tabSeedRef.current}`,
      name: resolvedName,
      image: session?.user?.image || null,
      color,
    };
    currentUserRef.current = updatedUser;

    // Immediately sync resolved user profile to peers if already connected
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('user:profile-update', {
        roomKey,
        user: updatedUser,
      });
    }
  }, [session, roomKey]);

  // Cloud Persistence / Save handler
  const saveCodeToDb = useCallback(async (codeToSave: string, createSnapshot = false) => {
    if (!roomKey) return;
    try {
      setSaveStatus('saving');
      const res = await fetch(`/api/rooms/${roomKey}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codeContent: codeToSave,
          createSnapshot,
          note: createSnapshot ? `Checkpoint (${new Date().toLocaleTimeString()})` : undefined,
        }),
      });
      if (res.ok) {
        setSaveStatus('saved');
        setLastSavedAt(new Date());
      } else {
        setSaveStatus('error');
      }
    } catch (err) {
      console.error('Auto-save failed:', err);
      setSaveStatus('error');
    }
  }, [roomKey]);

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
            if (json.data.host) {
              setRoomHost(json.data.host);
            }
            setCode(json.data.codeContent || '// Start coding here...\n');
            setSaveStatus('saved');
          }
        }
      } catch (err) {
        console.error('Failed to load room details', err);
      }
    };
    fetchRoom();
  }, [roomKey]);

  // Unsaved changes browser guard
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveStatus === 'unsaved' || saveStatus === 'saving') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveStatus]);

  // Socket.io initialization, WebRTC Voice & Remote Cursor Tracking
  useEffect(() => {
    if (!roomKey) return;

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';
    const socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });
    socketRef.current = socket;

    // Initialize WebRTC Voice Manager
    const voiceManager = new WebRTCVoiceManager(socket, roomKey, {
      onSpeakingChange: (speaking) => {
        setIsLocalSpeaking(speaking);
      },
      onRemoteSpeakingChange: (socketId, speaking) => {
        setActiveSpeakerSocketId(speaking ? socketId : null);
      },
    });
    voiceManagerRef.current = voiceManager;

    socket.on('connect', () => {
      setSocketConnected(true);
      socket.emit('room:join', { roomKey, user: currentUserRef.current });
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

    socket.on('user:profile-update', ({ socketId, user, activeUsers }: any) => {
      if (activeUsers) {
        setActiveUsers(activeUsers);
      }
      if (remoteWidgetsRef.current.has(socketId)) {
        const widget = remoteWidgetsRef.current.get(socketId);
        try {
          const currentPos = widget.getPosition()?.position;
          if (currentPos) {
            widget.update(currentPos, user);
            editorRef.current?.layoutContentWidget(widget);
          }
        } catch (e) {}
      }
    });

    socket.on('user:left', ({ socketId }) => {
      setActiveUsers((prev) => prev.filter((u) => u.socketId !== socketId));

      // 1. Remove remote cursor widget
      if (editorRef.current && remoteWidgetsRef.current.has(socketId)) {
        const widget = remoteWidgetsRef.current.get(socketId);
        try {
          editorRef.current.removeContentWidget(widget);
        } catch (e) {
          console.error(e);
        }
        remoteWidgetsRef.current.delete(socketId);
      }

      // 2. Remove remote selection decorations
      if (editorRef.current && remoteCursorDecorationsRef.current.has(socketId)) {
        const oldDecorations = remoteCursorDecorationsRef.current.get(socketId) || [];
        editorRef.current.deltaDecorations(oldDecorations, []);
        remoteCursorDecorationsRef.current.delete(socketId);
      }

      const cleanId = String(socketId).replace(/[^a-zA-Z0-9_-]/g, '_');
      const styleEl = document.getElementById(`sel-style-${cleanId}`);
      if (styleEl) styleEl.remove();
    });

    // Real-Time Collaborator Cursor Tracking via Monaco Native ContentWidgets
    const renderRemoteCursor = (
      socketId: string,
      user: any,
      position: { lineNumber: number; column: number } | null,
      selection: any
    ) => {
      if (!editorRef.current || !monacoRef.current) return;
      if (socketRef.current && socketId === socketRef.current.id) return;

      const cleanId = String(socketId).replace(/[^a-zA-Z0-9_-]/g, '_');
      const color = user?.color || '#38bdf8';
      const name = user?.name || 'Collaborator';

      // 1. Manage physical caret line and floating peer badge using Monaco ContentWidget
      if (position?.lineNumber && position?.column) {
        let widget = remoteWidgetsRef.current.get(socketId);

        if (!widget) {
          const domNode = document.createElement('div');
          domNode.className = `monaco-remote-cursor-container cursor-widget-${cleanId}`;
          domNode.style.pointerEvents = 'none';
          domNode.style.position = 'absolute';
          domNode.style.zIndex = '60';

          const caretBar = document.createElement('div');
          caretBar.style.width = '2px';
          caretBar.style.height = '18px';
          caretBar.style.backgroundColor = color;
          caretBar.style.position = 'relative';
          caretBar.style.boxShadow = `0 0 6px ${color}`;

          const nameTag = document.createElement('div');
          nameTag.textContent = name;
          nameTag.style.position = 'absolute';
          nameTag.style.top = '-16px';
          nameTag.style.left = '0';
          nameTag.style.backgroundColor = color;
          nameTag.style.color = '#0a0e17';
          nameTag.style.fontSize = '9px';
          nameTag.style.lineHeight = '12px';
          nameTag.style.fontFamily = 'monospace';
          nameTag.style.fontWeight = '700';
          nameTag.style.padding = '0 4px';
          nameTag.style.borderRadius = '2px';
          nameTag.style.whiteSpace = 'nowrap';
          nameTag.style.pointerEvents = 'none';
          nameTag.style.boxShadow = '0 1px 4px rgba(0,0,0,0.5)';

          caretBar.appendChild(nameTag);
          domNode.appendChild(caretBar);

          let currentPosition = { lineNumber: position.lineNumber, column: position.column };

          widget = {
            allowEditorOverflow: true,
            suppressMouseDown: false,
            getId: () => `cursor-widget-${cleanId}`,
            getDomNode: () => domNode,
            getPosition: () => ({
              position: currentPosition,
              preference: [0], // EXACT
            }),
            update: (pos: { lineNumber: number; column: number }, usr: any) => {
              currentPosition = pos;
              if (usr?.color) {
                caretBar.style.backgroundColor = usr.color;
                caretBar.style.boxShadow = `0 0 6px ${usr.color}`;
                nameTag.style.backgroundColor = usr.color;
              }
              if (usr?.name) {
                nameTag.textContent = usr.name;
              }
            },
          };

          remoteWidgetsRef.current.set(socketId, widget);
          try {
            editorRef.current.addContentWidget(widget);
          } catch (e) {
            console.error('Failed to add content widget:', e);
          }
        } else {
          widget.update({ lineNumber: position.lineNumber, column: position.column }, user);
          try {
            editorRef.current.layoutContentWidget(widget);
          } catch (e) {
            console.error('Failed to layout content widget:', e);
          }
        }

        // Layout pass right after Monaco's DOM text update to eliminate cursor lag
        requestAnimationFrame(() => {
          if (editorRef.current && remoteWidgetsRef.current.has(socketId)) {
            const w = remoteWidgetsRef.current.get(socketId);
            try {
              editorRef.current.layoutContentWidget(w);
            } catch (e) {}
          }
        });
      }

      // 2. Synchronize remote selection highlight (if active)
      if (
        selection &&
        (selection.startLineNumber !== selection.endLineNumber ||
          selection.startColumn !== selection.endColumn)
      ) {
        let styleEl = document.getElementById(`sel-style-${cleanId}`) as HTMLStyleElement;
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = `sel-style-${cleanId}`;
          document.head.appendChild(styleEl);
        }
        styleEl.textContent = `
          .remote-selection-${cleanId} {
            background-color: ${color}33 !important;
          }
        `;

        const decorations = [
          {
            range: new monacoRef.current.Range(
              selection.startLineNumber,
              selection.startColumn,
              selection.endLineNumber,
              selection.endColumn
            ),
            options: {
              className: `remote-selection-${cleanId}`,
            },
          },
        ];
        const oldDecs = remoteCursorDecorationsRef.current.get(socketId) || [];
        const newDecs = editorRef.current.deltaDecorations(oldDecs, decorations);
        remoteCursorDecorationsRef.current.set(socketId, newDecs);
      } else {
        if (remoteCursorDecorationsRef.current.has(socketId)) {
          const oldDecs = remoteCursorDecorationsRef.current.get(socketId) || [];
          editorRef.current.deltaDecorations(oldDecs, []);
          remoteCursorDecorationsRef.current.delete(socketId);
        }
      }
    };

    socket.on('code:broadcast', ({ codeContent, cursorPosition, user, senderSocketId }) => {
      isRemoteUpdateRef.current = true;
      if (editorRef.current) {
        const model = editorRef.current.getModel();
        if (model && model.getValue() !== codeContent) {
          editorRef.current.executeEdits('remote-peer', [
            {
              range: model.getFullModelRange(),
              text: codeContent,
              forceMoveMarkers: true,
            },
          ]);
        }
      }
      setCode(codeContent);
      setSaveStatus('saved');

      // Instantly position peer's cursor at the character they just typed!
      if (cursorPosition && senderSocketId) {
        renderRemoteCursor(senderSocketId, user, cursorPosition, null);
      }
    });

    socket.on('cursor:broadcast', ({ socketId, user, position, selection }) => {
      renderRemoteCursor(socketId, user, position, selection);
    });

    socket.on('voice:speaking', ({ socketId, isSpeaking }) => {
      setActiveSpeakerSocketId(isSpeaking ? socketId : null);
    });

    socket.on('room:title-update', ({ title }: { title: string }) => {
      if (title && typeof title === 'string') {
        setRoomTitle(title);
      }
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      if (editorRef.current) {
        remoteWidgetsRef.current.forEach((w) => {
          try {
            editorRef.current?.removeContentWidget(w);
          } catch (e) {}
        });
        remoteCursorDecorationsRef.current.forEach((d) => {
          try {
            editorRef.current?.deltaDecorations(d, []);
          } catch (e) {}
        });
      }
      remoteWidgetsRef.current.clear();
      remoteCursorDecorationsRef.current.clear();
      document.querySelectorAll('[id^="sel-style-"]').forEach((el) => el.remove());
      voiceManager.destroy();
      socket.disconnect();
    };
  }, [roomKey, session]);

  // Handle local code edits and broadcast to peers with debounced auto-save
  const handleEditorChange = (value: string | undefined) => {
    const updatedCode = value || '';
    if (isRemoteUpdateRef.current) {
      isRemoteUpdateRef.current = false;
      return;
    }
    setCode(updatedCode);
    setSaveStatus('unsaved');

    // Debounce cloud database auto-save (2.5s)
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      saveCodeToDb(updatedCode, false);
    }, 2500);

    // Broadcast code update immediately with the accurate cursor position after character insertion
    queueMicrotask(() => {
      if (socketRef.current && socketRef.current.connected) {
        const pos = editorRef.current ? editorRef.current.getPosition() : null;
        socketRef.current.emit('code:update', {
          roomKey,
          codeContent: updatedCode,
          cursorPosition: pos
            ? {
                lineNumber: pos.lineNumber,
                column: pos.column,
              }
            : null,
          user: currentUserRef.current,
        });
      }
    });
  };

  // Download code as .js file export
  const downloadCode = () => {
    try {
      const blob = new Blob([code], { type: 'text/javascript;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeTitle = (roomTitle || 'syncode_solution')
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_')
        .replace(/_+/g, '_');
      link.href = url;
      link.download = `${safeTitle}.js`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setExportToast(true);
      setTimeout(() => setExportToast(false), 2000);
    } catch (err) {
      console.error('Failed to export code file:', err);
    }
  };

  // Start or Join WebRTC Audio
  const toggleVoiceChannel = async () => {
    if (!voiceManagerRef.current) return;
    if (!isVoiceActive) {
      const ok = await voiceManagerRef.current.startAudio();
      if (ok) {
        setIsVoiceActive(true);
        setIsMuted(false);
      }
    } else {
      const muted = voiceManagerRef.current.toggleMute();
      setIsMuted(muted);
    }
  };

  // Safe client-side JavaScript execution
  const executeCode = useCallback(() => {
    setIsExecuting(true);
    const startTime = performance.now();
    const logs: Array<{ type: 'log' | 'error' | 'info'; text: string }> = [];

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

      const runner = new Function(code);
      runner();

      const duration = (performance.now() - startTime).toFixed(1);
      setExecTime(`${duration}ms`);

      if (logs.length === 0) {
        logs.push({ type: 'info', text: 'Script evaluated successfully (no output logged).' });
      }

      // Automatically refresh console on new run, clearing old errors and logs
      setOutputLogs([
        { type: 'info', text: `-- Executed at ${new Date().toLocaleTimeString()} in ${duration}ms --` },
        ...logs,
      ]);
    } catch (err: any) {
      const duration = (performance.now() - startTime).toFixed(1);
      setExecTime(`${duration}ms`);
      // Display only the latest run error
      setOutputLogs([
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

  // Request AI Code Review from Google Gemini API
  const runAiReview = async () => {
    try {
      setIsAiLoading(true);
      setAiError(null);
      setIsAiDrawerOpen(true);

      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language: 'javascript' }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setAiData(json.data);
      } else {
        setAiError(json.error || 'Failed to complete AI review');
      }
    } catch (err: any) {
      setAiError('Network error connecting to Gemini API');
    } finally {
      setIsAiLoading(false);
    }
  };

  // 1-Click apply optimized code to Monaco and broadcast to all peers
  const applyOptimizedCode = () => {
    if (!aiData?.optimizedCode) return;
    const newCode = aiData.optimizedCode;
    setCode(newCode);
    if (socketRef.current && socketConnected) {
      socketRef.current.emit('code:update', { roomKey, codeContent: newCode });
    }
    setIsAiDrawerOpen(false);
  };

  // Keyboard shortcuts: Ctrl + Enter (Run) and Ctrl + S (Save snapshot)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        executeCode();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        saveCodeToDb(code, true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [executeCode, saveCodeToDb, code]);

  const copyRoomLink = () => {
    if (typeof window !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopyToast(true);
      setTimeout(() => setCopyToast(false), 2000);
    }
  };

  const clearConsole = () => {
    setOutputLogs([{ type: 'info', text: 'Console buffer cleared.' }]);
  };

  const copyConsoleOutput = () => {
    if (typeof window !== 'undefined' && navigator.clipboard) {
      const fullText = outputLogs.map((l) => l.text).join('\n');
      navigator.clipboard.writeText(fullText);
      setConsoleCopyToast(true);
      setTimeout(() => setConsoleCopyToast(false), 2000);
    }
  };

  const handleStartEditTitle = () => {
    setTempTitle(roomTitle);
    setIsEditingTitle(true);
    setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 50);
  };

  const saveTitle = async () => {
    setIsEditingTitle(false);
    const trimmed = tempTitle.trim();
    if (!trimmed || trimmed === roomTitle) return;

    setRoomTitle(trimmed);

    // Broadcast title update to peers
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('room:title-update', { roomKey, title: trimmed });
    }

    // Persist to Neon PostgreSQL
    try {
      await fetch(`/api/rooms/${roomKey}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      });
    } catch (err) {
      console.error('Failed to update room title:', err);
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      saveTitle();
    } else if (e.key === 'Escape') {
      setIsEditingTitle(false);
    }
  };

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const newHeight = window.innerHeight - moveEvent.clientY;
      const clamped = Math.max(90, Math.min(newHeight, window.innerHeight * 0.75));
      setConsoleHeight(clamped);
      if (editorRef.current) {
        editorRef.current.layout();
      }
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (editorRef.current) {
        editorRef.current.layout();
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const toggleOutputCollapse = () => {
    setIsOutputCollapsed((prev) => !prev);
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.layout();
      }
    }, 50);
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

          {/* In-Place Editable Workspace Title */}
          {isEditingTitle ? (
            <div className="flex items-center gap-1.5">
              <input
                ref={titleInputRef}
                type="text"
                value={tempTitle}
                onChange={(e) => setTempTitle(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={handleTitleKeyDown}
                maxLength={60}
                className="bg-slate-900 border border-indigo-500 rounded px-2.5 py-1 text-xs md:text-sm font-medium text-white focus:outline-none focus:ring-1 focus:ring-indigo-400 w-36 md:w-56 shadow-[0_0_10px_rgba(99,102,241,0.2)]"
              />
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  saveTitle();
                }}
                className="p-1 rounded hover:bg-slate-800 text-emerald-400 hover:text-emerald-300 transition-colors"
                title="Save workspace name"
              >
                <span className="material-symbols-outlined text-[16px]">check</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleStartEditTitle}
              className="group flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800/60 hover:border-slate-700 text-slate-200 hover:text-white transition-all cursor-pointer text-left"
              title="Click to rename workspace"
            >
              <span className="text-xs md:text-sm font-medium tracking-tight truncate max-w-[140px] md:max-w-[220px]">
                {roomTitle}
              </span>
              <span className="material-symbols-outlined text-[13px] text-slate-500 group-hover:text-indigo-400 opacity-60 group-hover:opacity-100 transition-all">
                edit
              </span>
            </button>
          )}

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

        {/* Right Section: Active Peers, Voice Controls, Actions */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Active Voice Pill */}
          <div className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-full bg-slate-900/90 border border-slate-800/90 shadow-sm">
            <div className="flex items-center -space-x-1.5">
              {activeUsers.map((user, idx) => {
                const isSpeaking = activeSpeakerSocketId === user.socketId;
                const isHostUser = roomHost && (user.id === roomHost.id || user.name === roomHost.name);
                return (
                  <div
                    key={user.socketId || idx}
                    style={{ borderColor: user.color || '#6366f1' }}
                    className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-[10px] font-semibold border transition-all relative ${
                      isSpeaking
                        ? 'bg-emerald-950 text-emerald-300 ring-2 ring-emerald-400/50 shadow-[0_0_8px_#10b981]'
                        : 'bg-slate-800 text-slate-200'
                    }`}
                    title={`${user.name} ${isHostUser ? '(Host / Creator 👑)' : '(Collaborator)'}`}
                  >
                    {user.name.substring(0, 2).toUpperCase()}
                  </div>
                );
              })}
            </div>

            {/* Speaking Audio Wave Animation */}
            {(isLocalSpeaking || activeSpeakerSocketId) && (
              <div className="hidden lg:flex items-center gap-0.5 h-3">
                <span className="w-0.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                <span className="w-0.5 h-3 bg-emerald-400 rounded-full animate-bounce"></span>
                <span className="w-0.5 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
              </div>
            )}

            {/* Mic Toggle Button */}
            <button
              onClick={toggleVoiceChannel}
              className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                !isVoiceActive
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-400'
                  : isMuted
                  ? 'bg-rose-950 text-rose-400 hover:bg-rose-900'
                  : 'bg-emerald-950 text-emerald-400 hover:bg-emerald-900'
              }`}
              title={
                !isVoiceActive
                  ? 'Click to enable WebRTC Voice Call'
                  : isMuted
                  ? 'Microphone muted (Click to unmute)'
                  : 'Microphone active (Click to mute)'
              }
            >
              <span className="material-symbols-outlined text-[13px]">
                {!isVoiceActive ? 'mic_none' : isMuted ? 'mic_off' : 'mic'}
              </span>
            </button>
          </div>

          {/* Download / Export Code Button */}
          <div className="relative">
            <button
              onClick={downloadCode}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white font-medium text-xs transition-all active:scale-95"
              type="button"
              title="Download solution.js"
            >
              <span className="material-symbols-outlined text-[14px]">download</span>
              <span className="hidden sm:inline">Export</span>
            </button>
            {exportToast && (
              <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-slate-800 text-slate-200 border border-slate-700 font-sans text-[11px] px-2 py-0.5 rounded shadow-xl whitespace-nowrap z-50">
                Downloaded to disk!
              </span>
            )}
          </div>

          {/* AI Review Drawer Button */}
          <button
            onClick={runAiReview}
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
            <span className="text-slate-700">•</span>

            {/* Cloud Auto-Save Status Indicator */}
            {saveStatus === 'saving' && (
              <span className="flex items-center gap-1 text-slate-400">
                <span className="material-symbols-outlined text-[13px] animate-spin">sync</span>
                <span>Saving...</span>
              </span>
            )}
            {saveStatus === 'saved' && (
              <span
                className="flex items-center gap-1 text-emerald-400/80"
                title={lastSavedAt ? `Saved to Neon PostgreSQL at ${lastSavedAt.toLocaleTimeString()}` : 'Saved to Neon DB'}
              >
                <span className="material-symbols-outlined text-[13px]">cloud_done</span>
                <span>Saved</span>
              </span>
            )}
            {saveStatus === 'unsaved' && (
              <span className="flex items-center gap-1 text-amber-400/90" title="Changes pending auto-save (or press Ctrl + S)">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                <span>Unsaved</span>
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="flex items-center gap-1 text-rose-400" title="Auto-save failed to connect">
                <span className="material-symbols-outlined text-[13px]">cloud_off</span>
                <span>Save error</span>
              </span>
            )}
          </div>
        </div>

        {/* Monaco Editor Container with Real-Time Caret Tracking */}
        <div className="flex-1 w-full h-full relative">
          <Editor
            height="100%"
            defaultLanguage="javascript"
            language="javascript"
            theme="vs-dark"
            value={code}
            onChange={handleEditorChange}
            onMount={(editor, monaco) => {
              editorRef.current = editor;
              monacoRef.current = monaco;

              const emitCursorUpdate = (position: any, selection: any) => {
                if (socketRef.current && socketRef.current.connected) {
                  socketRef.current.emit('cursor:update', {
                    roomKey,
                    position: position
                      ? {
                          lineNumber: position.lineNumber,
                          column: position.column,
                        }
                      : null,
                    selection: selection
                      ? {
                          startLineNumber: selection.startLineNumber,
                          startColumn: selection.startColumn,
                          endLineNumber: selection.endLineNumber,
                          endColumn: selection.endColumn,
                        }
                      : null,
                    user: currentUserRef.current,
                  });
                }
              };

              // Emit initial cursor position when mounting
              const startPos = editor.getPosition();
              if (startPos) {
                emitCursorUpdate(startPos, editor.getSelection());
              }

              // Synchronous immediate cursor position sync on clicks, typing, and arrow navigation
              editor.onDidChangeCursorPosition((e: any) => {
                emitCursorUpdate(e.position, editor.getSelection());
              });

              // Synchronous immediate selection sync on text selection
              editor.onDidChangeCursorSelection((e: any) => {
                emitCursorUpdate(editor.getPosition(), e.selection);
              });
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

        {/* Slide-over AI Review Drawer (Stitch Page 4) */}
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
                      3.5 Flash
                    </span>
                  </h2>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 pl-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>Google AI Studio Powered</span>
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
              {isAiLoading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400 font-mono text-xs">
                  <span className="material-symbols-outlined animate-spin text-[28px] text-cyan-400">progress_activity</span>
                  <span>Analyzing AST & Big-O complexity...</span>
                </div>
              ) : aiError ? (
                <div className="p-3.5 rounded-lg bg-rose-950/30 border border-rose-500/40 text-rose-300 text-xs">
                  <div className="flex items-center gap-1.5 font-medium mb-1">
                    <span className="material-symbols-outlined text-[16px]">error</span>
                    <span>Analysis Error</span>
                  </div>
                  <p>{aiError}</p>
                </div>
              ) : aiData ? (
                <>
                  {/* Big-O Complexity Badges */}
                  <div>
                    <span className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase font-mono">
                      Complexity Analysis
                    </span>
                    <div className="grid grid-cols-2 gap-2.5 mt-2">
                      <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/30 flex flex-col justify-between space-y-1 shadow-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-400 font-medium font-sans">Time</span>
                          <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-mono font-bold text-[11px]">
                            {aiData.timeComplexity}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-300 leading-normal font-sans pt-0.5">
                          {aiData.complexityExplanation}
                        </p>
                      </div>

                      <div className="p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/30 flex flex-col justify-between space-y-1 shadow-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-400 font-medium font-sans">Space</span>
                          <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-400 font-mono font-bold text-[11px]">
                            {aiData.spaceComplexity}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-300 leading-normal font-sans pt-0.5">
                          Auxiliary storage bounds
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Detected Mistakes & Syntax Issues */}
                  {aiData.errors && aiData.errors.length > 0 && (
                    <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/30 space-y-2">
                      <div className="flex items-center gap-1.5 text-rose-300 font-semibold text-xs">
                        <span className="material-symbols-outlined text-[16px]">error</span>
                        <span>Mistakes & Issues Found ({aiData.errors.length})</span>
                      </div>
                      <div className="space-y-1.5 pt-1">
                        {aiData.errors.map((e, idx) => (
                          <div key={idx} className="p-2 rounded bg-rose-950/40 border border-rose-800/40 text-xs">
                            {e.line && (
                              <span className="inline-block px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 font-mono text-[10px] font-bold mr-1.5">
                                Line {e.line}
                              </span>
                            )}
                            <span className="text-slate-200 leading-relaxed font-sans">{e.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recommended Fixes & Tips */}
                  {aiData.optimizationTips && aiData.optimizationTips.length > 0 && (
                    <div className="p-3.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 space-y-2">
                      <div className="flex items-center gap-1.5 text-indigo-300 font-semibold text-xs">
                        <span className="material-symbols-outlined text-[16px]">lightbulb</span>
                        <span>Recommended Changes & Fixes</span>
                      </div>
                      <ul className="space-y-1.5 pt-1 text-slate-300 text-xs leading-relaxed font-sans">
                        {aiData.optimizationTips.map((tip, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-indigo-400 font-mono font-bold text-[11px] pt-0.5">•</span>
                            <span>{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Optimization & Suggested Refactoring */}
                  {aiData.optimizedCode && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase font-mono">
                          Optimized Implementation
                        </span>
                        <span className="text-[10px] text-indigo-400 font-mono flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">bolt</span> Refactored
                        </span>
                      </div>
                      <div className="rounded-lg bg-[#080c14] border border-slate-800 p-3 font-mono text-[11px] leading-[18px] overflow-x-auto text-slate-300 shadow-inner select-text max-h-48">
                        <pre><code>{aiData.optimizedCode}</code></pre>
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>

            {aiData?.optimizedCode && (
              <div className="p-4 border-t border-slate-800/80 bg-[#0a0e17]/80 shrink-0 space-y-2">
                <button
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-gradient-to-r from-violet-500 via-indigo-500 to-cyan-500 hover:from-violet-400 hover:to-cyan-400 text-white font-medium text-xs transition-all shadow-md active:scale-95"
                  onClick={applyOptimizedCode}
                  type="button"
                >
                  <span className="material-symbols-outlined text-[15px]">auto_awesome</span>
                  <span>Apply to Editor & Sync Peers</span>
                </button>
              </div>
            )}
          </aside>
        )}
      </main>

      {/* 3. Output Terminal Panel (Draggable Height & Collapsible) */}
      <footer
        className="w-full bg-[#080c14] border-t border-slate-800/80 flex flex-col z-30 shrink-0 relative"
        id="output-panel"
        style={{
          height: isOutputCollapsed ? '36px' : `${consoleHeight}px`,
        }}
      >
        {/* Draggable Resize Handle */}
        {!isOutputCollapsed && (
          <div
            onMouseDown={startResize}
            className="absolute -top-1.5 left-0 right-0 h-3 cursor-ns-resize flex items-center justify-center group z-40"
            title="Drag to resize console output"
          >
            <div className="w-14 h-1 rounded-full bg-slate-700/80 group-hover:bg-indigo-400 active:bg-indigo-300 transition-colors shadow-sm" />
          </div>
        )}

        <div className="h-9 px-4 bg-[#090d16] flex items-center justify-between text-xs font-mono select-none border-b border-slate-800/50">
          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={toggleOutputCollapse}
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
              {/* Copy console logs button */}
              <div className="relative">
                <button
                  className="w-6 h-6 rounded hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors"
                  onClick={copyConsoleOutput}
                  title="Copy console output to clipboard"
                >
                  <span className="material-symbols-outlined text-[15px]">
                    {consoleCopyToast ? 'check' : 'content_copy'}
                  </span>
                </button>
                {consoleCopyToast && (
                  <span className="absolute -top-7 right-0 bg-slate-800 text-slate-200 border border-slate-700 font-sans text-[10px] px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap z-50">
                    Copied!
                  </span>
                )}
              </div>

              {/* Clear console button */}
              <button
                className="w-6 h-6 rounded hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors"
                onClick={clearConsole}
                title="Clear console buffer"
              >
                <span className="material-symbols-outlined text-[15px]">delete_sweep</span>
              </button>
              <button
                className="w-6 h-6 rounded hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors"
                onClick={toggleOutputCollapse}
                title="Collapse / Expand"
              >
                <span className="material-symbols-outlined text-[16px]">
                  {isOutputCollapsed ? 'expand_less' : 'expand_more'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Console Body with User Select and Text Cursor Enabled */}
        {!isOutputCollapsed && (
          <div className="flex-1 p-4 font-mono text-xs leading-relaxed space-y-1 bg-[#080c14] overflow-y-auto min-h-0 select-text cursor-text">
            {outputLogs.map((log, index) => (
              <div
                key={index}
                className={`flex items-start gap-2 select-text cursor-text ${
                  log.type === 'error'
                    ? 'text-rose-400 bg-rose-950/20 px-2 py-0.5 rounded -mx-2'
                    : log.type === 'log'
                    ? 'text-emerald-400 font-semibold'
                    : 'text-slate-400'
                }`}
              >
                <span className="text-slate-600 select-none">&gt;</span>
                <span className="whitespace-pre-wrap break-all select-text cursor-text">{log.text}</span>
              </div>
            ))}
          </div>
        )}
      </footer>
    </div>
  );
}
