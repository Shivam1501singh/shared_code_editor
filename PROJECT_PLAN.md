# Project Specification: Collaborative Real-Time Code Editor

## 1. Project Overview
A modern web-based real-time collaborative code editor. Users authenticate via OAuth, create private or shared coding rooms with a unique room key, invite collaborators, edit code simultaneously with live synchronization, and execute JavaScript directly in the workspace with interactive console output.

---

## 2. Core Decisions & Tech Stack

| Component | Selected Technology | Rationale |
| :--- | :--- | :--- |
| **Frontend Framework** | **Next.js (App Router, TypeScript)** | Modern React standard, file-based routing (`/dashboard`, `/room/[roomId]`), SSR/SEO friendly. |
| **Styling & UI** | **Tailwind CSS + Lucide Icons** | Fast styling, dark-mode first, clean developer-tool aesthetic. |
| **Code Editor Engine** | **Monaco Editor (`@monaco-editor/react`)** | Powers VS Code; native syntax highlighting, autocompletion, themes, and multi-cursor support. |
| **Authentication** | **NextAuth.js (Auth.js) with Prisma Adapter** | Secure session management; supports GitHub & Google OAuth out of the box. |
| **Real-time Server** | **Node.js + Express + Socket.io** | Bidirectional low-latency room events, text sync, active presence, and cursor sharing. |
| **ORM** | **Prisma** | Type-safe queries, schema migration workflows, seamless PostgreSQL integration. |
| **Database** | **PostgreSQL (Neon / Supabase)** | Robust relational data model for users, rooms, memberships, and saved code revisions. |
| **Code Execution (JS)** | **Sandboxed Client Execution (Web Worker / Iframe)** | Safe, instantaneous, zero backend latency/cost; captures `console.log`, `warn`, and `error`. |
| **AI Code Analysis & Big-O** | **Google Gemini 1.5/2.0 Flash (Google AI Studio)** | Fast, free-tier (1,500 req/day), analyzes Time/Space complexity, finds bugs, and suggests optimizations. |

---

## 3. Authentication Strategy: GitHub vs. Google

Both providers are supported seamlessly by **NextAuth.js**:
* **GitHub OAuth (Primary / Recommended for Devs)**:
  * Pulls GitHub username and avatar directly into the collaborative room.
  * Natural fit for programmers; unlocks future capabilities (exporting to GitHub Gists / Repos).
* **Google OAuth (Secondary / Universal Fallback)**:
  * Ensures non-GitHub users or learners can join with zero friction.
* **Access Rule**:
  * **Mandatory Authentication**: Both host and invitees must sign in to access a room. This guarantees every user has an authenticated identity, avatar, and persistent edit history.

---

## 4. Database Schema Design (Prisma)

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// NextAuth Models
model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model User {
  id            String       @id @default(cuid())
  name          String?
  email         String?      @unique
  emailVerified DateTime?
  image         String?
  accounts      Account[]
  sessions      Session[]
  hostedRooms   Room[]       @relation("RoomHost")
  roomMembers   RoomMember[]
  createdAt     DateTime     @default(now())
}

// Application Models
model Room {
  id          String        @id @default(cuid())
  roomKey     String        @unique // Human-friendly share key or nano-id
  title       String        @default("Untitled Room")
  language    String        @default("javascript")
  codeContent String        @db.Text @default("// Start coding here...\nconsole.log('Hello, Collaborative World!');")
  hostId      String
  host        User          @relation("RoomHost", fields: [hostId], references: [id], onDelete: Cascade)
  members     RoomMember[]
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
}

model RoomMember {
  id        String   @id @default(cuid())
  roomId    String
  userId    String
  role      String   @default("editor") // "host", "editor", "viewer"
  joinedAt  DateTime @default(now())
  room      Room     @relation(fields: [roomId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([roomId, userId])
}
```

---

## 5. Phased Feature Roadmap

```
Phase 1: Project Setup & Authentication
    ├── Next.js App Router + Tailwind CSS setup
    ├── Prisma ORM + PostgreSQL connection
    └── NextAuth.js (GitHub & Google Login buttons + Session management)
         │
Phase 2: Dashboard & Room Management
    ├── User Dashboard (View created rooms, view recently joined rooms)
    ├── "Create Room" Modal (Generates unique Room Key)
    └── "Join Room" Input (Enter Room Key / Direct link access)
         │
Phase 3: Real-Time Collaborative Workspace
    ├── Standalone Node.js + Socket.io Server
    ├── Monaco Editor integration in Next.js (Dark theme, syntax highlighting)
    ├── Socket.io room synchronization (code diffs/content updates)
    └── Presence awareness (Active user badges, remote cursor indicators)
         │
Phase 4: Code Execution & Output Terminal
    ├── Sandboxed execution environment (Web Worker)
    ├── Intercept `console.log`, `console.error`, and `console.warn`
    ├── Interactive Terminal/Console drawer (Run button, Clear, Timestamps)
    └── Execution timeout guard (prevents infinite loops from freezing UI)
         │
Phase 5: AI Code Review, Error Finding & Complexity Analysis
    ├── Integration with Google Gemini API (`gemini-1.5-flash` / `gemini-2.0-flash`)
    ├── Next.js secure Route Handler (`/api/ai/analyze`)
    ├── Time and Space Complexity calculation (Big-O: O(1), O(n), O(n log n))
    ├── Automated bug/syntax error detection with line numbers
    └── Code optimization suggestions with side-by-side diff & 1-click replace
         │
Phase 6: Persistence, State Sync & Polish
    ├── Auto-save code back to PostgreSQL
    ├── "Copy Invite Link" & "Copy Room Key" toast notifications
    └── Code export / download (`.js` file download)
         │
Phase 7: Multi-Language & Future Enhancements
    ├── Language switcher (Python, C++, TypeScript, Java via Piston API)
    ├── Real-time in-room text chat
    └── WebRTC Audio/Video upgrades
```

---

## 6. Execution Architecture

```
                       ┌────────────────────────┐
                       │  Next.js App (Client)  │
                       │   (Monaco Editor UI)   │
                       └─────┬────────────┬─────┘
                             │            │
             HTTP / Session  │            │  WebSockets (Socket.io)
                             ▼            ▼
             ┌──────────────────┐      ┌─────────────────────────┐
             │ Next.js Backend  │      │ Node.js Real-time Svc   │
             │ (Auth & Prisma)  │      │ (In-memory room state)  │
             └────────┬─────────┘      └────────────┬────────────┘
                      │                             │
                      ▼                             ▼
             ┌──────────────────┐        Broadcast to all peers
             │ PostgreSQL (DB)  │        in the same Room ID
             └──────────────────┘
```

---

## 7. Next Actions
Once this document is approved:
1. Initialize the project directory structure (`frontend/` and `server/`).
2. Set up Next.js with Tailwind CSS, NextAuth, and Prisma schema.
3. Configure the Node.js Socket.io server.
