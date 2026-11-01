# System Design Document (SDD)

## Project: Real-Time Collaborative Code Editor with Integrated Voice & Sandboxed Execution

**Document Version:** 1.0  
**Status:** Approved / Technical Specification  

---

## 1. High-Level Architecture & System Topology

The system adopts a modern decoupled full-stack architecture:
1. **Next.js Application**: Handles Server-Side Rendering (SSR), UI presentation, NextAuth authentication, and relational data operations via Prisma.
2. **Dedicated Node.js Real-Time Engine**: High-throughput Socket.io service maintaining in-memory room states, cursor broadcasts, and WebRTC audio signaling.
3. **PostgreSQL Database**: Persistent source of truth for users, accounts, sessions, room metadata, and saved code revisions.
4. **Browser Sandbox**: Isolated Web Worker environment for non-blocking, zero-risk JavaScript execution.
5. **Peer-to-Peer WebRTC Mesh**: Direct browser-to-browser encrypted audio streaming for in-room voice calls.

### 1.1 Architecture Diagram

```mermaid
flowchart TD
    subgraph ClientBrowsers["Client Layer (Browsers)"]
        UA["User A (Host)<br/>• Monaco Editor<br/>• Web Worker Sandbox<br/>• WebRTC MediaStream"]
        UB["User B (Collaborator)<br/>• Monaco Editor<br/>• Web Worker Sandbox<br/>• WebRTC MediaStream"]
    end

    subgraph WebLayer["Application & Data Layer"]
        NextApp["Next.js Application<br/>(App Router + NextAuth + Tailwind)"]
        PostgresDB[("PostgreSQL Database<br/>(Neon / Supabase)")]
    end

    subgraph RealTimeLayer["Real-Time & Signaling Layer"]
        SocketServer["Node.js + Socket.io Server<br/>• Room State Memory<br/>• Cursor & Code Broadcast<br/>• WebRTC Signaling Hub"]
    end

    UA <-->|"Direct P2P Encrypted Audio (WebRTC)"| UB
    UA <-->|"HTTPS / Session Auth"| NextApp
    UB <-->|"HTTPS / Session Auth"| NextApp
    NextApp <-->|"Prisma ORM (SQL)"| PostgresDB

    UA <-->|"WSS (Code Sync & Cursors)"| SocketServer
    UB <-->|"WSS (Code Sync & Cursors)"| SocketServer
    SocketServer -.->|"Periodic Code Flush (Debounced)"| PostgresDB
```

---

## 2. Frontend Architecture (Next.js App Router)

### 2.1 Component Hierarchy
```text
app/
├── layout.tsx                  # Root layout (SessionProvider, ThemeProvider, ToastProvider)
├── page.tsx                    # Landing / marketing page with Dual OAuth modal
├── (auth)/
│   └── signin/page.tsx         # NextAuth custom login page (GitHub & Google buttons)
├── dashboard/
│   └── page.tsx                # User dashboard (Create Room, Join by Key, Past Rooms)
└── room/
    └── [roomKey]/
        └── page.tsx            # Collaborative Room Workspace
            ├── RoomNavbar.tsx          # Key badge, Copy link, Run button, Voice controls
            ├── EditorWorkspace.tsx     # Monaco Editor (SSR disabled) + Remote Cursors
            ├── OutputConsole.tsx       # Bottom/Side drawer for logs, errors, runtime stats
            └── VoiceControls.tsx       # Mic mute/unmute, participant audio badges
```

### 2.2 Client-Side State Management
To keep the application decoupled and performant, client state is managed through modular React hooks:
- `useSocket(roomKey, user)`: Manages WebSocket connection, reconnect backoffs, and emits/receives sync events.
- `useWebRTC(socket, roomKey)`: Manages local audio media stream, peer connections, and audio level detection for active speaker glow.
- `useMonacoSync(editorRef, socket)`: Handles remote cursor decorations and code diff emissions without jumping cursor focus.
- `useCodeRunner()`: Spawns/terminates the isolated Web Worker and collects execution logs.

---

## 3. Real-Time Collaboration & Synchronization Engine

### 3.1 Socket.io Event Protocol

