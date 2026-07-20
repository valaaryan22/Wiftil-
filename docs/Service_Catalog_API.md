# Service Catalog API Documentation

This document outlines the API endpoints available for the **Service Catalog** module. It is intended for Frontend Developers to understand the available endpoints, required payload fields, data types, and expected responses.

## Base URL
`/api/v1/services`

---

## 1. Get All Services
Retrieves a list of all services in the catalog.

- **URL:** `/`
- **Method:** `GET`
- **Authentication:** Required (Any authenticated user)
- **Query Parameters (Optional):**
  - `isActive` (boolean): Pass `true` or `false` to filter by active/inactive services.
- **Success Response:**
  - **Code:** 200 OK
  - **Content:**
    ```json
    {
      "success": true,
      "data": [
        {
          "id": "uuid-string",
          "name": "Service Name",
          "category": "DESIGN",
          "description": "Optional description...",
          "unit": "per month",
          "defaultPrice": "500.00",
          "isActive": true,
          "createdById": "user-uuid",
          "createdAt": "2026-07-20T10:00:00.000Z",
          "updatedAt": "2026-07-20T10:00:00.000Z"
        }
      ]
    }
    ```

---

## 2. Get Service By ID
Retrieves the details of a single service.

- **URL:** `/:id`
- **Method:** `GET`
- **Authentication:** Required (Any authenticated user)
- **URL Parameters:**
  - `id` (string, UUID) - Required. The UUID of the service.
- **Success Response:**
  - **Code:** 200 OK
  - **Content:**
    ```json
    {
      "success": true,
      "data": {
        "id": "uuid-string",
        "name": "Service Name",
        "category": "DESIGN",
        "description": "Optional description...",
        "unit": "per month",
        "defaultPrice": "500.00",
        "isActive": true,
        "createdById": "user-uuid"
      }
    }
    ```
- **Error Responses:**
  - **Code:** 404 Not Found (If service UUID is incorrect)

---

## 3. Create a New Service
Creates a new service in the catalog.

- **URL:** `/`
- **Method:** `POST`
- **Authentication:** Required (**MANAGER** role level or above)
- **Payload (JSON):**
  | Field          | Type    | Required | Description |
  | -------------- | ------- | -------- | ----------- |
  | `name`         | string  | **Yes**  | Name of the service. Cannot be empty. |
  | `category`     | string  | **Yes**  | Must be one of: `DESIGN`, `MARKETING`, `ADVERTISING`, `TECHNICAL`, `CONTENT`, `OTHER` |
  | `description`  | string  | No       | Detailed description of the service. |
  | `unit`         | string  | No       | Unit of measurement (e.g., `per video`, `per campaign`, `per month`). |
  | `defaultPrice` | decimal | No       | The standard price for the service (e.g., `100.50`). |

- **Success Response:**
  - **Code:** 201 Created
  - **Content:**
    ```json
    {
      "success": true,
      "message": "Service created",
      "data": {
        "id": "new-uuid",
        "name": "Service Name",
        "category": "DESIGN",
        "isActive": true,
        "createdById": "user-uuid"
      }
    }
    ```
- **Error Responses:**
  - **Code:** 400 Bad Request (Validation Error for missing or incorrect fields)
  - **Code:** 403 Forbidden (Insufficient role level)

---

## 4. Update an Existing Service
Updates details of an existing service.

- **URL:** `/:id`
- **Method:** `PATCH`
- **Authentication:** Required (**MANAGER** role level or above)
- **URL Parameters:**
  - `id` (string, UUID) - Required. The UUID of the service to update.
- **Payload (JSON):**
  *All fields are optional when updating. Only provide fields that need to be changed.*
  | Field          | Type    | Description |
  | -------------- | ------- | ----------- |
  | `name`         | string  | Name of the service. Cannot be empty if provided. |
  | `category`     | string  | Must be one of: `DESIGN`, `MARKETING`, `ADVERTISING`, `TECHNICAL`, `CONTENT`, `OTHER` |
  | `description`  | string  | Detailed description of the service. |
  | `unit`         | string  | Unit of measurement. |
  | `defaultPrice` | decimal | The standard price for the service. |

- **Success Response:**
  - **Code:** 200 OK
  - **Content:**
    ```json
    {
      "success": true,
      "message": "Service updated",
      "data": {
        // Updated service object
      }
    }
    ```

---

## 5. Delete (Deactivate) a Service
Soft-deletes or deactivates a service. It will no longer be available for new packages but retains historical data.

- **URL:** `/:id`
- **Method:** `DELETE`
- **Authentication:** Required (**MANAGER** role level or above)
- **URL Parameters:**
  - `id` (string, UUID) - Required. The UUID of the service to deactivate.
- **Success Response:**
  - **Code:** 200 OK
  - **Content:**
    ```json
    {
      "success": true,
      "message": "Service deactivated"
    }
    ```

---

## Frontend Types (TypeScript)
For the frontend developers, here is the suggested TypeScript interface for the Service Catalog object to ensure type safety:

```typescript
export type ServiceCategory = 'DESIGN' | 'MARKETING' | 'ADVERTISING' | 'TECHNICAL' | 'CONTENT' | 'OTHER';

export interface IServiceCatalog {
  id: string; // UUID
  name: string;
  category: ServiceCategory;
  description?: string | null;
  unit?: string | null; // e.g. "per month", "per campaign"
  defaultPrice?: number | string | null; // Decimal/Numeric string
  isActive: boolean;
  createdById: string; // UUID of the user who created it
  createdAt: string; // ISO Date String
  updatedAt: string; // ISO Date String
}

// Example payload for creating a service
export type CreateServicePayload = Pick<IServiceCatalog, 'name' | 'category'> & Partial<Pick<IServiceCatalog, 'description' | 'unit' | 'defaultPrice'>>;
```
