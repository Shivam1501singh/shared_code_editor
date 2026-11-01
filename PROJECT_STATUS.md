# Project Status & Execution Tracker

## Project: Real-Time Collaborative Code Editor with In-Room Voice & AI Assistant

**Status Overview:** Planning & Design Phase  
**Current Active Phase:** Phase 0 (Design Ingestion & Planning)  

---

## Phase Breakdown & Roadmap

```
[ Phase 1: Scaffolding ] ──> [ Phase 2: Auth & DB ] ──> [ Phase 3: Landing & Dashboard ]
                                                                      │
                                                                      ▼
[ Phase 6: Code Runner ] <── [ Phase 5: Voice Call ] <── [ Phase 4: Real-Time Editor ]
          │
          ▼
[ Phase 7: Gemini AI Review ] ──> [ Phase 8: Persistence & Polish ]
```

---

### Detailed Phase Specifications

#### **Phase 1: Project Scaffolding & Architecture Setup**
- **Status:** `NOT STARTED`
- **Objective:** Establish the hybrid monorepo structure with Next.js, Node.js WebSocket engine, and Prisma ORM.
- **Tasks & Deliverables:**
  - [ ] Initialize `frontend/` directory with Next.js (App Router, TypeScript, Tailwind CSS, Lucide Icons).
  - [ ] Initialize `server/` directory with Node.js, Express, and Socket.io.
  - [ ] Configure shared environment variables (`.env.local` and `server/.env`).
  - [ ] Initialize Prisma with PostgreSQL datasource.

---

#### **Phase 2: Authentication & Database Models (NextAuth + Prisma)**
- **Status:** `NOT STARTED`
- **Objective:** Enable mandatory user authentication via GitHub and Google (Gmail) OAuth and set up the database schema.
- **Tasks & Deliverables:**
  - [ ] Run Prisma migrations for `User`, `Account`, `Session`, `Room`, `RoomMember`, and `CodeSnapshot`.
  - [ ] Configure NextAuth route handler with GitHub and Google OAuth providers.
  - [ ] Implement session provider and auth middleware protecting `/dashboard` and `/room/[roomKey]`.
  - [ ] Create user profile component with avatar and logout action.

---

#### **Phase 3: Landing Page & User Dashboard**
- **Status:** `NOT STARTED`
- **Objective:** Build the UI for the public landing page and the authenticated user dashboard (integrating Stitch Page 1 & Page 2).
- **Tasks & Deliverables:**
  - [ ] Implement Landing Page (`/`) with Hero, feature cards, and GitHub/Google OAuth login buttons.
  - [ ] Implement User Dashboard (`/dashboard`):
    - [ ] "Create New Room" card (generates human-friendly key e.g., `code-8f2a1b`).
    - [ ] "Join Existing Room" card (key input field + join action).
    - [ ] Tabbed room history: "My Created Rooms" and "Recently Joined Rooms".
  - [ ] Implement REST endpoints:
    - [ ] `POST /api/rooms` (Create room)
    - [ ] `GET /api/dashboard/rooms` (Fetch user rooms)

---

#### **Phase 4: Collaborative Code Workspace (Monaco + Socket.io)**
- **Status:** `NOT STARTED`
- **Objective:** Build the distraction-free "Zen" coding workspace with sub-50ms real-time sync (integrating Stitch Page 3).
- **Tasks & Deliverables:**
  - [ ] Embed Monaco Editor with JavaScript syntax highlighting, line numbers, and dark theme.
  - [ ] Establish Socket.io room connection (`room:join`, `room:init`, `user:joined`, `user:left`).
  - [ ] Implement bidirectional code synchronization (`code:update`, `code:broadcast`).
  - [ ] Implement remote cursor carets and name tags (`cursor:update`, `cursor:broadcast`).
  - [ ] Implement Room Header (Room key badge, Copy Invite Link toast, active user avatars).

---

#### **Phase 5: In-Room WebRTC Voice Communication**
- **Status:** `NOT STARTED`
- **Objective:** Allow both collaborators to speak directly in the workspace using peer-to-peer audio.
- **Tasks & Deliverables:**
  - [ ] Implement WebRTC signaling handlers over Socket.io (`voice:join`, `voice:offer`, `voice:answer`, `voice:ice-candidate`).
  - [ ] Implement microphone capture via `navigator.mediaDevices.getUserMedia`.
  - [ ] Build audio controls: Microphone Mute / Unmute toggle button.
  - [ ] Implement Web Audio API (`AudioContext` + `AnalyserNode`) for active speaker detection (green pulsing avatar glow).

---

#### **Phase 6: Sandboxed JavaScript Execution & Output Console**
- **Status:** `NOT STARTED`
- **Objective:** Provide a fast, safe in-browser JavaScript execution engine that captures logs without freezing the browser.
- **Tasks & Deliverables:**
  - [ ] Implement Web Worker sandbox via Blob URL for isolated execution (no DOM/cookie access).
  - [ ] Intercept `console.log`, `console.warn`, and `console.error` and stream to the output panel.
  - [ ] Build 5-second Watchdog timeout guard to safely terminate accidental infinite loops (`while(true)`).
  - [ ] Build collapsible bottom Output Console drawer with execution time badge and "Clear" action.

---

#### **Phase 7: Google Gemini AI Code Review & Complexity Analyzer**
- **Status:** `NOT STARTED`
- **Objective:** Integrate Google Gemini 1.5/2.0 Flash to calculate Big-O complexity, detect bugs, and suggest optimizations (integrating Stitch Page 4).
- **Tasks & Deliverables:**
  - [ ] Implement secure Next.js API Route `/api/ai/analyze` with `GEMINI_API_KEY`.
  - [ ] Construct structured system prompts enforcing strict JSON response schema.
  - [ ] Build the AI Review slide-over drawer:
    - [ ] Big-O Time Complexity and Space Complexity metric pills ($O(n)$, $O(1)$).
    - [ ] Warnings & bug detection with line number references.
    - [ ] Optimized code diff preview with 1-click "Apply to Editor" (syncs to both peers).

---

#### **Phase 8: Persistence, Room Lifecycle & Final Polish**
- **Status:** `NOT STARTED`
- **Objective:** Ensure all changes persist to PostgreSQL, clean up room exits, and polish UX.
- **Tasks & Deliverables:**
  - [ ] Implement debounced (15s) code buffer flush from Socket.io memory to PostgreSQL.
  - [ ] Implement Room deletion (host only) and member leave handling.
  - [ ] Add network drop recovery and automatic socket reconnect with toast notices.
  - [ ] Add one-click "Download Code" (`.js` file export).

---

## Phase Execution Progress

| Phase | Description | Status |
| :---: | :--- | :---: |
| **0** | **Design Ingestion & Planning** | `COMPLETED` |
| **1** | **Scaffolding & Architecture Setup** | `IN PROGRESS` |
| **2** | **Authentication & Database (NextAuth + Prisma)** | `NOT STARTED` |
| **3** | **Landing Page & User Dashboard** | `NOT STARTED` |
| **4** | **Collaborative Editor (Monaco + Socket.io)** | `NOT STARTED` |
| **5** | **In-Room WebRTC Voice Communication** | `NOT STARTED` |
| **6** | **Sandboxed JS Runner & Output Console** | `NOT STARTED` |
| **7** | **Gemini AI Review & Big-O Analyzer** | `NOT STARTED` |
| **8** | **Persistence, Polish & Final Verification** | `NOT STARTED` |
