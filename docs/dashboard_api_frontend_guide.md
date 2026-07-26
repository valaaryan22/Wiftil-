# Dashboard API - Frontend Integration Guide

This document outlines how to consume the new `Dashboard` APIs from the React frontend. These APIs are designed to power a GitHub-style personalized dashboard, providing the authenticated user with a unified view of all their tasks, subtasks, dockets, tickets, leave requests, notifications, and performance ratings.

## 1. General Principles

### 1.1 Base URL & Authentication
- **Base Route:** `/api/v1/dashboard`
- **Authentication:** All routes require a valid JWT token. Include it in the `Authorization` header: `Authorization: Bearer <your_jwt_token>`.
- **User Scoping:** You do **not** need to pass the `userId` in the URL or payload. The backend automatically extracts the `userId` from the JWT token and scopes all data exclusively to the logged-in user.

### 1.2 Common Response Format
The backend uses a standard response wrapper.

**Standard Success Response:**
```json
{
  "success": true,
  "message": "String message",
  "data": { ... } 
}
```

**Paginated Response:**
Paginated endpoints return an array of items inside `data`, along with a `meta` object containing pagination details.
```json
{
  "success": true,
  "message": "Fetched successfully",
  "data": [ ... ], // Array of items
  "meta": {
    "total": 45,           // Total number of items across all pages
    "page": 1,             // Current page
    "limit": 20,           // Items per page
    "totalPages": 3,       // Total pages available
    "hasNextPage": true,   // Boolean: is there a next page?
    "hasPrevPage": false   // Boolean: is there a previous page?
  }
}
```

### 1.3 Common Query Parameters for Paginated Endpoints
All paginated endpoints accept the following common query parameters:
- `page` (default: `1`)
- `limit` (default: `20`, max: `100`)
- `search` (optional): Searches relevant fields (usually `title` or `code`).

---

## 2. API Endpoints Overview

### 2.1 Get Dashboard Summary
Provides high-level counts and stats across all domains. Ideal for a top-level widget or summary cards.

- **Endpoint:** `GET /api/v1/dashboard/summary`
- **Query Params:** None
- **Response Structure:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "tasks": { "total": 12, "byStatus": { "ASSIGNED": 3, "IN_PROGRESS": 5 }, "overdue": 1 },
      "subtasks": { "total": 8, "byStatus": { "AVAILABLE": 2, "IN_PROGRESS": 4 }, "overdue": 0 },
      "dockets": { "total": 3, "byStatus": { "ACTIVE": 2, "ON_HOLD": 1 } },
      "tickets": { "total": 5, "byStatus": { "OPEN": 2, "IN_PROGRESS": 3 } },
      "leaves": { "total": 2, "pending": 1 },
      "notifications": { "unread": 4 },
      "performance": { "totalRatings": 6, "avgOverall": 7.8 }
    }
  }
}
```

### 2.2 Get Tasks (My Tasks)
Fetches tasks where the user is assigned as a **Team Lead** or is the **Manager**.

- **Endpoint:** `GET /api/v1/dashboard/tasks`
- **Query Params:**
  - `page`, `limit`
  - `status`: Filter by status (e.g., `IN_PROGRESS`, `SUBMITTED`, `COMPLETED`)
  - `priority`: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`
  - `role`: Filter by your role on the task: `assignee` (Team Lead) or `manager`. Omit to get both.
  - `search`: Searches the task `title`.
- **Key Data Included:** `createdBy`, `manager`, `assignments[]` (with `teamLead`), `docket`.

### 2.3 Get Subtasks (My Subtasks)
Fetches subtasks where the user is an assigned **Member**.

- **Endpoint:** `GET /api/v1/dashboard/subtasks`
- **Query Params:**
  - `page`, `limit`
  - `status`, `priority`, `search`
- **Key Data Included:** `task`, `docket`, `createdBy`, and **`myContribution`** (your specific percentage contribution to this subtask).

### 2.4 Get Dockets (My Managed Dockets)
Fetches dockets where the user is listed as a **Manager** (`PRIMARY`, `SECONDARY`, or `REVIEWER`).

