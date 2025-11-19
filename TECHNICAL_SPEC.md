# NeoColmado Search Service - Technical Specification

## Document Purpose

This document provides comprehensive technical documentation for the NeoColmado Search Gateway microservice. It is designed to give AI assistants and developers complete context about the service architecture, implementation details, and operational procedures.

---

## Table of Contents

1. [Service Overview](#service-overview)
2. [Architecture](#architecture)
3. [File Structure](#file-structure)
4. [Core Components](#core-components)
5. [Data Flow](#data-flow)
6. [API Specification](#api-specification)
7. [Configuration](#configuration)
8. [Deployment](#deployment)
9. [Troubleshooting](#troubleshooting)
10. [Development Guide](#development-guide)

---

## Service Overview

### What This Service Does

The NeoColmado Search Gateway is a **standalone microservice** that provides intelligent product search with automatic local→global inventory fallback for the NeoColmado ecosystem.

**Primary Function:**
- Receives product search queries for a specific store (colmado)
- Searches first in the store's local inventory index
- If no results found, falls back to the global master inventory
- Returns unified results with source indication

**Why It Exists:**
- Centralizes search logic that was previously scattered across n8n workflows
- Provides consistent search behavior for web, WhatsApp, and future channels
- Enables store owners to operate without a complete local inventory
- Automatically builds local inventory as products are used

### Technical Stack

```
Runtime:     Node.js 20 LTS (Alpine Linux)
Framework:   Express.js 4.18.2
Database:    Meilisearch (external service)
Client:      meilisearch 0.38.0
Logging:     Winston 3.11.0
Validation:  express-validator 7.0.1
Security:    Helmet.js 7.1.0
Container:   Docker (multi-stage build)
Deployment:  Dokploy (Docker Compose)
Repository:  https://github.com/juniorspy/search-service
```

### Integration Context

This service is part of the larger NeoColmado ecosystem:

```
┌─────────────────────────────────────────────────────┐
│                NeoColmado Ecosystem                 │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Web Client (neo_chat.js)                          │
│       ↓                                             │
│  Firebase RTDB (/mensajes)                         │
│       ↓                                             │
│  Cloud Functions (chatRouterWorker)                │
│       ↓                                             │
│  n8n Workflow                                       │
│       ↓                                             │
│  [THIS SERVICE] Search Gateway  ←── Meilisearch    │
│       ↓                                             │
│  Returns results to n8n                            │
│       ↓                                             │
│  n8n writes to Firebase (/respuestas)              │
│       ↓                                             │
│  Client displays results                           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Key Point:** This service does NOT talk directly to clients. It's called by n8n workflows as part of the chatbot's product search logic.

---

## Architecture

### High-Level Architecture

```
┌──────────────────────────────────────────────────────┐
│              Express.js Application                  │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │   Routes    │→ │ Controllers  │→ │ Services  │  │
│  │             │  │              │  │           │  │
│  │ /api/v1/    │  │ searchCtrl   │  │ searchSvc │  │
│  │  search     │  │ healthCtrl   │  │           │  │
│  │  health     │  │              │  │           │  │
│  └─────────────┘  └──────────────┘  └─────┬─────┘  │
│                                            │        │
│  ┌─────────────┐  ┌──────────────┐        │        │
│  │ Middleware  │  │    Config    │        │        │
│  │             │  │              │        │        │
│  │ Validator   │  │ Logger       │←───────┘        │
│  │ ErrorHandler│  │ Meilisearch  │                 │
│  └─────────────┘  └──────────────┘                 │
│                                                      │
└──────────────────────────────────────────────────────┘
                        ↓
              ┌──────────────────┐
              │   Meilisearch    │
              │   External DB    │
              └──────────────────┘
```

### Request Flow

```
1. POST /api/v1/search
   ↓
2. Express receives request
   ↓
3. Middleware: Validation (express-validator)
   ↓
4. Controller: searchController.search()
   ↓
5. Service: searchService.searchWithFallback()
   ↓
6. Meilisearch: Query local index (productos_colmado_{slug})
   ↓
7. If hits > 0: Return local results
   ↓
8. If hits = 0: Query global index (colmado_inventory)
   ↓
9. Return global results
   ↓
10. Controller wraps in success response
   ↓
11. Client receives JSON
```

### Fallback Logic (Critical Business Rule)

```javascript
// Pseudocode
async function searchWithFallback(query, slug) {
  const localIndex = `productos_colmado_${slug}`;

  // Step 1: Try local index
  try {
    const localResults = await meilisearch.index(localIndex).search(query);

    if (localResults.hits.length > 0) {
      return {
        source: "local",
        hits: localResults.hits,
        // Local prices are authoritative
      };
    }
  } catch (error) {
    // Index doesn't exist or error → proceed to global
    log.warn("Local index failed, falling back");
  }

  // Step 2: Fallback to global
  const globalResults = await meilisearch.index("colmado_inventory").search(query);

  return {
    source: "global",
    hits: globalResults.hits,
    // Global prices are suggestions only
  };
}
```

**Important Rules:**
1. **Always try local first** - Local inventory has priority
2. **Never fail on missing local index** - Silently fall back to global
3. **Source indication is critical** - Caller needs to know if prices are local or global
4. **No price modification** - This service returns data as-is from Meilisearch

---

## File Structure

```
search-service/
│
├── src/
│   ├── config/
│   │   ├── logger.js              # Winston logger configuration
│   │   └── meilisearch.js         # Meilisearch client singleton
│   │
│   ├── controllers/
│   │   └── searchController.js    # HTTP request handlers
│   │
│   ├── services/
│   │   └── searchService.js       # Business logic layer
│   │
│   ├── middleware/
│   │   ├── errorHandler.js        # Global error handling
│   │   └── validator.js           # Request validation rules
│   │
│   ├── routes/
│   │   └── index.js               # Route definitions
│   │
│   └── server.js                  # Application entry point
│
├── .env.example                    # Environment template
├── .env                            # Local environment (git-ignored)
├── .gitignore
├── .dockerignore
│
├── Dockerfile                      # Multi-stage production build
├── docker-compose.yml              # Container orchestration
├── dokploy.json                    # Dokploy configuration
│
├── package.json                    # Dependencies & scripts
├── package-lock.json               # Locked dependencies (required for Docker)
│
├── README.md                       # User-facing documentation
├── DEPLOYMENT.md                   # Deployment guide
└── TECHNICAL_SPEC.md              # This file
```

---

## Core Components

### 1. `src/server.js` - Application Entry Point

**Purpose:** Bootstraps the Express application, sets up middleware, and starts the HTTP server.

**Key Responsibilities:**
- Load environment variables
- Initialize Express app
- Configure security headers (Helmet)
- Set up CORS
- Mount routes
- Start HTTP server on configured port
- Handle graceful shutdown signals (SIGTERM, SIGINT)

**Code Highlights:**

```javascript
// Graceful shutdown
process.on('SIGTERM', () => {
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});
```

**Why This Matters:** Proper shutdown ensures ongoing requests complete before the container stops.

---

### 2. `src/config/meilisearch.js` - Meilisearch Client

**Purpose:** Creates and exports a configured Meilisearch client singleton.

**Configuration:**
- Host: From `MEILISEARCH_HOST` env var
- API Key: From `MEILISEARCH_API_KEY` env var
- Timeout: From `REQUEST_TIMEOUT` env var (default: 5000ms)

**Critical Detail:**
```javascript
const client = new MeiliSearch({
  host,
  apiKey,
  timeout: parseInt(process.env.REQUEST_TIMEOUT) || 5000,
});
```

**Error Handling:** Throws immediately if `MEILISEARCH_API_KEY` is missing. Service won't start without it.

**Singleton Pattern:** Only one client instance is created, shared across all requests.

---

### 3. `src/config/logger.js` - Winston Logger

**Purpose:** Centralized logging with structured output.

**Log Format:**
```json
{
  "level": "info",
  "message": "Search request",
  "timestamp": "2025-01-19 10:30:00",
  "service": "search-service",
  "query": "arroz",
  "slug": "colmado_william"
}
```

**Log Levels:**
- `error`: Service failures, exceptions
- `warn`: Fallback triggers, missing indices
- `info`: Request/response logging
- `debug`: Detailed Meilisearch responses

**Configuration:** Controlled by `LOG_LEVEL` env var (default: `info`).

---

### 4. `src/services/searchService.js` - Business Logic

**Purpose:** Core search logic with local→global fallback.

#### Function: `searchWithFallback(query, slug, limit, offset)`

**Parameters:**
- `query` (string): Search text (e.g., "arroz")
- `slug` (string): Store identifier (e.g., "colmado_william")
- `limit` (number): Max results (default: 20)
- `offset` (number): Pagination offset (default: 0)

**Returns:**
```javascript
{
  source: "local" | "global",
  indexName: "productos_colmado_colmado_william" | "colmado_inventory",
  hits: [...],  // Array of product objects
  total: 3,     // Total results found
  query: "arroz",
  limit: 20,
  offset: 0,
  processingTimeMs: 12  // Meilisearch processing time
}
```

**Error Handling:**
- Local index not found → Logs warning, proceeds to global
- Global index fails → Throws error (caught by controller)
- Network errors → Propagates to error handler

**Performance:** Typical response time < 50ms for cached queries.

#### Function: `healthCheck()`

**Purpose:** Verify Meilisearch connectivity.

**Returns:**
```javascript
{
  status: "healthy" | "unhealthy",
  meilisearch: {
    status: "available"
  },
  error: "..." // Only if unhealthy
}
```

---

### 5. `src/controllers/searchController.js` - Request Handlers

**Purpose:** HTTP layer that bridges Express and business logic.

#### Function: `search(req, res, next)`

**Steps:**
1. Extract validated params from `req.body`
2. Call `searchService.searchWithFallback()`
3. Wrap result in success envelope
4. Send JSON response

**Response Format:**
```javascript
{
  success: true,
  data: {
    source: "local",
    hits: [...],
    total: 3
  }
}
```

**Error Handling:** Uses `next(error)` to delegate to error middleware.

#### Function: `health(req, res)`

**Purpose:** Health check endpoint for monitoring.

**Response Codes:**
- `200 OK`: Meilisearch is reachable
- `503 Service Unavailable`: Meilisearch is down

---

### 6. `src/middleware/validator.js` - Request Validation

**Purpose:** Validate incoming requests before processing.

**Validation Rules:**

```javascript
searchValidationRules() {
  return [
    body('query')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Query is required'),

    body('slug')
      .isString()
      .trim()
      .notEmpty()
      .matches(/^[a-z0-9_-]+$/)
      .withMessage('Slug must be lowercase alphanumeric'),

    body('limit')
      .optional()
      .isInt({ min: 1, max: 100 }),

    body('offset')
      .optional()
      .isInt({ min: 0 })
  ];
}
```

**Error Response:**
```json
{
  "success": false,
  "errors": [
    {
      "field": "slug",
      "message": "Slug must be lowercase alphanumeric"
    }
  ]
}
```

---

### 7. `src/middleware/errorHandler.js` - Error Management

**Purpose:** Centralized error handling for all routes.

**Functions:**

#### `errorHandler(err, req, res, next)`
- Logs error with Winston
- Returns appropriate HTTP status code
- Hides stack traces in production

#### `notFoundHandler(req, res)`
- Handles 404 errors for undefined routes
- Logs route misses

---

### 8. `src/routes/index.js` - Route Definitions

**Purpose:** Maps HTTP endpoints to controllers.

**Routes:**

```javascript
POST   /api/v1/search   → searchController.search
GET    /api/v1/health   → searchController.health
```

**Middleware Chain:**

```
Request → Validation → Controller → Service → Response
          ↓ (if fails)
          Error Handler
```

---

## Data Flow

### Example: Successful Local Search

```
1. Client Request:
   POST /api/v1/search
   {
     "query": "arroz",
     "slug": "colmado_william",
     "limit": 10
   }

2. Validation Middleware:
   ✅ query is non-empty string
   ✅ slug matches pattern
   ✅ limit is 1-100

3. Controller:
   searchController.search() called

4. Service Layer:
   searchService.searchWithFallback("arroz", "colmado_william", 10, 0)

5. Meilisearch Query:
   Index: productos_colmado_colmado_william
   Query: "arroz"
   Result: 2 hits found

6. Service Returns:
   {
     source: "local",
     indexName: "productos_colmado_colmado_william",
     hits: [
       { id: 1, nombre: "Arroz Graneado", precio: 45 },
       { id: 2, nombre: "Arroz Campo", precio: 60 }
     ],
     total: 2,
     processingTimeMs: 8
   }

7. Controller Wraps:
   {
     success: true,
     data: { ...service result }
   }

8. Response:
   HTTP 200 OK
   Content-Type: application/json
```

### Example: Global Fallback

```
1. Client Request:
   POST /api/v1/search
   {
     "query": "detergente ace",
     "slug": "colmado_nuevo"
   }

2. Service Layer:
   Tries: productos_colmado_colmado_nuevo
   Result: Index not found or 0 hits

3. Logger:
   WARN: Local index search failed, falling back to global

4. Meilisearch Query (Fallback):
   Index: colmado_inventory
   Query: "detergente ace"
   Result: 1 hit found

5. Service Returns:
   {
     source: "global",  // ← Important!
     indexName: "colmado_inventory",
     hits: [
       { id: 456, nombre: "Detergente Ace", precio: 120 }
     ],
     total: 1
   }

6. Client Receives:
   - Knows product exists globally
   - Can create validation.required=true flag
   - Store owner will confirm price
```

---

## API Specification

### POST /api/v1/search

**Description:** Search for products with local→global fallback.

**Request:**

```http
POST /api/v1/search HTTP/1.1
Host: search.neocolmado.com
Content-Type: application/json

{
  "query": "arroz",
  "slug": "colmado_william",
  "limit": 20,
  "offset": 0
}
```

**Request Body Schema:**

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| query | string | Yes | Non-empty | Search text |
| slug | string | Yes | `^[a-z0-9_-]+$` | Store identifier |
| limit | integer | No | 1-100 | Max results (default: 20) |
| offset | integer | No | ≥ 0 | Pagination offset (default: 0) |

**Success Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "source": "local",
    "indexName": "productos_colmado_colmado_william",
    "hits": [
      {
        "id": 14126,
        "nombre": "Arroz Detallado",
        "descripcion": "",
        "categoria": "Cocina",
        "tags": "Arroz",
        "precio": "45",
        "image_url": "https://..."
      }
    ],
    "total": 3,
    "query": "arroz",
    "limit": 20,
    "offset": 0,
    "processingTimeMs": 12
  }
}
```

**Error Response (400 Bad Request):**

```json
{
  "success": false,
  "errors": [
    {
      "field": "query",
      "message": "Query is required and must be a non-empty string"
    }
  ]
}
```

**Error Response (500 Internal Server Error):**

```json
{
  "success": false,
  "error": {
    "message": "Internal server error"
  }
}
```

---

### GET /api/v1/health

**Description:** Health check endpoint for monitoring and load balancers.

**Request:**

```http
GET /api/v1/health HTTP/1.1
Host: search.neocolmado.com
```

**Success Response (200 OK):**

```json
{
  "success": true,
  "service": "search-service",
  "status": "healthy",
  "meilisearch": {
    "status": "available"
  },
  "timestamp": "2025-01-19T10:30:00.000Z"
}
```

**Failure Response (503 Service Unavailable):**

```json
{
  "success": false,
  "service": "search-service",
  "status": "unhealthy",
  "error": "Connection to Meilisearch failed",
  "timestamp": "2025-01-19T10:30:00.000Z"
}
```

**Use Cases:**
- Docker health checks
- Dokploy monitoring
- Load balancer health probes
- Uptime monitoring (Uptime Kuma, etc.)

---

## Configuration

### Environment Variables

All configuration is done through environment variables. No hardcoded values.

#### Required Variables

```bash
# Meilisearch Connection
MEILISEARCH_HOST=https://melisearch.onrpa.com
MEILISEARCH_API_KEY=lsT73ukYM4YV+5/mYoI/CrsoyWf2pucWeLepowtwIXI=
```

#### Optional Variables (Have Defaults)

```bash
# Server
PORT=3000                          # HTTP port (default: 3000)
NODE_ENV=production                # Environment (default: development)

# Search Configuration
GLOBAL_INDEX=colmado_inventory     # Global index name
LOCAL_INDEX_PREFIX=productos_colmado_  # Prefix for local indices

# Logging
LOG_LEVEL=info                     # winston log level (default: info)

# Performance
REQUEST_TIMEOUT=5000               # Meilisearch timeout in ms (default: 5000)
```

#### Environment-Specific Configurations

**Development (.env):**
```bash
NODE_ENV=development
LOG_LEVEL=debug
MEILISEARCH_HOST=http://localhost:7700  # Optional local instance
```

**Production (Dokploy):**
```bash
NODE_ENV=production
LOG_LEVEL=info
MEILISEARCH_HOST=https://melisearch.onrpa.com
```

**Testing:**
```bash
NODE_ENV=test
LOG_LEVEL=error
MEILISEARCH_HOST=http://test-meilisearch:7700
```

---

### Meilisearch Index Configuration

#### Global Index: `colmado_inventory`

**Purpose:** Master product catalog shared across all stores.

**Data Structure:**
```json
{
  "id": 14126,
  "nombre": "Arroz Detallado",
  "descripcion": "",
  "categoria": "Cocina",
  "tags": "Arroz",
  "precio": "45",
  "image_url": "https://...",
  "unidad": "libra"
}
```

**Search Configuration:**
- Searchable attributes: `nombre`, `tags`, `categoria`, `descripcion`
- Filterable attributes: `categoria`, `tags`
- Sortable attributes: `precio`

#### Local Indices: `productos_colmado_{slug}`

**Naming Pattern:** `productos_colmado_` + store slug

**Examples:**
- `productos_colmado_colmado_william`
- `productos_colmado_la_esquina`
- `productos_colmado_dona_maria`

**Data Structure:** Same as global index, but with **local prices** that override global.

**Lifecycle:**
- Created on-demand by backoffice when store owner adds products
- Grows organically as products are validated from global catalog
- May be empty for new stores → Falls back to global

---

## Deployment

### Docker Build Process

The Dockerfile uses a **multi-stage build** for optimization:

#### Stage 1: Builder (Dependencies)

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
```

**Purpose:** Install production dependencies in a clean environment.

#### Stage 2: Production Image

```dockerfile
FROM node:20-alpine
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy dependencies from builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy application code
COPY --chown=nodejs:nodejs src ./src
COPY --chown=nodejs:nodejs package*.json ./

USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/v1/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["npm", "start"]
```

**Security Features:**
- Non-root user (`nodejs:nodejs`)
- Minimal base image (Alpine Linux)
- No unnecessary tools or packages
- Read-only application code

**Size Optimization:**
- Multi-stage build discards build dependencies
- `.dockerignore` excludes unnecessary files
- Alpine Linux base (< 50MB)

**Final Image Size:** ~150MB

---

### Dokploy Deployment

#### Configuration File: `docker-compose.yml`

```yaml
version: '3.8'

services:
  search-service:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: search-service
    expose:
      - "3000"  # Internal port only
    environment:
      - NODE_ENV=production
      - PORT=3000
      - MEILISEARCH_HOST=${MEILISEARCH_HOST}
      - MEILISEARCH_API_KEY=${MEILISEARCH_API_KEY}
      - GLOBAL_INDEX=${GLOBAL_INDEX:-colmado_inventory}
      - LOCAL_INDEX_PREFIX=${LOCAL_INDEX_PREFIX:-productos_colmado_}
      - LOG_LEVEL=${LOG_LEVEL:-info}
      - REQUEST_TIMEOUT=${REQUEST_TIMEOUT:-5000}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/api/v1/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
```

**Key Points:**
- Uses `expose` instead of `ports` (Dokploy handles routing)
- Environment variables injected by Dokploy
- Health check ensures container is ready before routing traffic
- Restart policy handles transient failures

#### Deployment Steps

1. **GitHub Push Triggers Webhook**
   ```
   git push origin master
   → Dokploy detects change
   → Triggers rebuild
   ```

2. **Dokploy Build Process**
   ```
   Clone repo → Build Docker image → Stop old container → Start new container
   ```

3. **Health Check**
   ```
   Dokploy waits for health check to pass before routing traffic
   ```

4. **Proxy Configuration**
   ```
   Dokploy Traefik routes domain → Container port 3000
   ```

#### Current Deployment

- **Repository:** https://github.com/juniorspy/search-service
- **Dokploy Project:** Neo apps
- **Service Name:** Search-service
- **Domain:** (configured in Dokploy)
- **Container:** `neo-apps-searchservice-bglzht`

---

## Troubleshooting

### Common Issues and Solutions

#### 1. "port is already allocated"

**Symptom:** Docker fails to start with port binding error.

**Cause:** Another container is using port 3000 on the host.

**Solution:** Remove `ports` mapping from `docker-compose.yml`, use `expose` only. Dokploy handles external routing.

#### 2. "npm ci can only install with an existing package-lock.json"

**Symptom:** Docker build fails at `npm ci` step.

**Cause:** `package-lock.json` is missing or in `.gitignore`.

**Solution:** Ensure `package-lock.json` is committed to the repository.

#### 3. Health Check Failing

**Symptom:** Container starts but Dokploy marks it as unhealthy.

**Cause:** Health check endpoint is incorrect or Meilisearch is unreachable.

**Debug Steps:**
```bash
# Check logs
docker logs search-service

# Test health endpoint manually
docker exec search-service node -e "require('http').get('http://localhost:3000/api/v1/health', (r) => console.log(r.statusCode))"
```

**Solution:** Verify `MEILISEARCH_HOST` and `MEILISEARCH_API_KEY` are correct.

#### 4. "MEILISEARCH_API_KEY is not defined"

**Symptom:** Service crashes on startup with this error.

**Cause:** Environment variable not set in Dokploy.

**Solution:** Add `MEILISEARCH_API_KEY` in Dokploy Environment Variables section.

#### 5. Search Returns Empty Results (Unexpected)

**Symptom:** Known products don't appear in search results.

**Debug Steps:**
```bash
# Check if index exists
curl https://melisearch.onrpa.com/indexes \
  -H "Authorization: Bearer YOUR_API_KEY"

# Test search directly in Meilisearch
curl https://melisearch.onrpa.com/indexes/colmado_inventory/search \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"q": "arroz"}'
```

**Possible Causes:**
- Index doesn't exist in Meilisearch
- API key doesn't have read permissions
- Product data not yet indexed

#### 6. "Route not found" for /health

**Symptom:** `/health` returns 404.

**Cause:** Endpoint is at `/api/v1/health`, not `/health`.

**Solution:** Use correct path: `GET /api/v1/health`

---

### Debugging Techniques

#### 1. Check Logs in Real-Time

**Dokploy:**
```
Dashboard → Service → Logs tab → Container Logs
```

**Docker CLI:**
```bash
docker logs -f search-service
```

#### 2. Inspect Environment Variables

```bash
docker exec search-service env | grep MEILISEARCH
```

#### 3. Test Meilisearch Connectivity from Container

```bash
docker exec -it search-service sh
apk add curl
curl $MEILISEARCH_HOST/health
```

#### 4. Increase Log Level

**In Dokploy:**
```
Environment Variables → LOG_LEVEL=debug → Redeploy
```

**In .env (local):**
```bash
LOG_LEVEL=debug
npm start
```

#### 5. Test Endpoints with cURL

**Health Check:**
```bash
curl https://your-domain.com/api/v1/health
```

**Search:**
```bash
curl -X POST https://your-domain.com/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query":"arroz","slug":"colmado_william"}'
```

---

## Development Guide

### Setting Up Local Development

#### Prerequisites

- Node.js 20+ installed
- Access to Meilisearch instance (local or remote)
- Git

#### Steps

1. **Clone Repository:**
   ```bash
   git clone https://github.com/juniorspy/search-service.git
   cd search-service
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your Meilisearch credentials
   ```

4. **Start Development Server:**
   ```bash
   npm run dev
   ```

5. **Test Endpoints:**
   ```bash
   curl http://localhost:3000/api/v1/health
   ```

---

### Making Changes

#### Adding a New Endpoint

1. **Define Route** (`src/routes/index.js`):
   ```javascript
   router.get('/products/:id', productController.getById);
   ```

2. **Create Controller** (`src/controllers/productController.js`):
   ```javascript
   async function getById(req, res, next) {
     try {
       const product = await productService.findById(req.params.id);
       res.json({ success: true, data: product });
     } catch (error) {
       next(error);
     }
   }
   ```

3. **Implement Service** (`src/services/productService.js`):
   ```javascript
   async function findById(id) {
     const index = meilisearchClient.index('colmado_inventory');
     return await index.getDocument(id);
   }
   ```

4. **Test Locally:**
   ```bash
   curl http://localhost:3000/api/v1/products/123
   ```

5. **Commit and Push:**
   ```bash
   git add .
   git commit -m "Add: Get product by ID endpoint"
   git push origin master
   ```

#### Modifying Search Logic

**File:** `src/services/searchService.js`

**Example:** Add filtering by category

```javascript
async function searchWithFallback(query, slug, limit, offset, category) {
  const localIndexName = `${LOCAL_INDEX_PREFIX}${slug}`;

  const searchParams = {
    limit,
    offset,
  };

  // Add filter if category provided
  if (category) {
    searchParams.filter = `categoria = "${category}"`;
  }

  const localResults = await localIndex.search(query, searchParams);
  // ... rest of logic
}
```

**Update Controller:**
```javascript
const { query, slug, limit, offset, category } = req.body;
const result = await searchService.searchWithFallback(
  query, slug, limit, offset, category
);
```

**Update Validator:**
```javascript
body('category')
  .optional()
  .isString()
  .trim()
```

#### Testing Changes

**Unit Tests (Not Implemented Yet):**
```bash
npm test
```

**Manual Testing:**
```bash
# Test with category filter
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "arroz",
    "slug": "colmado_william",
    "category": "Cocina"
  }'
```

---

### Code Style Guidelines

**Formatting:**
- 2 spaces indentation
- Single quotes for strings
- Semicolons required
- Max line length: 100 characters

**Naming Conventions:**
- Files: camelCase (e.g., `searchService.js`)
- Functions: camelCase (e.g., `searchWithFallback`)
- Constants: UPPER_SNAKE_CASE (e.g., `GLOBAL_INDEX`)
- Classes: PascalCase (if needed)

**Error Handling:**
- Always use try/catch in async functions
- Pass errors to `next()` in controllers
- Log errors before throwing

**Logging:**
- Use structured logging with Winston
- Include relevant context (query, slug, etc.)
- Don't log sensitive data (API keys, passwords)

**Comments:**
- Use JSDoc for function documentation
- Explain "why", not "what"
- Keep comments up-to-date

---

### Git Workflow

**Branch Strategy:**
```
master  → Production-ready code (auto-deploys to Dokploy)
feature/* → New features
fix/* → Bug fixes
```

**Commit Message Format:**
```
Type: Brief description

Longer explanation if needed

Examples:
- Add: New search filter by category
- Fix: Handle missing Meilisearch index gracefully
- Update: Improve error messages for validation
- Docs: Add troubleshooting guide
```

**Pull Request Process:**
1. Create feature branch
2. Make changes
3. Test locally
4. Push and create PR
5. Review and merge to master
6. Auto-deploys to production

---

## Performance Considerations

### Response Times

**Typical Performance:**
- Local cache hit: < 20ms
- Local Meilisearch query: 20-50ms
- Global fallback: 30-80ms
- Network latency: 10-30ms

**Total Expected:** < 100ms for most queries

### Optimization Techniques

1. **Meilisearch is Pre-Optimized:**
   - In-memory index
   - Typo tolerance
   - Prefix search
   - No need for additional caching layer

2. **Connection Pooling:**
   - Meilisearch client reuses HTTP connections
   - No need for custom connection management

3. **Request Timeouts:**
   - Configurable via `REQUEST_TIMEOUT`
   - Prevents hanging requests

4. **Graceful Degradation:**
   - Local index failure → Falls back to global
   - Doesn't cascade failures

### Scalability

**Current Setup:**
- Single container instance
- Stateless service (no session storage)
- Horizontal scaling ready

**Scaling Strategy:**
- Add more container instances behind Dokploy proxy
- Meilisearch handles concurrent requests
- No code changes needed

---

## Security

### Current Security Measures

1. **Helmet.js:**
   - Sets security headers (X-Content-Type-Options, etc.)
   - Prevents common attacks (XSS, clickjacking)

2. **Input Validation:**
   - All inputs validated with express-validator
   - SQL injection not applicable (using Meilisearch)
   - No eval() or dangerous functions

3. **Authentication:**
   - API key required for Meilisearch (server-to-server)
   - No public API keys in client code

4. **Container Security:**
   - Non-root user
   - Minimal attack surface (Alpine Linux)
   - Read-only filesystem for app code

5. **Environment Variables:**
   - Secrets not committed to repo
   - Injected at runtime by Dokploy

### Security Recommendations

1. **Add Rate Limiting:**
   ```javascript
   const rateLimit = require('express-rate-limit');

   const limiter = rateLimit({
     windowMs: 1 * 60 * 1000, // 1 minute
     max: 60, // 60 requests per minute
   });

   app.use('/api/', limiter);
   ```

2. **Add Request Authentication:**
   ```javascript
   const apiKeyAuth = (req, res, next) => {
     const apiKey = req.headers['x-api-key'];
     if (apiKey !== process.env.API_KEY) {
       return res.status(401).json({ error: 'Unauthorized' });
     }
     next();
   };

   router.post('/search', apiKeyAuth, ...);
   ```

3. **Enable HTTPS Only:**
   - Handled by Dokploy proxy (Traefik)
   - Force HTTPS redirects in proxy config

---

## Monitoring and Observability

### Current Logging

**Winston Logs Include:**
- Timestamp
- Log level
- Message
- Contextual data (query, slug, etc.)
- Service identifier

**Log Aggregation:**
- Docker logs accessible via Dokploy
- Can be forwarded to external services (Loki, Datadog, etc.)

### Health Monitoring

**Endpoint:** `GET /api/v1/health`

**Monitors:**
- HTTP server responsiveness
- Meilisearch connectivity
- Overall service health

**Integration Points:**
- Dokploy built-in monitoring
- External uptime monitors (UptimeRobot, Pingdom)
- Prometheus exporters (future enhancement)

### Metrics to Track

**Application Metrics:**
- Request count
- Response times (p50, p95, p99)
- Error rates
- Fallback rate (local → global)

**Infrastructure Metrics:**
- CPU usage
- Memory usage
- Network I/O
- Container restarts

### Future Enhancements

1. **Prometheus Metrics:**
   ```javascript
   const promClient = require('prom-client');
   const searchCounter = new promClient.Counter({
     name: 'search_requests_total',
     help: 'Total search requests',
     labelNames: ['source']
   });
   ```

2. **OpenTelemetry Tracing:**
   - Trace requests across services
   - Visualize in Jaeger or Zipkin

3. **Error Tracking:**
   - Sentry integration for exception monitoring

---

## Integration with NeoColmado Ecosystem

### Calling This Service from n8n

**HTTP Request Node Configuration:**

```javascript
{
  "method": "POST",
  "url": "https://search.neocolmado.com/api/v1/search",
  "headers": {
    "Content-Type": "application/json"
  },
  "body": {
    "query": "{{ $json.userMessage }}",
    "slug": "{{ $json.tiendaSlug }}",
    "limit": 10
  }
}
```

**Handling Response in n8n:**

```javascript
const result = $json.data;

if (result.source === 'local') {
  // Product available in local inventory
  // Use local prices directly
  return {
    products: result.hits,
    pricesConfirmed: true
  };

} else if (result.source === 'global') {
  // Product only in global catalog
  // Need store owner confirmation
  return {
    products: result.hits,
    validation: {
      required: true,
      reason: 'Product not in local inventory'
    }
  };
}
```

### Firebase Integration

**Not Direct:**
This service does NOT read from or write to Firebase. That's handled by n8n.

**Data Flow:**
```
Firebase /mensajes
  ↓
Cloud Functions
  ↓
n8n Workflow
  ↓
[THIS SERVICE]
  ↓
n8n (processes results)
  ↓
Firebase /respuestas
```

### WhatsApp Integration

**Evolution API → n8n → Search Service → n8n → Evolution API**

The service doesn't know about WhatsApp. It just returns search results to whoever calls it (n8n).

---

## Future Roadmap

### Planned Features

1. **Advanced Filtering:**
   - Filter by category
   - Price range queries
   - Stock availability

2. **Fuzzy Matching Improvements:**
   - Handle common misspellings
   - Synonym support ("guineo" → "plátano")

3. **Caching Layer:**
   - Redis for frequently searched terms
   - Reduce Meilisearch load

4. **Analytics:**
   - Track popular searches
   - Identify gaps in local inventory

5. **Multi-language Support:**
   - Spanish/English product names
   - Language detection in queries

### Technical Debt

1. **Add Unit Tests:**
   - Jest for service layer
   - Supertest for API endpoints
   - Coverage target: 80%

2. **Add Integration Tests:**
   - Test against real Meilisearch instance
   - Docker Compose test environment

3. **Improve Error Messages:**
   - More specific error codes
   - Actionable error messages

4. **API Versioning:**
   - Prepare for /api/v2
   - Backward compatibility strategy

---

## Conclusion

This service is a critical component of the NeoColmado search infrastructure. It provides:

✅ **Separation of Concerns:** Search logic isolated from n8n workflows
✅ **Consistency:** Same search behavior across all channels
✅ **Performance:** Direct Meilisearch queries with intelligent fallback
✅ **Scalability:** Stateless design allows horizontal scaling
✅ **Maintainability:** Clean code structure with clear responsibilities

**Key Takeaway for AI Assistants:**
When debugging or modifying this service, remember:
1. The fallback logic (local → global) is the core business rule
2. Source indication ("local" vs "global") is critical for downstream processing
3. This service is called by n8n, not directly by end users
4. Meilisearch is the single source of truth for product data

---

**Document Version:** 1.0
**Last Updated:** 2025-01-19
**Maintained By:** NeoColmado Development Team
**Questions?** Check logs first, then review this document.
