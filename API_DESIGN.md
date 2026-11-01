# API Specification Document

## Project: Real-Time Collaborative Code Editor with In-Room Voice & AI Assistant

**Document Version:** 1.0  
**Status:** Approved / API-First Specification  

---

## 1. Overview & Communication Protocols

The application utilizes two distinct communication channels:
1. **REST APIs (Next.js App Router Route Handlers)**: Used for stateful HTTP operations (authentication, room creation/management, dashboard queries, and secure Google Gemini AI proxy).
2. **WebSocket Events (Socket.io)**: Used for sub-50ms bidirectional real-time synchronization (code text changes, cursor coordinates, user presence) and WebRTC audio call signaling.

---

## 2. REST API Specification

### Base URL
- Local: `http://localhost:3000/api`
- Production: `https://<your-domain>/api`

---

### 2.1 Room Management Endpoints

#### **Endpoint 1: Create a Room**
- **Route**: `POST /api/rooms`
- **Authentication**: Required (`NextAuth Session`)
- **Description**: Generates a new room record with a unique, human-friendly `roomKey`.
- **Request Headers**:
  - `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "title": "LeetCode Practice: Sliding Window",
    "language": "javascript"
  }
  ```
- **Responses**:
  - **`201 Created`**:
    ```json
    {
      "success": true,
      "data": {
        "id": "cuid1234567890",
        "roomKey": "code-8f2a1b",
        "title": "LeetCode Practice: Sliding Window",
        "language": "javascript",
        "hostId": "user_cuid_abc",
        "createdAt": "2026-10-25T11:45:00.000Z"
      }
    }
    ```
  - **`401 Unauthorized`**:
    ```json
    { "success": false, "error": "Authentication required" }
    ```

---

#### **Endpoint 2: Get Room by Room Key**
- **Route**: `GET /api/rooms/[roomKey]`
- **Authentication**: Required
- **Description**: Fetches room metadata and the latest saved code buffer. Automatically records the current user as a `RoomMember`.
- **URL Parameters**:
  - `roomKey`: `string` (e.g., `code-8f2a1b`)
- **Responses**:
  - **`200 OK`**:
    ```json
    {
      "success": true,
      "data": {
        "id": "cuid1234567890",
        "roomKey": "code-8f2a1b",
        "title": "LeetCode Practice: Sliding Window",
        "language": "javascript",
        "codeContent": "// Start coding collaboratively here...\nconsole.log('Hello!');",
        "host": {
          "id": "user_cuid_abc",
          "name": "Shivam Singh",
          "image": "https://avatars.githubusercontent.com/u/12345"
        },
        "isHost": true,
        "createdAt": "2026-10-25T11:45:00.000Z",
        "updatedAt": "2026-10-25T11:50:00.000Z"
      }
    }
    ```
  - **`404 Not Found`**:
    ```json
    { "success": false, "error": "Room not found with key code-8f2a1b" }
    ```

---

#### **Endpoint 3: Update Room (Title or Manual Code Save)**
- **Route**: `PATCH /api/rooms/[roomKey]`
- **Authentication**: Required
- **Request Body**:
  ```json
  {
    "title": "Updated Room Title",
    "codeContent": "console.log('Manual save buffer');"
  }
  ```
- **Responses**:
  - **`200 OK`**:
    ```json
    {
      "success": true,
      "data": {
        "roomKey": "code-8f2a1b",
        "updatedAt": "2026-10-25T11:52:00.000Z"
      }
    }
    ```

---

#### **Endpoint 4: Delete Room**
- **Route**: `DELETE /api/rooms/[roomKey]`
- **Authentication**: Required (Host Only)
- **Responses**:
  - **`200 OK`**:
    ```json
    { "success": true, "message": "Room deleted successfully" }
    ```
  - **`403 Forbidden`**:
    ```json
    { "success": false, "error": "Only the host can delete this room" }
    ```

---