- **Endpoint:** `GET /api/v1/dashboard/dockets`
- **Query Params:**
  - `page`, `limit`
  - `status`: `DRAFT`, `PUBLISHED`, `ACTIVE`, `ON_HOLD`, `COMPLETED`, `CANCELLED`
  - `docketType`: `RETAINER`, `PROJECT`, `AD_HOC`, `INTERNAL`
  - `search`: Searches `title` or `docketCode`.
- **Key Data Included:** `client`, `createdBy`, `managers[]`, and **`myRole`** (your specific manager role on the docket).

### 2.5 Get Tickets (Assigned to Me)
Fetches docket tickets specifically assigned to the user.

- **Endpoint:** `GET /api/v1/dashboard/tickets`
- **Query Params:**
  - `page`, `limit`
  - `status`: `OPEN`, `IN_PROGRESS`, `PENDING_APPROVAL`, `RESOLVED`, `CLOSED`, `REJECTED`
  - `priority`: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`
  - `ticketType`: `SERVICE_DELIVERY`, `ADD_ON_REQUEST`, `BUG`, `CHANGE_REQUEST`, `APPROVAL`
  - `search`: Searches `title` or `ticketCode`.
- **Key Data Included:** `docket`, `reportedBy`, `assignedTo`.

### 2.6 Get Leaves (My Leaves)
Fetches the user's own leave requests.

- **Endpoint:** `GET /api/v1/dashboard/leaves`
- **Query Params:**
  - `page`, `limit`
  - `status`: `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`
  - `leaveType`: `ANNUAL`, `SICK`, `UNPAID`, `EMERGENCY`, `MATERNITY`, `PATERNITY`
- **Key Data Included:** Basic leave details + `reviewer` name.

### 2.7 Get Notifications
Fetches the user's notifications.

- **Endpoint:** `GET /api/v1/dashboard/notifications`
- **Query Params:**
  - `page`, `limit`
  - `isRead`: `true` or `false` (e.g., pass `?isRead=false` to get only unread notifications).

### 2.8 Get Performance Ratings
Fetches ratings received by the user. Uniquely, this returns both a paginated list AND an overall summary across all your ratings.

- **Endpoint:** `GET /api/v1/dashboard/performance`
- **Query Params:**
  - `page`, `limit`
  - `ratingType`: `SUBTASK` or `DIRECT`
- **Response Structure:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalRatings": 6,
      "avgOverall": 7.8,
      "avgQuality": 8.0,
      "avgTimeliness": 7.5,
      "avgCommunication": 8.2,
      "avgAccuracy": 7.8,
      "avgOwnership": 7.6
    },
    "ratings": [ ... ] // Paginated array of ratings
  },
  "meta": { "total": 6, "page": 1, "limit": 20, ... }
}
```

### 2.9 Get Activity Feed
A combined feed of recent tasks, subtasks, and tickets, sorted together by their `updatedAt` date in descending order. Excellent for a "Recent Activity" timeline.

- **Endpoint:** `GET /api/v1/dashboard/activity`
- **Query Params:** `page`, `limit`
- **Data Structure:** Each item in the array will have a `_type` field.
  - `_type: "TASK"`
  - `_type: "SUBTASK"`
  - `_type: "TICKET"`
  
  Use this `_type` field in React to determine which UI component to render for the feed item.

---

## 3. Implementation Suggestions for React

1. **Dashboard Entry Point (`/summary`)**
   - On the main dashboard page load, fire a request to `/dashboard/summary`.
   - Use this data to populate badge counts (e.g., "5 In-Progress Tasks", "4 Unread Notifications").
2. **Dedicated Tabs / Sections**
   - For specific sections (e.g., a "My Tasks" tab), call `/dashboard/tasks`.
   - Utilize the `meta` object from the response to power your pagination controls (Next/Prev buttons using `hasNextPage` / `hasPrevPage`).
3. **Activity Timeline**
   - Use the `/dashboard/activity` endpoint to render a vertical timeline. Since it returns heterogeneous data (Tasks, Subtasks, Tickets), create a switch statement or polymorphic component in React based on the `_type` field.
4. **Caching / SWR / React Query**
   - These APIs are highly suitable for caching libraries like `SWR` or `React Query` to keep the UI snappy when navigating between dashboard tabs.
