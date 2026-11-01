'use client';

import React, { useState } from 'react';
import { signIn, useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function LandingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [guestRoomCode, setGuestRoomCode] = useState('');
  const [joinStatus, setJoinStatus] = useState<string | null>(null);

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const token = guestRoomCode.trim() || 'code-default';
    setJoinStatus(`Connecting to room ${token}...`);
    setTimeout(() => {
      router.push(`/room/${encodeURIComponent(token)}`);
    }, 700);
  };

  return (
    <div className="bg-[#0f131d] text-[#dfe2f1] min-h-screen selection:bg-[#571bc1] selection:text-[#c4abff] flex flex-col font-sans">
      {/* Header */}
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
              <span className="px-3 py-1.5 rounded text-sm text-[#dfe2f1] bg-[#262a35] font-medium">Overview</span>
              <span className="px-3 py-1.5 rounded text-sm text-[#c7c4d7] hover:text-[#dfe2f1] transition-colors cursor-pointer">Features</span>
              <span className="px-3 py-1.5 rounded text-sm text-[#c7c4d7] hover:text-[#dfe2f1] transition-colors cursor-pointer">Architecture</span>
              <span className="px-3 py-1.5 rounded text-sm text-[#c7c4d7] hover:text-[#dfe2f1] transition-colors cursor-pointer">Docs</span>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="https://github.com/Shivam1501singh/shared_code_editor"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#171b26] hover:bg-[#1c1f2a] border border-[#464554]/40 text-[#c7c4d7] hover:text-[#dfe2f1] transition-all text-xs font-mono"
            >
              <span className="material-symbols-outlined text-[16px]">code</span>
              <span>GitHub</span>
            </a>

            {status === 'authenticated' && session?.user ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#8083ff] hover:bg-[#c0c1ff] text-[#1000a9] font-medium transition-all text-sm shadow-[0_0_20px_rgba(192,193,255,0.25)]"
              >
                <span className="material-symbols-outlined text-[16px]">dashboard</span>
                <span>Dashboard</span>
              </Link>
            ) : (
              <button
                onClick={() => signIn()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#8083ff] hover:bg-[#c0c1ff] text-[#1000a9] font-medium transition-all text-sm shadow-[0_0_20px_rgba(192,193,255,0.25)]"
              >
                <span>Sign In</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full pt-16 flex-1 flex flex-col">
        {/* Subtle decorative ambient glows */}
        <div className="relative w-full overflow-hidden flex-1 flex flex-col justify-center">
          <div className="pointer-events-none absolute top-12 left-1/2 -translate-x-1/2 w-[720px] h-[480px] bg-[#571bc1]/20 rounded-full blur-[140px] -z-10" />
          <div className="pointer-events-none absolute top-40 left-1/2 -translate-x-1/3 w-[520px] h-[340px] bg-[#009bd1]/15 rounded-full blur-[110px] -z-10" />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07] -z-10"
            style={{
              backgroundImage: 'radial-gradient(rgba(192, 193, 255, 0.9) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }}
          />

          {/* Hero Header Area */}
          <section className="w-full max-w-5xl mx-auto px-4 text-center pt-10 pb-8 flex flex-col items-center">
            {/* Live Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#262a35]/90 shadow-md backdrop-blur-md mb-6 border border-[#464554]/30 cursor-default">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#7bd0ff] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#7bd0ff]"></span>
              </span>
              <span className="text-xs font-mono text-[#dfe2f1] tracking-wide">
                Real-time Pair Programming with Voice & Gemini AI
              </span>
              <span className="px-1.5 py-0.5 rounded bg-[#1c1f2a] text-[#7bd0ff] text-[10px] uppercase font-mono">
                v1.0
              </span>
            </div>

            {/* Main Headline */}
            <h1 className="text-3xl md:text-5xl font-semibold text-[#dfe2f1] max-w-4xl tracking-tight leading-tight">
              Code together in real-time. Talk seamlessly.
              <span className="block bg-gradient-to-r from-[#7bd0ff] via-[#c0c1ff] to-[#d0bcff] bg-clip-text text-transparent mt-1">
                Optimize with AI.
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-base md:text-lg text-[#c7c4d7] max-w-2xl mx-auto mt-4 leading-relaxed">
              Instant browser-based collaborative coding rooms. Zero dev setup. Integrated peer-to-peer WebRTC voice, multi-cursor sync, and Big-O complexity analysis.
            </p>

            {/* Central Authentication & Join Card */}
            <div className="w-full max-w-md mx-auto mt-8 text-left relative">
              <div className="h-1 w-full bg-gradient-to-r from-[#7bd0ff] via-[#8083ff] to-[#d0bcff] rounded-t-xl opacity-90" />
              <div className="bg-[#171b26]/95 backdrop-blur-2xl p-6 md:p-8 rounded-b-xl shadow-2xl border-x border-b border-[#464554]/30">
                <div className="mb-6">
                  <h2 className="text-xl font-semibold text-[#dfe2f1]">Sign in to start coding</h2>
                  <p className="text-xs text-[#c7c4d7] mt-1">Select your developer identity or enter with room key</p>
                </div>

                {/* OAuth Buttons */}
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => signIn('github', { callbackUrl: '/dashboard' })}
                    className="w-full py-3 px-4 rounded-lg bg-[#313540] hover:bg-[#353944] text-[#dfe2f1] text-sm font-medium flex items-center justify-between transition-all duration-200 active:scale-[0.99] shadow-sm group border border-[#464554]/30"
                  >
                    <div className="flex items-center gap-3">
                      <svg aria-hidden="true" className="w-5 h-5 fill-current text-[#dfe2f1] group-hover:text-[#c0c1ff] transition-colors" viewBox="0 0 24 24">
                        <path clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" fillRule="evenodd"></path>
                      </svg>
                      <span>Continue with GitHub</span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1c1f2a] text-[#7bd0ff]">⚡ Instant</span>
                  </button>

                  <button
                    onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
                    className="w-full py-3 px-4 rounded-lg bg-[#353944] hover:bg-[#313540] text-[#dfe2f1] text-sm font-medium flex items-center justify-between transition-all duration-200 active:scale-[0.99] shadow-sm group border border-[#464554]/30"
                  >
                    <div className="flex items-center gap-3">
                      <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"></path>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"></path>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"></path>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"></path>
                      </svg>
                      <span>Continue with Google</span>
                    </div>
                    <span className="material-symbols-outlined text-[#c7c4d7] group-hover:translate-x-0.5 transition-transform text-[18px]">arrow_forward</span>
                  </button>
                </div>

                {/* Divider */}
                <div className="relative my-6 flex items-center justify-center">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full h-px bg-[#313540]"></div>
                  </div>
                  <span className="relative px-3 bg-[#171b26] text-[#c7c4d7] text-[10px] font-mono uppercase tracking-wider">
                    or join with room key
                  </span>
                </div>

                {/* Quick Join Room Input */}
                <form className="flex flex-col gap-2" onSubmit={handleJoinRoom}>
                  <label className="text-[11px] font-mono text-[#c7c4d7] flex items-center justify-between" htmlFor="room-code-input">
                    <span>ROOM KEY / TOKEN</span>
                    <span className="text-[#7bd0ff]">Direct Entry</span>
                  </label>
                  <div className="flex items-center gap-2 p-1.5 rounded-lg bg-[#313540] focus-within:bg-[#353944] transition-all border border-[#464554]/30">
                    <span className="material-symbols-outlined text-[#908fa0] text-[18px] ml-2">tag</span>
                    <input
                      autoComplete="off"
                      className="bg-transparent border-0 outline-none text-[#dfe2f1] font-mono text-xs w-full placeholder:text-[#908fa0]"
                      id="room-code-input"
                      placeholder="e.g. code-8f2a1b"
                      value={guestRoomCode}
                      onChange={(e) => setGuestRoomCode(e.target.value)}
                      spellCheck="false"
                      type="text"
                    />
                    <button
                      className="px-4 py-2 rounded-lg bg-[#8083ff] hover:bg-[#c0c1ff] text-[#1000a9] font-medium transition-all flex items-center gap-1 shadow-sm whitespace-nowrap active:scale-95 text-xs"
                      type="submit"
                    >
                      <span>Join</span>
                      <span className="material-symbols-outlined text-[16px]">bolt</span>
                    </button>
                  </div>
                  {joinStatus && (
                    <div className="text-[#7bd0ff] text-xs font-mono mt-1 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                      <span>{joinStatus}</span>
                    </div>
                  )}
                </form>

                {/* Security Footnote */}
                <div className="mt-6 pt-4 border-t border-[#313540]/60 flex items-center justify-center gap-2 text-center">
                  <span className="material-symbols-outlined text-[#c0c1ff] text-[15px]">verified_user</span>
                  <p className="text-xs text-[#c7c4d7]">
                    End-to-end encrypted room sessions. No credit card required.
                  </p>
                </div>
              </div>
            </div>

            {/* Telemetry Status Ribbon */}
            <div className="flex flex-wrap items-center justify-center gap-4 mt-6 text-xs font-mono text-[#c7c4d7]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                <span>Socket Mesh Online</span>
              </span>
              <span className="text-[#313540]">•</span>
              <span className="inline-flex items-center gap-1">
                <span className="material-symbols-outlined text-[#7bd0ff] text-[14px]">speed</span>
                <span>Latency: ~18ms</span>
              </span>
              <span className="text-[#313540]">•</span>
              <span>Gemini 1.5 Flash Connected</span>
            </div>
          </section>

          {/* Feature Bento Grid */}
          <section className="w-full max-w-6xl mx-auto px-4 py-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
              <div>
                <span className="text-xs font-mono text-[#7bd0ff] tracking-wider uppercase font-semibold">Engineered For Pair Velocity</span>
                <h2 className="text-2xl md:text-3xl font-semibold text-[#dfe2f1] mt-1">Zero latency collaboration mechanics</h2>
              </div>
              <p className="text-sm text-[#c7c4d7] max-w-md">
                Built on high-throughput WebSocket synchronization with autonomous Gemini AI inference and peer-to-peer WebRTC voice.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card 1: Collaborative Editor */}
              <div className="rounded-xl bg-[#171b26] p-6 hover:bg-[#1c1f2a] transition-all duration-300 flex flex-col justify-between shadow-lg border border-[#464554]/20">
                <div>
                  <div className="w-10 h-10 rounded-lg bg-[#313540] flex items-center justify-center text-[#7bd0ff] mb-4 shadow-sm">
                    <span className="material-symbols-outlined text-[22px]">code_blocks</span>
                  </div>
                  <h3 className="text-base font-semibold text-[#dfe2f1] mb-2">Live Collaborative Editing</h3>
                  <p className="text-xs text-[#c7c4d7] leading-relaxed">
                    Sub-50ms synchronized typing with colored peer cursors, Monaco VS Code editor engine, and automatic state caching.
                  </p>
                </div>
                <div className="mt-6 rounded-lg bg-[#0a0e18] p-3 font-mono text-xs text-[#dfe2f1] border border-[#464554]/30">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#262a35] text-[10px] text-[#c7c4d7]">
                    <span>quicksort.js</span>
                    <span className="text-[#7bd0ff]">14ms sync</span>
                  </div>
                  <pre className="text-[#c7c4d7]"><code><span className="text-[#d0bcff]">const</span> solve = (arr) =&gt; &#123;<br/>  <span className="text-[#7bd0ff]">/* Alex typing line 4 */</span><br/>  <span className="text-[#c0c1ff]">return</span> arr.sort();<br/>&#125;;</code></pre>
                </div>
              </div>

              {/* Card 2: Voice Mesh */}
              <div className="rounded-xl bg-[#171b26] p-6 hover:bg-[#1c1f2a] transition-all duration-300 flex flex-col justify-between shadow-lg border border-[#464554]/20">
                <div>
                  <div className="w-10 h-10 rounded-lg bg-[#313540] flex items-center justify-center text-[#c0c1ff] mb-4 shadow-sm">
                    <span className="material-symbols-outlined text-[22px]">graphic_eq</span>
                  </div>
                  <h3 className="text-base font-semibold text-[#dfe2f1] mb-2">In-Room Voice Mesh</h3>
                  <p className="text-xs text-[#c7c4d7] leading-relaxed">
                    Built-in spatial WebRTC audio without switching to Discord or Zoom. Automatic noise-suppression and active speaker glow.
                  </p>
                </div>
                <div className="mt-6 rounded-lg bg-[#0a0e18] p-3 border border-[#464554]/30">
                  <div className="flex items-center justify-between mb-3 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[#8083ff] text-[#1000a9] flex items-center justify-center text-[10px] font-bold">AL</div>
                      <span className="text-xs text-[#dfe2f1]">Alex (Speaking)</span>
                    </div>
                    <span className="text-[10px] text-[#c0c1ff] px-1.5 py-0.5 rounded bg-[#262a35] font-mono">48 kHz Stereo</span>
                  </div>
                  <div className="h-8 w-full flex items-center justify-center gap-1">
                    <span className="w-1 bg-[#7bd0ff] rounded-full animate-pulse h-3"></span>
                    <span className="w-1 bg-[#7bd0ff] rounded-full animate-pulse h-6 delay-75"></span>
                    <span className="w-1 bg-[#c0c1ff] rounded-full animate-pulse h-7 delay-150"></span>
                    <span className="w-1 bg-[#c0c1ff] rounded-full animate-pulse h-5 delay-100"></span>
                    <span className="w-1 bg-[#d0bcff] rounded-full animate-pulse h-7 delay-200"></span>
                    <span className="w-1 bg-[#d0bcff] rounded-full animate-pulse h-4"></span>
                  </div>
                </div>
              </div>

              {/* Card 3: Gemini AI Advisor */}
              <div className="rounded-xl bg-[#171b26] p-6 hover:bg-[#1c1f2a] transition-all duration-300 flex flex-col justify-between shadow-lg border border-[#464554]/20">
                <div>
                  <div className="w-10 h-10 rounded-lg bg-[#313540] flex items-center justify-center text-[#d0bcff] mb-4 shadow-sm">
                    <span className="material-symbols-outlined text-[22px]">neurology</span>
                  </div>
                  <h3 className="text-base font-semibold text-[#dfe2f1] mb-2">Gemini AI Code Advisor</h3>
                  <p className="text-xs text-[#c7c4d7] leading-relaxed">
                    Instant Big-O time complexity calculation, memory profiling, and automated bug detection while you and your partner type.
                  </p>
                </div>
                <div className="mt-6 rounded-lg bg-[#0a0e18] p-3 flex flex-col gap-2 border border-[#464554]/30">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] text-[#d0bcff] flex items-center gap-1 font-mono">
                      <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                      <span>Complexity Audit</span>
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[#262a35] font-mono text-[10px] text-[#7bd0ff]">O(n log n)</span>
                  </div>
                  <div className="flex items-center justify-between text-[#c7c4d7] font-mono text-[11px]">
                    <span>Analysis Speed:</span>
                    <span className="text-[#dfe2f1]">0.3s (Flash)</span>
                  </div>
                  <div className="w-full bg-[#262a35] rounded-full h-1.5 overflow-hidden">
                    <div className="bg-gradient-to-r from-[#7bd0ff] to-[#d0bcff] h-1.5 rounded-full w-4/5"></div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full bg-[#0a0e18] border-t border-[#464554]/20 py-6">
        <div className="w-full max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#c0c1ff] text-[18px]">bolt</span>
            <span className="text-xs font-mono text-[#c7c4d7]">© 2026 SynCode Labs. Real-time collaborative editor with Voice & AI.</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-[#c7c4d7]">
            <a href="https://github.com/Shivam1501singh/shared_code_editor" target="_blank" rel="noreferrer" className="hover:text-[#dfe2f1] transition-colors">GitHub Repository</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
