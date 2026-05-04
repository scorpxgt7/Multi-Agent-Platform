FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY backend ./backend

ENV HOST=0.0.0.0
ENV PORT=8787
ENV BACKEND_BASE_URL=http://127.0.0.1:8787

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 CMD ["node", "backend/smoke_check.js"]

CMD ["node", "backend/server.js"]