### 2.2 Dashboard Endpoints

#### **Endpoint 5: Fetch User Dashboard Rooms**
- **Route**: `GET /api/dashboard/rooms`
- **Authentication**: Required
- **Description**: Returns all rooms created by the current user and rooms they have joined previously.
- **Responses**:
  - **`200 OK`**:
    ```json
    {
      "success": true,
      "data": {
        "createdRooms": [
          {
            "id": "cuid_1",
            "roomKey": "code-8f2a1b",
            "title": "Two Sum Algorithm",
            "language": "javascript",
            "updatedAt": "2026-10-25T11:50:00.000Z",
            "memberCount": 2
          }
        ],
        "joinedRooms": [
          {
            "id": "cuid_2",
            "roomKey": "code-3k9z8q",
            "title": "Alex's Debugging Space",
            "language": "javascript",
            "lastActiveAt": "2026-10-25T10:15:00.000Z",
            "hostName": "Alex Rivera",
            "hostImage": "https://avatars.githubusercontent.com/u/999"
          }
        ]
      }
    }
    ```

---

### 2.3 AI Code Review & Complexity Endpoint (Google Gemini)

#### **Endpoint 6: Analyze Code Complexity & Find Errors**
- **Route**: `POST /api/ai/analyze`
- **Authentication**: Required
- **Description**: Proxies code to Google Gemini 1.5/2.0 Flash with a strict JSON system prompt.
- **Request Body**:
  ```json
  {
    "code": "function twoSum(nums, target) {\n  for (let i = 0; i < nums.length; i++) {\n    for (let j = i + 1; j < nums.length; j++) {\n      if (nums[i] + nums[j] === target) return [i, j];\n    }\n  }\n}",
    "language": "javascript"
  }
  ```
- **Responses**:
  - **`200 OK`**:
    ```json
    {
      "success": true,
      "data": {
        "timeComplexity": "O(n^2)",
        "spaceComplexity": "O(1)",
        "complexityExplanation": "The function contains a double nested for-loop iterating over the 'nums' array of length n, leading to quadratic time complexity.",
        "errors": [
          {
            "line": 4,
            "severity": "warning",
            "message": "Potential edge case: If target complement does not exist, function returns undefined implicitly."
          }
        ],
        "optimizationTips": [
          "Use a JavaScript Map or Hash Object to store visited numbers and their indices.",
          "This reduces time complexity from O(n^2) to O(n) in a single pass."
        ],
        "optimizedCode": "function twoSum(nums, target) {\n  const map = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    const complement = target - nums[i];\n    if (map.has(complement)) {\n      return [map.get(complement), i];\n    }\n    map.set(nums[i], i);\n  }\n  return [];\n}"
      }
    }
    ```
  - **`400 Bad Request`**:
    ```json
    { "success": false, "error": "Code content cannot be empty" }
    ```
  - **`429 Too Many Requests`**:
    ```json
    { "success": false, "error": "AI rate limit reached. Please wait a moment." }
    ```

---

## 3. WebSocket (Socket.io) Event Contract

### Namespace: `/`
- Connection Handshake URL: `ws://localhost:4000/socket.io/?roomKey=code-8f2a1b`

---

### 3.1 Room & Presence Events

#### Event: `room:join`
- **Sender**: Client $\to$ Server
- **Payload**:
  ```json
  {
    "roomKey": "code-8f2a1b",
    "user": {
      "id": "user_123",
      "name": "Shivam Singh",
      "image": "https://avatars.githubusercontent.com/u/12345"
    }
  }
  ```

#### Event: `room:init`
- **Sender**: Server $\to$ Client (Targeted to the joining user)
- **Payload**:
  ```json
  {
    "roomKey": "code-8f2a1b",
    "codeContent": "console.log('Current buffer in memory');",
    "language": "javascript",
    "activeUsers": [
      {
        "id": "user_123",
        "name": "Shivam Singh",
        "image": "https://avatars.githubusercontent.com/u/12345",
        "color": "#3B82F6"
      }
    ]
  }
  ```

