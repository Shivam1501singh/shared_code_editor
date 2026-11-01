'use client';

import React, { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Room {
  id: string;
  roomKey: string;
  title: string;
  language: string;
  updatedAt: string;
  host?: {
    id: string;
    name: string | null;
    image: string | null;
  };
  members?: Array<{
    user: {
      id: string;
      name: string | null;
      image: string | null;
    };
  }>;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'created' | 'joined'>('created');
  const [createdRooms, setCreatedRooms] = useState<Room[]>([]);
  const [joinedRooms, setJoinedRooms] = useState<Room[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);

  const [newRoomTitle, setNewRoomTitle] = useState('');
  const [creatingRoom, setCreatingRoom] = useState(false);

  const [joinKeyInput, setJoinKeyInput] = useState('');
  const [joiningRoom, setJoiningRoom] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2500);
  };

  // Redirect to landing if unauthenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  // Fetch rooms from backend API
  const fetchRooms = async () => {
    try {
      setLoadingRooms(true);
      const res = await fetch('/api/dashboard/rooms');
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setCreatedRooms(json.data.createdRooms || []);
          setJoinedRooms(json.data.joinedRooms || []);
        }
      }
    } catch (err) {
      console.error('Failed to load dashboard rooms', err);
    } finally {
      setLoadingRooms(false);
    }
  };

  useEffect(() => {
    if (status === 'authenticated') {
      fetchRooms();
    }
  }, [status]);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreatingRoom(true);
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newRoomTitle.trim() || 'Untitled Workspace',
          language: 'javascript',
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        showToast('Room created successfully!');
        router.push(`/room/${json.data.roomKey}`);
      } else {
        showToast(json.error || 'Failed to create room');
      }
    } catch {
      showToast('Network error creating room');
    } finally {
      setCreatingRoom(false);
    }
  };

  const handleJoinKey = (e: React.FormEvent) => {
    e.preventDefault();
    const token = joinKeyInput.trim();
    if (!token) return;
    setJoiningRoom(true);
    showToast(`Joining room ${token}...`);
    setTimeout(() => {
      router.push(`/room/${encodeURIComponent(token)}`);
    }, 400);
  };

  const copyToken = (token: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(token);
      showToast(`Room token "${token}" copied to clipboard!`);
    }
  };

  const displayedRooms = activeTab === 'created' ? createdRooms : joinedRooms;
  const filteredRooms = displayedRooms.filter((r) => {
    const q = searchQuery.toLowerCase();
    return r.title.toLowerCase().includes(q) || r.roomKey.toLowerCase().includes(q);
  });

  if (status === 'loading') {
    return (
      <div className="bg-[#0f131d] text-[#dfe2f1] min-h-screen flex items-center justify-center font-mono">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined animate-spin text-[#8083ff]">progress_activity</span>
          <span>Loading developer profile...</span>
        </div>
      </div>
    );
  }

  const userName = session?.user?.name || 'Developer';
  const userInitials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  return (
    <div className="bg-[#0f131d] text-[#dfe2f1] min-h-screen selection:bg-[#571bc1] selection:text-[#c4abff] font-sans flex flex-col">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#313540]/95 backdrop-blur-xl text-[#dfe2f1] shadow-2xl border border-[#464554]/40 text-xs font-mono animate-in fade-in slide-in-from-bottom-2">
          <span className="material-symbols-outlined text-[#8083ff] text-[18px]">check_circle</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Navbar */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#0f131d]/85 backdrop-blur-xl border-b border-[#464554]/30">
        <div className="h-16 w-full px-6 md:px-8 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#262a35] border border-[#464554]/40 shadow-sm">
                <span className="material-symbols-outlined text-[#c0c1ff] text-[20px]">bolt</span>
              </div>
              <span className="font-semibold text-lg text-[#dfe2f1] tracking-tight">SynCode</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[#262a35] text-[#c0c1ff] border border-[#464554]/40 font-semibold">
                Beta
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              <Link href="/dashboard" className="px-3 py-1.5 rounded text-sm text-[#dfe2f1] bg-[#262a35] font-medium">
                Dashboard
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#0a0e18] border border-[#464554]/30 text-xs font-mono">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
              </span>
              <span className="text-[#c7c4d7]">Socket Online</span>
            </div>

            <div className="flex items-center gap-2 pl-3 border-l border-[#464554]/30">
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#1c1f2a] border border-[#464554]/30">
                {session?.user?.image ? (
                  <img src={session.user.image} alt={userName} className="w-7 h-7 rounded-full object-cover" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-[#571bc1] text-[#c4abff] flex items-center justify-center text-xs font-mono font-semibold">
                    {userInitials}
                  </div>
                )}
                <span className="hidden lg:inline-block text-xs font-medium text-[#dfe2f1]">{userName}</span>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="p-1.5 rounded-lg hover:bg-[#262a35] text-[#c7c4d7] hover:text-[#dfe2f1] transition-colors"
                title="Sign Out"
              >
                <span className="material-symbols-outlined text-[18px]">logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full pt-20 pb-12 flex-1">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-8 flex flex-col gap-8">
          {/* Greeting Banner */}
          <div className="relative overflow-hidden rounded-xl bg-[#171b26] p-6 md:p-8 shadow-xl border border-[#464554]/20">
            <div className="absolute -top-24 -right-16 w-80 h-80 rounded-full bg-[#8083ff]/10 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 left-1/3 w-64 h-64 rounded-full bg-[#571bc1]/20 blur-3xl pointer-events-none" />

            <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#c0c1ff] font-semibold px-2 py-0.5 rounded bg-[#262a35] border border-[#464554]/30">
                    Developer Workspace
                  </span>
                  <span className="text-xs text-[#c7c4d7] font-mono">• Neon Serverless Postgres</span>
                </div>
                <h1 className="text-2xl md:text-3xl font-semibold text-[#dfe2f1] tracking-tight">
                  Welcome back,{' '}
                  <span className="bg-gradient-to-r from-[#dfe2f1] via-[#c0c1ff] to-[#d0bcff] bg-clip-text text-transparent">
                    {userName}
                  </span>
                </h1>
                <p className="text-sm text-[#c7c4d7]">
                  Create a new session or jump back into your synchronized peer-to-peer code rooms.
                </p>
              </div>

              {/* Telemetry Metric Pills */}
              <div className="flex flex-wrap items-center gap-3 bg-[#0a0e18]/80 backdrop-blur-md p-2 rounded-xl border border-[#464554]/30 shadow-inner">
                <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-[#262a35]/60">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#7bd0ff] shadow-[0_0_8px_#7bd0ff]"></div>
                  <div className="flex flex-col">
                    <span className="text-sm text-[#dfe2f1] font-semibold leading-none">{createdRooms.length}</span>
                    <span className="text-[10px] font-mono text-[#c7c4d7]">Created Rooms</span>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-[#262a35]/60">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#d0bcff] shadow-[0_0_8px_#d0bcff]"></div>
                  <div className="flex flex-col">
                    <span className="text-sm text-[#dfe2f1] font-semibold leading-none">{joinedRooms.length}</span>
                    <span className="text-[10px] font-mono text-[#c7c4d7]">Joined Sessions</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Dual Quick Action Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Card A: Start a New Room */}
            <div className="flex flex-col justify-between p-6 rounded-xl bg-[#171b26] border border-[#464554]/20 shadow-xl">
              <div>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#8083ff] text-[#1000a9] flex items-center justify-center shadow-md">
                      <span className="material-symbols-outlined text-[22px]">add_box</span>
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-[#dfe2f1] tracking-tight">Start a New Room</h2>
                      <span className="text-[10px] font-mono text-[#c0c1ff] uppercase font-semibold">Instant Zero-Config</span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-[#571bc1]/30 text-[#d0bcff] text-[10px] font-mono border border-[#d0bcff]/30">
                    Auto-Key
                  </span>
                </div>
                <p className="text-xs text-[#c7c4d7] mb-4">
                  Spin up a shared workspace with live Monaco JavaScript editor, WebRTC voice call, and Gemini AI review.
                </p>

                <form className="space-y-4" onSubmit={handleCreateRoom}>
                  <div>
                    <label className="block text-[11px] font-mono text-[#c7c4d7] mb-1.5 uppercase tracking-wider">
                      Workspace Title
                    </label>
                    <div className="relative flex items-center">
                      <span className="material-symbols-outlined absolute left-3 text-[#908fa0] text-[18px]">edit_note</span>
                      <input
                        className="w-full bg-[#0a0e18] text-[#dfe2f1] placeholder:text-[#908fa0] text-xs rounded-lg pl-10 pr-4 py-2.5 outline-none border border-[#464554]/30 focus:border-[#8083ff] transition-colors"
                        placeholder="e.g. LeetCode Practice, Two Sum Algorithm"
                        value={newRoomTitle}
                        onChange={(e) => setNewRoomTitle(e.target.value)}
                        type="text"
                      />
                    </div>
                  </div>

                  <button
                    disabled={creatingRoom}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-gradient-to-r from-[#8083ff] via-[#494bd6] to-[#571bc1] text-[#dfe2f1] text-xs font-semibold shadow-lg hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-50"
                    type="submit"
                  >
                    {creatingRoom ? (
                      <>
                        <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                        <span>Generating Room Key...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[18px]">bolt</span>
                        <span>Create Room &amp; Get Key</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>

            {/* Card B: Join with Room Key */}
            <div className="flex flex-col justify-between p-6 rounded-xl bg-[#171b26] border border-[#464554]/20 shadow-xl">
              <div>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#313540] text-[#c0c1ff] flex items-center justify-center shadow-md">
                      <span className="material-symbols-outlined text-[22px]">login</span>
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-[#dfe2f1] tracking-tight">Join with Room Key</h2>
                      <span className="text-[10px] font-mono text-[#c7c4d7] uppercase font-semibold">Immediate Huddle</span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-[#313540] text-[#c7c4d7] text-[10px] font-mono border border-[#464554]/30">
                    Peer Sync
                  </span>
                </div>
                <p className="text-xs text-[#c7c4d7] mb-4">
                  Enter a room key or token shared by your friend to join the editor in real-time.
                </p>

                <form className="space-y-4" onSubmit={handleJoinKey}>
                  <div>
                    <label className="block text-[11px] font-mono text-[#c7c4d7] mb-1.5 uppercase tracking-wider">
                      Access Token / Room Key
                    </label>
                    <div className="relative flex items-center">
                      <span className="material-symbols-outlined absolute left-3 text-[#908fa0] text-[18px]">key</span>
                      <input
                        className="w-full bg-[#0a0e18] text-[#dfe2f1] font-mono text-xs placeholder:text-[#908fa0] rounded-lg pl-10 pr-20 py-2.5 outline-none border border-[#464554]/30 focus:border-[#8083ff] transition-colors"
                        placeholder="Enter key e.g. code-8f2a1b"
                        value={joinKeyInput}
                        onChange={(e) => setJoinKeyInput(e.target.value)}
                        type="text"
                      />
                      <button
                        className="absolute right-2 px-2.5 py-1 rounded bg-[#262a35] text-[#c7c4d7] hover:text-[#dfe2f1] border border-[#464554]/30 text-[10px] font-mono uppercase transition-colors"
                        onClick={async () => {
                          if (navigator.clipboard) {
                            const text = await navigator.clipboard.readText();
                            setJoinKeyInput(text);
                            showToast('Pasted from clipboard');
                          }
                        }}
                        type="button"
                      >
                        Paste
                      </button>
                    </div>
                  </div>

                  <button
                    disabled={joiningRoom || !joinKeyInput.trim()}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-[#262a35] hover:bg-[#313540] text-[#dfe2f1] text-xs font-semibold shadow-md transition-all active:scale-[0.99] border border-[#464554]/30 disabled:opacity-50"
                    type="submit"
                  >
                    <span>Connect to Room</span>
                    <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Rooms History Section */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
              {/* Tab Selector */}
              <div className="flex items-center p-1 rounded-xl bg-[#171b26] border border-[#464554]/30 shadow-inner">
                <button
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === 'created'
                      ? 'bg-[#313540] text-[#c0c1ff] shadow-sm'
                      : 'text-[#c7c4d7] hover:text-[#dfe2f1]'
                  }`}
                  onClick={() => setActiveTab('created')}
                >
                  <span>My Created Rooms</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-[#8083ff]/20 text-[#c0c1ff] text-[10px] font-mono font-semibold">
                    {createdRooms.length}
                  </span>
                </button>
                <button
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === 'joined'
                      ? 'bg-[#313540] text-[#c0c1ff] shadow-sm'
                      : 'text-[#c7c4d7] hover:text-[#dfe2f1]'
                  }`}
                  onClick={() => setActiveTab('joined')}
                >
                  <span>Recently Joined</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-[#262a35] text-[#c7c4d7] text-[10px] font-mono font-semibold">
                    {joinedRooms.length}
                  </span>
                </button>
              </div>

              {/* Search Filter */}
              <div className="relative flex items-center sm:w-64">
                <span className="material-symbols-outlined absolute left-3 text-[#908fa0] text-[18px]">search</span>
                <input
                  className="w-full bg-[#171b26] text-[#dfe2f1] text-xs placeholder:text-[#908fa0] rounded-lg pl-9 pr-3 py-1.5 outline-none border border-[#464554]/30 focus:border-[#8083ff] transition-colors shadow-sm"
                  placeholder="Filter rooms by title or key..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  type="text"
                />
              </div>
            </div>

            {/* Room Cards Grid */}
            {loadingRooms ? (
              <div className="flex items-center justify-center p-12 text-xs font-mono text-[#c7c4d7]">
                <span className="material-symbols-outlined animate-spin text-[#8083ff] mr-2">progress_activity</span>
                <span>Loading room history...</span>
              </div>
            ) : filteredRooms.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 rounded-xl bg-[#171b26] text-center border border-[#464554]/20">
                <span className="material-symbols-outlined text-[#908fa0] text-[40px] mb-2">dashboard_customize</span>
                <h4 className="text-sm font-semibold text-[#dfe2f1]">No rooms found</h4>
                <p className="text-xs text-[#c7c4d7] max-w-sm mt-1">
                  {searchQuery
                    ? 'No workspace matched your filter query.'
                    : activeTab === 'created'
                    ? 'You have not created any rooms yet. Click "Start a New Room" above!'
                    : 'You have not joined any shared rooms yet.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredRooms.map((room) => (
                  <div
                    key={room.id}
                    className="group flex flex-col justify-between p-5 rounded-xl bg-[#171b26] hover:bg-[#1c1f2a] border border-[#464554]/20 shadow-lg transition-all duration-200"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[#f7df1e]"></span>
                            <span className="text-[10px] font-mono text-[#c7c4d7]">JavaScript</span>
                            <span className="text-[#464554] text-[10px]">•</span>
                            <span className="text-[10px] font-mono text-[#7bd0ff] flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#7bd0ff] animate-pulse"></span>
                              Active
                            </span>
                          </div>
                          <h3 className="text-base font-semibold text-[#dfe2f1] group-hover:text-[#c0c1ff] transition-colors">
                            {room.title}
                          </h3>
                        </div>
                      </div>

                      {/* Token copy pill */}
                      <div className="flex items-center gap-3 mb-4">
                        <button
                          onClick={() => copyToken(room.roomKey)}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0a0e18] hover:bg-[#313540] text-[#c0c1ff] font-mono text-xs font-medium border border-[#464554]/30 transition-colors"
                        >
                          <span>{room.roomKey}</span>
                          <span className="material-symbols-outlined text-[13px] text-[#908fa0]">content_copy</span>
                        </button>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-[#262a35] flex items-center justify-between gap-2">
                      <div className="text-[11px] text-[#c7c4d7] font-mono">
                        {new Date(room.updatedAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </div>

                      <Link
                        href={`/room/${room.roomKey}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#8083ff] text-[#1000a9] text-xs font-semibold shadow hover:brightness-110 transition-all"
                      >
                        <span>Open Editor</span>
                        <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