| Event Name | Direction | Payload Structure | Description |
| :--- | :--- | :--- | :--- |
| `room:join` | Client $\to$ Server | `{ roomKey, user: { id, name, image } }` | Client requests entry into room. |
| `room:init` | Server $\to$ Client | `{ code, language, activeUsers: User[] }` | Server sends current document state and participants. |
| `user:joined` | Server $\to$ Room | `{ user: User }` | Notifies peers of a new collaborator. |
| `code:update` | Client $\to$ Server | `{ roomKey, codeContent }` | Emitted when editor content changes. |
| `code:broadcast` | Server $\to$ Room | `{ codeContent, senderId }` | Relays updated code to other peers. |
| `cursor:update` | Client $\to$ Server | `{ roomKey, position: { lineNumber, column } }` | Emitted when local cursor moves. |
| `cursor:broadcast`| Server $\to$ Room | `{ userId, name, color, position }` | Renders collaborator cursor in Monaco. |
| `user:left` | Server $\to$ Room | `{ userId }` | Notifies peers and removes cursor/avatar. |

### 3.2 Sequence Diagram: Room Join & Code Synchronization

```mermaid
sequenceDiagram
    autonumber
    actor UserA as User A (Host)
    actor UserB as User B (Guest)
    participant Socket as Socket.io Server
    participant DB as PostgreSQL (Prisma)

    UserA->>Socket: room:join { roomKey: "code-xyz", user: UserA }
    Socket->>DB: Fetch initial code buffer if not in memory
    DB-->>Socket: Return codeContent
    Socket-->>UserA: room:init { code: "...", activeUsers: [UserA] }

    UserB->>Socket: room:join { roomKey: "code-xyz", user: UserB }
    Socket-->>UserB: room:init { code: "...", activeUsers: [UserA, UserB] }
    Socket->>UserA: user:joined { user: UserB }

    UserB->>Socket: code:update { roomKey: "code-xyz", codeContent: "new code" }
    Socket->>UserA: code:broadcast { codeContent: "new code", senderId: UserB }
    Note over Socket: Update in-memory room state
    Note over Socket,DB: Debounce 15s timer before writing to PostgreSQL
    Socket-->>DB: Flush updated codeContent
```

### 3.3 Concurrency & Text Collisions
1. **In-Memory Authoritative Cache**: The Socket.io server maintains the current document state in RAM (`rooms.get(roomKey).codeContent`).
2. **Selective Peer Updates**: When broadcasting changes, the server excludes the sender (`socket.to(roomKey).emit('code:broadcast')`), preventing local echo and cursor jump.
3. **Cursor Preservation**: Monaco Editor's `applyEdits` API is used instead of replacing the entire text value on every keystroke, preserving the local user's undo stack and caret position.

---

## 4. WebRTC In-Room Voice Communication Architecture

### 4.1 Signaling Flow via Socket.io
WebRTC establishes direct peer-to-peer audio streams between browsers, requiring only a lightweight signaling mechanism to exchange connection metadata:

```mermaid
sequenceDiagram
    autonumber
    actor Alice as User A (Host)
    participant Socket as Socket.io (Signaling Hub)
    actor Bob as User B (Peer)

    Alice->>Socket: webrtc:ready { roomKey }
    Bob->>Socket: webrtc:ready { roomKey }
    Note over Alice,Bob: Both users present in room

    Alice->>Alice: Create RTCPeerConnection & Audio Offer
    Alice->>Socket: webrtc:offer { targetId: Bob, sdp: offerSDP }
    Socket->>Bob: webrtc:offer { senderId: Alice, sdp: offerSDP }

    Bob->>Bob: Set Remote Description & Create Answer
    Bob->>Socket: webrtc:answer { targetId: Alice, sdp: answerSDP }
    Socket->>Alice: webrtc:answer { senderId: Bob, sdp: answerSDP }

    Alice->>Socket: webrtc:ice-candidate { targetId: Bob, candidate }
    Socket->>Bob: webrtc:ice-candidate { candidate }
    Bob->>Socket: webrtc:ice-candidate { targetId: Alice, candidate }
    Socket->>Alice: webrtc:ice-candidate { candidate }

    Note over Alice,Bob: P2P Audio Stream Established Directly
```