#### Event: `user:joined`
- **Sender**: Server $\to$ Other Room Members
- **Payload**:
  ```json
  {
    "user": {
      "id": "user_456",
      "name": "Alex",
      "image": "https://avatars.githubusercontent.com/u/67890",
      "color": "#10B981"
    }
  }
  ```

#### Event: `user:left`
- **Sender**: Server $\to$ Other Room Members
- **Payload**:
  ```json
  {
    "userId": "user_456"
  }
  ```

---

### 3.2 Collaborative Code & Cursor Events

#### Event: `code:update`
- **Sender**: Client $\to$ Server
- **Payload**:
  ```json
  {
    "roomKey": "code-8f2a1b",
    "codeContent": "function add(a, b) { return a + b; }"
  }
  ```

#### Event: `code:broadcast`
- **Sender**: Server $\to$ Other Room Members (Excludes sender)
- **Payload**:
  ```json
  {
    "codeContent": "function add(a, b) { return a + b; }",
    "senderId": "user_123"
  }
  ```

#### Event: `cursor:update`
- **Sender**: Client $\to$ Server
- **Payload**:
  ```json
  {
    "roomKey": "code-8f2a1b",
    "position": {
      "lineNumber": 14,
      "column": 25
    }
  }
  ```

#### Event: `cursor:broadcast`
- **Sender**: Server $\to$ Other Room Members (Excludes sender)
- **Payload**:
  ```json
  {
    "userId": "user_123",
    "userName": "Shivam Singh",
    "userColor": "#3B82F6",
    "position": {
      "lineNumber": 14,
      "column": 25
    }
  }
  ```

---

### 3.3 WebRTC Voice Signaling Events

#### Event: `voice:join`
- **Sender**: Client $\to$ Server
- **Payload**:
  ```json
  {
    "roomKey": "code-8f2a1b"
  }
  ```

#### Event: `voice:offer`
- **Sender**: Client A $\to$ Server $\to$ Client B
- **Payload**:
  ```json
  {
    "roomKey": "code-8f2a1b",
    "targetUserId": "user_456",
    "senderUserId": "user_123",
    "sdp": { "type": "offer", "sdp": "v=0..." }
  }
  ```

#### Event: `voice:answer`
- **Sender**: Client B $\to$ Server $\to$ Client A
- **Payload**:
  ```json
  {
    "roomKey": "code-8f2a1b",
    "targetUserId": "user_123",
    "senderUserId": "user_456",
    "sdp": { "type": "answer", "sdp": "v=0..." }
  }
  ```

#### Event: `voice:ice-candidate`
- **Sender**: Client $\to$ Server $\to$ Peer
- **Payload**:
  ```json
  {
    "roomKey": "code-8f2a1b",
    "targetUserId": "user_456",
    "candidate": { "candidate": "...", "sdpMid": "0", "sdpMLineIndex": 0 }
  }
  ```

#### Event: `voice:speaking`
- **Sender**: Client $\to$ Server $\to$ Room
- **Payload**:
  ```json
  {
    "roomKey": "code-8f2a1b",
    "userId": "user_123",
    "isSpeaking": true
  }
  ```

---

## 4. Shared TypeScript Data Transfer Objects (DTOs)

```typescript
// Shared Types across Next.js and Socket Server

export interface UserSession {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

export interface RoomData {
  id: string;
  roomKey: string;
  title: string;
  language: string;
  codeContent: string;
  hostId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CursorPosition {
  lineNumber: number;
  column: number;
}

export interface ActiveParticipant {
  id: string;
  name: string;
  image: string | null;
  color: string;
  isSpeaking?: boolean;
}

export interface AIAnalysisRequest {
  code: string;
  language?: string;
}

export interface AIAnalysisResponse {
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
```
