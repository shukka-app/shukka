FROM node:24-bookworm-slim AS build
WORKDIR /workspace
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/shukka/package.json apps/shukka/package.json
COPY apps/docs/package.json apps/docs/package.json
COPY packages/store/package.json packages/store/package.json
COPY packages/store-sqlite/package.json packages/store-sqlite/package.json
RUN pnpm install --frozen-lockfile --filter shukka...

COPY packages/store ./packages/store
COPY packages/store-sqlite ./packages/store-sqlite
COPY apps/shukka ./apps/shukka
WORKDIR /workspace/apps/shukka
RUN pnpm build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    SHUKKA_DATA_DIR=/data

# Litestream is opt-in at runtime (see deploy/litestream/entrypoint.sh):
# only used when LITESTREAM_BUCKET is set, e.g. on CloudBase CloudRun where
# the container filesystem is ephemeral.
ARG TARGETARCH=amd64
ARG LITESTREAM_VERSION=0.5.16
RUN apk add --no-cache ca-certificates wget \
    && case "$TARGETARCH" in amd64) arch=x86_64 ;; *) arch="$TARGETARCH" ;; esac \
    && wget -qO- "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-${arch}.tar.gz" \
       | tar -xz -C /usr/local/bin

# Nitro traces libsql into .output. Do not copy the rest of production
# node_modules into the runtime image.
COPY --from=build --chown=node:node /workspace/apps/shukka/.output ./.output
COPY --from=build --chown=node:node /workspace/packages/store-sqlite/drizzle ./drizzle
COPY apps/shukka/deploy/litestream/litestream.yml /etc/litestream.yml
COPY apps/shukka/deploy/litestream/entrypoint.sh /usr/local/bin/shukka-entrypoint

RUN chmod +x /usr/local/bin/shukka-entrypoint && mkdir -p /data && chown node:node /data
USER node
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

VOLUME ["/data"]
EXPOSE 3000
CMD ["/usr/local/bin/shukka-entrypoint"]
