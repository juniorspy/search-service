# NeoColmado Search Gateway

A standalone microservice that provides dynamic product search with intelligent local→global fallback for the NeoColmado ecosystem.

## Overview

This service acts as a search gateway between n8n workflows and Meilisearch, implementing smart inventory search logic:

1. **First**: Search in the store's local inventory index (`productos_colmado_{slug}`)
2. **Fallback**: If no results found, search in the global inventory index (`colmado_inventory`)
3. **Response**: Returns results with clear indication of source (local or global)

## Features

- ✅ **Smart Fallback Logic**: Automatic local→global search progression
- ✅ **Multi-tenant**: Supports multiple stores via slug parameter
- ✅ **Production Ready**: Logging, error handling, health checks
- ✅ **Dockerized**: Easy deployment with Docker/Docker Compose
- ✅ **Lightweight**: Express.js with minimal dependencies
- ✅ **Secure**: Helmet.js security headers, input validation

## Architecture

```
┌─────────────┐
│   Client    │  (n8n, App, Web)
└──────┬──────┘
       │ POST /api/v1/search
       │ { query, slug, limit, offset }
       ↓
┌──────────────────────┐
│  Search Gateway      │
│  (Express + Node.js) │
└──────────┬───────────┘
           │
           ↓
┌──────────────────────┐
│    Search Logic      │
│  1. Try local index  │
│  2. Fallback global  │
└──────────┬───────────┘
           │
           ↓
┌──────────────────────┐
│    Meilisearch       │
│  - productos_colmado_│
│    {slug}            │
│  - colmado_inventory │
└──────────────────────┘
```

## API Reference

### POST /api/v1/search

Search for products with local→global fallback.

**Request Body:**

```json
{
  "query": "arroz",
  "slug": "colmado_william",
  "limit": 20,
  "offset": 0
}
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| query | string | Yes | Search query text |
| slug | string | Yes | Store slug (lowercase, alphanumeric, hyphens, underscores) |
| limit | integer | No | Max results (1-100, default: 20) |
| offset | integer | No | Pagination offset (default: 0) |

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "source": "local",
    "indexName": "productos_colmado_colmado_william",
    "hits": [
      {
        "id": "prod_123",
        "nombre": "Arroz Graneado",
        "precio": 35.00,
        "unidad": "libra"
      }
    ],
    "total": 1,
    "query": "arroz",
    "limit": 20,
    "offset": 0,
    "processingTimeMs": 12
  }
}
```

**Response Fields:**

- `source`: `"local"` or `"global"` - Indicates which index returned results
- `indexName`: Name of the Meilisearch index used
- `hits`: Array of matching products
- `total`: Total number of results found
- `processingTimeMs`: Search execution time in milliseconds

**Error Response (400 Bad Request):**

```json
{
  "success": false,
  "errors": [
    {
      "field": "slug",
      "message": "Slug is required and must be a non-empty string"
    }
  ]
}
```

### GET /health

Health check endpoint for monitoring.

**Response (200 OK):**

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

**Response (503 Service Unavailable):**

```json
{
  "success": false,
  "service": "search-service",
  "status": "unhealthy",
  "error": "Connection to Meilisearch failed",
  "timestamp": "2025-01-19T10:30:00.000Z"
}
```

## Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# Server Configuration
PORT=3000
NODE_ENV=production

# Meilisearch Configuration
MEILISEARCH_HOST=https://melisearch.onrpa.com
MEILISEARCH_API_KEY=your_api_key_here

# Search Configuration
GLOBAL_INDEX=colmado_inventory
LOCAL_INDEX_PREFIX=productos_colmado_

# Logging
LOG_LEVEL=info

# Optional: Request Timeout (ms)
REQUEST_TIMEOUT=5000
```

## Installation & Usage

### Local Development

1. **Clone the repository:**

```bash
git clone https://github.com/your-org/search-service.git
cd search-service
```

2. **Install dependencies:**

```bash
npm install
```

3. **Configure environment:**

```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Run in development mode:**

```bash
npm run dev
```

5. **Test the endpoint:**

```bash
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "arroz",
    "slug": "colmado_william",
    "limit": 10
  }'
```

### Docker

**Build and run with Docker Compose:**

```bash
docker-compose up -d
```

**Build manually:**

```bash
docker build -t search-service .
docker run -p 3000:3000 --env-file .env search-service
```

### Production Deployment

**Deploy to Dokploy:**

1. Create a new service in Dokploy
2. Connect your GitHub repository (`search-service`)
3. Configure environment variables in Dokploy dashboard
4. Set custom domain (e.g., `search.neocolmado.com`)
5. Trigger deployment

**Environment variables to configure in Dokploy:**

```
MEILISEARCH_HOST=https://melisearch.onrpa.com
MEILISEARCH_API_KEY=your_production_key
GLOBAL_INDEX=colmado_inventory
LOCAL_INDEX_PREFIX=productos_colmado_
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
```

## Fallback Logic Explained

### Scenario 1: Product Found in Local Index