### 4.2 Audio Pipeline & Active Speaker Detection
```text
[ Microphone ]
      │
      ▼
[ navigator.mediaDevices.getUserMedia ]
      │
      ├──> [ RTCPeerConnection ] ──> Transmitted to Peer
      │
      ▼
[ AudioContext ] ──> [ AnalyserNode (FFT) ]
                              │
                              ▼
                Audio Frequency / Volume Meter (> Threshold)
                              │
                              ▼
            Active Speaker State: true -> Avatar Glow Indicator
```

---

## 5. Sandboxed Code Execution Engine

### 5.1 Architecture & Isolation
User-submitted JavaScript code is executed entirely in a dedicated browser **Web Worker** spawned via a Blob URL.
- **Security Boundary**: Web Workers cannot touch `window`, `document`, DOM nodes, cookies, or `localStorage`.
- **UI Non-blocking**: Heavy computations or algorithms run on an isolated background thread without freezing Monaco Editor or the UI.

### 5.2 Execution Flow & Watchdog Timeout

```mermaid
sequenceDiagram
    autonumber
    actor Dev as User / Collaborator
    participant UI as OutputConsole Component
    participant Watchdog as 5-Second Timeout Timer
    participant Worker as Isolated Web Worker Sandbox

    Dev->>UI: Clicks "Run" (or Ctrl + Enter)
    UI->>Worker: postMessage({ code: userCode })
    UI->>Watchdog: Start 5000ms countdown

    alt Code runs normally
        Worker->>Worker: Intercept console.log, warn, error
        Worker-->>UI: postMessage({ type: "log", payload: "Result: 42", runtime: 8 })
        UI->>Watchdog: Cancel timer
        UI->>Dev: Render output with green success badge
    else Infinite Loop Detected (e.g. while(true))
        Watchdog-->>UI: 5000ms limit reached
        UI->>Worker: worker.terminate()
        UI->>Dev: Show Error "Execution timed out (5s limit reached)"
        UI->>UI: Re-instantiate clean Worker instance
    end
```

---

## 6. AI Code Review, Error Finding & Complexity Engine (Google Gemini)

### 6.1 Architecture & Security Proxy
The AI analysis pipeline integrates **Google Gemini 1.5 / 2.0 Flash** via Google AI Studio. 
- **Security Boundary**: The client never contacts Google AI directly; all requests route through the Next.js API handler (`/api/ai/analyze`), keeping `GEMINI_API_KEY` hidden from the browser.
- **Structured Output**: Gemini is invoked with JSON mode (`responseMimeType: "application/json"`) to ensure strictly typed responses.

### 6.2 AI Analysis Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Room Collaborator
    participant UI as Room Workspace (Monaco)
    participant API as Next.js API (/api/ai/analyze)
    participant Gemini as Google Gemini 1.5/2.0 Flash

    Dev->>UI: Clicks "AI Review" ✨
    UI->>API: POST { code, language: "javascript" }
    API->>Gemini: generateContent(structuredPrompt)
    Gemini-->>API: JSON { timeComplexity, spaceComplexity, errors, optimizations }
    API-->>UI: 200 OK (Parsed Analysis)
    UI->>Dev: Render Complexity Badges, Line Highlights & Optimization Panel
```

### 6.3 Structured Schema Definition

```typescript
export interface AIAnalysisResponse {
  timeComplexity: string;        // e.g. "O(n^2)"
  spaceComplexity: string;       // e.g. "O(1)"
  complexityExplanation: string; // Explains the algorithmic reasoning
  errors: Array<{
    line?: number;
    severity: 'error' | 'warning' | 'info';
    message: string;
  }>;
  optimizationTips: string[];
  optimizedCode: string;
}
```

---

## 7. Data Layer & Prisma Schema

### 6.1 Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
    User ||--o{ Account : "authenticates via"
    User ||--o{ Session : "maintains"
    User ||--o{ Room : "hosts"
    User ||--o{ RoomMember : "participates in"
    Room ||--o{ RoomMember : "contains"

    User {
        string id PK
        string name
        string email UK
        string image
        datetime createdAt
    }

    Room {
        string id PK
        string roomKey UK
        string title
        string language
        string codeContent
        string hostId FK
        datetime createdAt
        datetime updatedAt
    }

    RoomMember {
        string id PK
        string roomId FK
        string userId FK
        string role
        datetime joinedAt
    }
```

