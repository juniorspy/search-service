# Deployment Guide - Dokploy

## Opción 1: Usando Docker Compose (Recomendado)

### Paso 1: Crear nuevo servicio en Dokploy

1. Ve a tu panel de Dokploy
2. Click en **"Create New Service"** o **"New Application"**
3. Selecciona **"Docker Compose"**

### Paso 2: Configurar repositorio

- **Repository**: `https://github.com/juniorspy/search-service`
- **Branch**: `master`
- **Compose File**: `docker-compose.yml`

### Paso 3: Variables de entorno REQUERIDAS

```env
MEILISEARCH_HOST=https://melisearch.onrpa.com
MEILISEARCH_API_KEY=lsT73ukYM4YV+5/mYoI/CrsoyWf2pucWeLepowtwIXI=
NODE_ENV=production
PORT=3000
GLOBAL_INDEX=colmado_inventory
LOCAL_INDEX_PREFIX=productos_colmado_
LOG_LEVEL=info
REQUEST_TIMEOUT=5000
```

### Paso 4: Configurar puerto

- **Internal Port**: `3000`
- **External Port**: `3000` (o el que prefieras)

### Paso 5: Deploy

Click en **"Deploy"** o **"Build & Deploy"**

---

## Opción 2: Usando Dockerfile

### Paso 1: Crear servicio

1. Tipo: **"Application"** o **"Docker"**
2. Source: **"GitHub"**

### Paso 2: Build configuration

- **Repository**: `https://github.com/juniorspy/search-service`
- **Branch**: `master`
- **Build Type**: `Dockerfile`
- **Dockerfile Path**: `Dockerfile` (sin ./)
- **Build Context**: `.`

### Paso 3: Variables de entorno

Las mismas que arriba ☝️

### Paso 4: Port mapping

- **Container Port**: `3000`
- **Host Port**: `3000`

### Paso 5: Deploy

---

## Verificación Post-Deploy

Una vez desplegado, verifica que funcione:

### 1. Health Check

```bash
curl https://tu-dominio.com/api/v1/health
```

Respuesta esperada:
```json
{
  "success": true,
  "service": "search-service",
  "status": "healthy",
  "meilisearch": {
    "status": "available"
  }
}
```

### 2. Search Test

```bash
curl -X POST https://tu-dominio.com/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "arroz",
    "slug": "colmado_william",
    "limit": 5
  }'
```

Respuesta esperada:
```json
{
  "success": true,
  "data": {
    "source": "local" | "global",
    "hits": [...],
    "total": N
  }
}
```

---

## Troubleshooting

### Container crashea inmediatamente

**Causa**: Variables de entorno faltantes o incorrectas

**Solución**:
1. Verifica que TODAS las variables estén configuradas
2. Revisa los logs del contenedor en Dokploy
3. Asegúrate que `MEILISEARCH_API_KEY` esté correcta

### Health check failing

**Causa**: Puerto incorrecto o endpoint incorrecto

**Solución**:
- Verifica que el puerto sea `3000`
- El health check debe apuntar a `/api/v1/health` (no `/health`)

### No puede conectar a Meilisearch

**Causa**: Firewall o URL incorrecta

**Solución**:
- Si Meilisearch está en el mismo servidor, usa URL interna
- Verifica que `https://melisearch.onrpa.com` sea accesible desde el contenedor

### Error "select-a-container"

**Causa**: Dokploy no puede crear el contenedor

**Solución**:
1. Usa Docker Compose en lugar de Dockerfile solo
2. Verifica que el `docker-compose.yml` sea válido
3. Revisa los logs de build completos

---

## Configuración de Dominio

1. En Dokploy, ve a la sección **"Domains"** del servicio
2. Agrega tu dominio: `search.neocolmado.com` (ejemplo)
3. Dokploy configurará automáticamente el proxy reverso
4. SSL se configurará automáticamente con Let's Encrypt

---

## Monitoreo

### Ver logs en tiempo real

En Dokploy, ve a **"Logs"** → **"Container Logs"**

Deberías ver:
```
🚀 Search Service running on port 3000
Environment: production
Meilisearch Host: https://melisearch.onrpa.com
```

### Métricas

- CPU y memoria se pueden ver en el dashboard de Dokploy
- Logs incluyen tiempos de respuesta (`processingTimeMs`)

---

## Actualización del Servicio

1. Haz push de cambios a GitHub
2. En Dokploy, click en **"Redeploy"** o activa auto-deploy
3. Dokploy hará:
   - Pull del nuevo código
   - Rebuild de la imagen
   - Restart del contenedor

---

**Última actualización**: 2025-01-19