```
Request: { query: "arroz", slug: "colmado_william" }
         ↓
Search: productos_colmado_colmado_william
         ↓
Result: 3 products found
         ↓
Response: { source: "local", hits: [...], total: 3 }
```

### Scenario 2: Product Not in Local, Found in Global

```
Request: { query: "detergente ace", slug: "colmado_william" }
         ↓
Search: productos_colmado_colmado_william
         ↓
Result: 0 products found
         ↓
Fallback: Search in colmado_inventory
         ↓
Result: 2 products found
         ↓
Response: { source: "global", hits: [...], total: 2 }
```

### Scenario 3: Product Not Found Anywhere

```
Request: { query: "producto inexistente", slug: "colmado_william" }
         ↓
Search: productos_colmado_colmado_william
         ↓
Result: 0 products found
         ↓
Fallback: Search in colmado_inventory
         ↓
Result: 0 products found
         ↓
Response: { source: "global", hits: [], total: 0 }
```

## Integration Examples

### From n8n Workflow

**HTTP Request Node:**

```
Method: POST
URL: https://search.neocolmado.com/api/v1/search
Body:
{
  "query": "{{ $json.userMessage }}",
  "slug": "{{ $json.tiendaSlug }}",
  "limit": 10
}
```

**Parse Response:**

```javascript
const result = $json.data;

if (result.source === 'local') {
  // Product available in local inventory
  // Use local prices
} else if (result.source === 'global') {
  // Product only in global inventory
  // May need price confirmation
}
```

### From JavaScript/Node.js

```javascript
const axios = require('axios');

async function searchProduct(query, slug) {
  try {
    const response = await axios.post('https://search.neocolmado.com/api/v1/search', {
      query,
      slug,
      limit: 20,
      offset: 0
    });

    const { source, hits, total } = response.data.data;

    console.log(`Found ${total} results in ${source} index`);
    return hits;

  } catch (error) {
    console.error('Search failed:', error.response?.data || error.message);
    throw error;
  }
}

// Usage
searchProduct('arroz', 'colmado_william')
  .then(results => console.log(results));
```

### cURL Example

```bash
curl -X POST https://search.neocolmado.com/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "aceite",
    "slug": "colmado_william",
    "limit": 5,
    "offset": 0
  }'
```

## Project Structure

```
search-service/
├── src/
│   ├── config/
│   │   ├── logger.js              # Winston logger configuration
│   │   └── meilisearch.js         # Meilisearch client setup
│   ├── controllers/
│   │   └── searchController.js    # Request handlers
│   ├── services/
│   │   └── searchService.js       # Business logic (fallback)
│   ├── middleware/
│   │   ├── errorHandler.js        # Error handling
│   │   └── validator.js           # Request validation
│   ├── routes/
│   │   └── index.js               # API routes
│   └── server.js                  # Express app entry point
├── tests/                          # Unit tests (TBD)
├── .env.example                    # Environment template
├── .gitignore
├── .dockerignore
├── Dockerfile                      # Multi-stage build
├── docker-compose.yml              # Local development
├── package.json
└── README.md
```

## Monitoring & Logging

### Logs

Application logs are output to stdout in JSON format:

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

### Health Checks

**Manual check:**

```bash
curl http://localhost:3000/health
```

**Docker health check:**

Automatically configured in Dockerfile:
- Interval: 30s
- Timeout: 5s
- Retries: 3

## Troubleshooting

### Connection to Meilisearch Failed

**Problem:** `ECONNREFUSED` or timeout errors

**Solutions:**
1. Verify `MEILISEARCH_HOST` is correct
2. Check Meilisearch is running: `curl https://melisearch.onrpa.com/health`
3. Validate `MEILISEARCH_API_KEY` is correct
4. Check firewall/network rules

### Invalid API Key

**Problem:** `401 Unauthorized` from Meilisearch

**Solution:** Regenerate API key in Meilisearch dashboard and update `.env`

### Index Not Found

**Problem:** Search returns errors about missing index

**Solution:** Ensure indices exist in Meilisearch:
- Global index: `colmado_inventory`
- Local index format: `productos_colmado_{slug}`

### Validation Errors

**Problem:** `400 Bad Request` with validation errors

**Solution:** Check request body format:
- `query`: Non-empty string
- `slug`: Lowercase alphanumeric with hyphens/underscores only
- `limit`: Integer 1-100
- `offset`: Non-negative integer

## Performance Considerations

- **Response Time**: Typically < 50ms for local cache hits
- **Fallback Overhead**: ~10-30ms additional for global search
- **Connection Pooling**: Meilisearch client reuses connections
- **Timeout**: Configurable via `REQUEST_TIMEOUT` env var (default: 5000ms)

## Security

- ✅ Helmet.js security headers
- ✅ CORS enabled (configure as needed)
- ✅ Input validation with express-validator
- ✅ API key stored in environment variables (never in code)
- ✅ Non-root Docker user (nodejs:nodejs)
- ✅ Health check doesn't expose sensitive data

## License

MIT

## Support

For issues or questions, contact the NeoColmado development team or open an issue on GitHub.

---

**Version:** 1.0.0
**Last Updated:** January 2025
**Maintained by:** NeoColmado Team
