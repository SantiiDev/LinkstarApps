# Imagen de services/api para Railway (sirve igual para Render o cualquier host
# de contenedores). Se construye con la RAÍZ del repo como contexto:
#
#   docker build -f services/api/Dockerfile -t linkstar-api .
#
# porque el único package-lock.json es el de la raíz (npm workspaces) y sin él
# `npm ci` no puede instalar versiones fijas. Ver services/api/DEPLOY.md.

# Node 22: @supabase/supabase-js 2.112+ lo exige (engines >=22).
FROM node:22-alpine

WORKDIR /app

# El lockfile describe los cuatro workspaces; npm ci valida contra todos sus
# package.json aunque instale uno solo. Se copian sólo los manifiestos para que
# esta capa (la lenta) se reutilice mientras no cambien las dependencias.
COPY package.json package-lock.json ./
COPY apps/ventas/package.json apps/ventas/
COPY apps/dashboard/package.json apps/dashboard/
COPY packages/database/package.json packages/database/
COPY services/api/package.json services/api/

# Sólo las dependencias de producción del API: nada de Vite, wrangler ni el CLI
# de Supabase. --ignore-scripts porque ninguna dependencia del API los necesita.
RUN npm ci --workspace @linkstar/api --omit=dev --ignore-scripts \
  && npm cache clean --force

COPY services/api services/api

WORKDIR /app/services/api
ENV NODE_ENV=production
USER node

# Railway inyecta PORT. El servicio cron reutiliza esta imagen con otro comando
# (npm run daily), configurado en el panel.
CMD ["node", "server.js"]