### 6.2 Database Indexing & Optimization Strategy
- **`Room.roomKey`** is indexed with a `UNIQUE` constraint for instant $O(1)$ lookups when users navigate to `/room/[roomKey]`.
- **`RoomMember.userId`** and **`Room.hostId`** are indexed with foreign key indices for fast retrieval of the user's dashboard rooms list.
- **Code Save Debounce**: Keystrokes are not sent to PostgreSQL. Keystrokes only flow through WebSockets. The Socket server debounces database updates (writing at most once every 15 seconds per active room) to minimize write IOPS.

---

## 8. Scaling & Future High-Availability Roadmap

As the platform grows from peer pair-programming to thousands of concurrent rooms, the following scaling paths are designed into the architecture:

```mermaid
flowchart TD
    subgraph LoadBalancing["Edge / Ingress Layer"]
        LB["Cloudflare / NGINX Load Balancer<br/>(SSL Termination + Sticky Sessions)"]
    end

    subgraph AppCluster["Next.js Frontends (Stateless)"]
        Next1["Next.js Node 1"]
        Next2["Next.js Node 2"]
    end

    subgraph SocketCluster["Socket.io Real-Time Cluster"]
        Sock1["Socket Node A"]
        Sock2["Socket Node B"]
        RedisPubSub[("Redis Cluster<br/>(Socket.io Redis Adapter)")]
    end

    subgraph MediaAndAI["Media & Computation Scale"]
        SFU["LiveKit / Mediasoup SFU<br/>(Multi-user Audio/Video mesh)"]
        GeminiService["Google Gemini 1.5/2.0 API<br/>(Time/Space Complexity & Optimization)"]
        PistonRunner["Dockerized Execution Cluster (Piston)<br/>(Python, C++, Java, Rust sandboxes)"]
    end

    LB --> AppCluster
    LB --> SocketCluster
    Sock1 <-->|"Pub/Sub Cross-Server Broadcasts"| RedisPubSub
    Sock2 <-->|"Pub/Sub Cross-Server Broadcasts"| RedisPubSub
    SocketCluster -.-> SFU
    AppCluster -.-> GeminiService
    AppCluster -.-> PistonRunner
```

### 7.1 Real-Time Server Horizontal Scaling (Redis Adapter)
- When traffic exceeds a single Node.js instance, multiple Socket.io nodes can be deployed behind a load balancer with sticky sessions.
- By integrating `@socket.io/redis-adapter`, rooms and events seamlessly broadcast across different server nodes using Redis Pub/Sub channels (`room:code-xyz`).

### 7.2 WebRTC Scaling: Mesh to SFU (Selective Forwarding Unit)
- For 2 participants: Direct **P2P Mesh** has near-zero infrastructure cost and minimal latency.
- For 3+ participants (Future Team Rooms): Transition to an **SFU** (such as LiveKit or Mediasoup) where each client uploads one upstream audio track, and the SFU distributes downstream tracks to other participants, saving client bandwidth and CPU.

### 7.3 AI Integration Architecture (Google Gemini API)
- A Next.js API Route `/api/ai/analyze` receives the active code snippet.
- Calls Gemini with structured system prompts:
  - System Prompt: *"Analyze the provided JavaScript code for time and space complexity ($O(n)$) and suggest 3 high-impact optimizations."*
  - Output: Structured JSON payload with Big-O complexity tags, explanation, and diff recommendation rendered in an interactive modal.

### 7.4 Multi-Language Code Execution Cluster
- For JavaScript: Client-side Web Worker execution remains default (fastest, $0 server cost).
- For Python, C++, Java: Route execution requests to an isolated container cluster (e.g., [Piston API](https://github.com/engineer-man/piston) or Judge0 in Docker containers) with strict CPU, memory, and network constraints.

---

## 9. Security & Fault Tolerance Measures

1. **Authentication Verification on Socket Handshake**:
   - The Socket.io connection handshake inspects the NextAuth session token cookie. Unauthenticated sockets are rejected before joining any room.
2. **Execution Sandbox Hardening**:
   - Web Worker scripts run in strict mode (`"use strict";`).
   - Web Workers cannot access DOM APIs, cookies, or IndexedDB storage.
3. **Automatic Reconnection & State Recovery**:
   - If a collaborator experiences temporary packet loss or network disconnect, Socket.io automatically attempts reconnection with exponential backoff.
   - Upon reconnecting, the client emits `room:join` and immediately receives the authoritative `room:init` code buffer, resynchronizing any missed characters.
