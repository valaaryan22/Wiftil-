# Client Contacts & Communication Logs API Documentation

This document outlines the newly added endpoints for managing Client Contacts (Stakeholders) and Client Communication Logs.

## Base URL Configuration
All endpoints are relative to your API base URL (e.g., `http://localhost:3000/api/v1`).
All endpoints require a valid JWT Bearer token in the `Authorization` header.

---

## 1. Client Contacts API

Manage the stakeholders or points of contact associated with a specific client.

### 1.1 List Client Contacts
Retrieve a paginated list of contacts for a specific client.

- **URL:** `GET /clients/:clientId/contacts`
- **Access:** Any authenticated user
- **Query Parameters (Optional):**
  - `page` (integer): Page number (default: 1)
  - `limit` (integer): Number of items per page (default: 20)
  - `search` (string): Search by name, email, department, or job title.
  - `stakeholderType` (string): Filter by stakeholder type (e.g., "Internal", "Partner").

**Response Example:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "clientId": "uuid",
      "name": "Jane Doe",
      "jobTitle": "Marketing Lead",
      "department": "Marketing",
      "phone": "+1-555-1234",
      "email": "jane@example.com",
      "badges": ["Primary", "Decision Maker"],
      "preferredChannel": "Email",
      "stakeholderType": "Internal",
      "relationshipNote": "Prefers concise emails.",
      "lastContactedAt": "2026-07-16T10:00:00.000Z",
      "isActive": true,
      "createdBy": {
        "id": "uuid",
        "firstName": "Aryan",
        "lastName": "Sharma"
      }
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 20
  }
}
```

### 1.2 Get Contact by ID
- **URL:** `GET /clients/:clientId/contacts/:contactId`
- **Access:** Any authenticated user

### 1.3 Create a Client Contact
- **URL:** `POST /clients/:clientId/contacts`
- **Access:** `MANAGER` or higher (Role Level ≤ 3)
- **Content-Type:** `application/json`

**Request Body:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | Yes | |
| `jobTitle` | string | No | |
| `department` | string | No | |
| `phone` | string | No | |
| `whatsappNumber` | string | No | |
| `email` | string | No | Must be a valid email |
| `badges` | array | No | Example: `["Approver", "Decision Maker"]` |
| `preferredChannel` | string | No | Enum: `Email`, `Phone`, `WhatsApp`, `Meeting`, `Other` |
| `stakeholderType` | string | No | |
| `relationshipNote` | string | No | |
| `lastContactedAt` | string | No | ISO 8601 DateTime format |
| `isActive` | boolean | No | Default: `true` |

### 1.4 Update a Client Contact
- **URL:** `PATCH /clients/:clientId/contacts/:contactId`
- **Access:** `MANAGER` or higher (Role Level ≤ 3)
- **Content-Type:** `application/json`
- **Request Body:** Same as Create (all fields are optional).

### 1.5 Delete a Client Contact
- **URL:** `DELETE /clients/:clientId/contacts/:contactId`
- **Access:** `MANAGER` or higher (Role Level ≤ 3)

---

## 2. Client Communication Logs API

Manually log communications (calls, meetings, emails) with a client. Includes support for file attachments.

### 2.1 List Communication Logs
- **URL:** `GET /clients/:clientId/comms`
- **Access:** Any authenticated user
- **Query Parameters (Optional):**
  - `page` (integer): Page number (default: 1)
  - `limit` (integer): Number of items per page (default: 20)
  - `search` (string): Search by title, summary, or nextAction.
  - `channel` (string): Filter by channel (`Call`, `Meeting`, `Email`, `WhatsApp`, `Other`).
  - `followUpPending` (boolean): If `true`, returns logs where `followUpDate` is today or earlier AND `followUpDone` is `false`.

**Response Example:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "clientId": "uuid",
      "title": "Monthly Sync",
      "channel": "Meeting",
      "contactPersonId": "uuid",
      "communicatedAt": "2026-07-16T14:30:00.000Z",
      "summary": "Discussed Q3 deliverables.",
      "nextAction": "Send updated timeline.",
      "followUpDate": "2026-07-18",
      "followUpDone": false,
      "attachmentUrl": "https://res.cloudinary.com/...",
      "loggedBy": {
        "id": "uuid",
        "firstName": "Aryan",
        "lastName": "Sharma"
      },
      "contactPerson": {
        "id": "uuid",
        "name": "Jane Doe",
        "jobTitle": "Marketing Lead"
      }
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 20
  }
}
```

### 2.2 Get Communication Log by ID
- **URL:** `GET /clients/:clientId/comms/:logId`
- **Access:** Any authenticated user

### 2.3 Create a Communication Log
> **IMPORTANT:** Because this endpoint accepts an optional file attachment, you **MUST** send the request as `multipart/form-data`, NOT JSON.

- **URL:** `POST /clients/:clientId/comms`
- **Access:** Any authenticated user
- **Content-Type:** `multipart/form-data`

**Request Body (Form Data Fields):**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `title` | string | Yes | |
| `channel` | string | Yes | Enum: `Call`, `Meeting`, `Email`, `WhatsApp`, `Other` |
| `communicatedAt` | string | Yes | ISO 8601 DateTime (e.g., `2026-07-16T14:30:00Z`) |
| `summary` | string | Yes | |
| `contactPersonId` | UUID | No | The ID of the Client Contact |
| `nextAction` | string | No | |
| `followUpDate` | string | No | Date string (e.g., `2026-07-18`) |
| `followUpDone` | boolean | No | `true` or `false` |
| `attachment` | File | No | Upload a file to Cloudinary |

### 2.4 Update a Communication Log
> **IMPORTANT:** Like Create, this endpoint accepts an optional file attachment and uses `multipart/form-data`.

- **URL:** `PATCH /clients/:clientId/comms/:logId`
- **Access:** The user who logged it OR `MANAGER` (Role Level ≤ 3)
- **Content-Type:** `multipart/form-data`
- **Request Body:** Same as Create (all fields are optional).

### 2.5 Delete a Communication Log
- **URL:** `DELETE /clients/:clientId/comms/:logId`
- **Access:** `MANAGER` or higher (Role Level ≤ 3)
