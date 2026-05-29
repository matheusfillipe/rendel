FROM node:22-bookworm-slim

ENV HUSKY=0
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Bake the Dirt-Samples so sample-based patterns render without network access.
# Kept as an early layer because it is large and changes rarely.
COPY scripts ./scripts
RUN bash scripts/setup-samples.sh

# Install runtime dependencies only. postinstall applies the vendored patches;
# the husky git-hook step is dev-only and is neutralised here.
COPY package.json package-lock.json ./
COPY patches ./patches
RUN npm pkg set scripts.prepare="true" \
  && npm ci --omit=dev --no-audit --no-fund \
  && npm cache clean --force

COPY src ./src
COPY api ./api
COPY examples ./examples

ENV PORT=8080
EXPOSE 8080
CMD ["node", "api/server.js"]
