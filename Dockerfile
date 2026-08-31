FROM node:24-bookworm-slim AS build
WORKDIR /app
# better-sqlite3 ships prebuilds but its install script still invokes node-gyp.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build \
    && node -e "\
      const fs = require('fs');\
      const dir = '.output/server/node_modules/better-sqlite3/prebuilds';\
      for (const name of fs.readdirSync(dir)) {\
        if (name !== 'linuxmusl-' + process.arch + '.node') fs.rmSync(dir + '/' + name);\
      }\
    "

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

# Nitro traces better-sqlite3 (native prebuilds) into .output. Do not copy
# the rest of production node_modules into the runtime image.
COPY --from=build --chown=node:node /app/.output ./.output
COPY --chown=node:node drizzle ./drizzle
COPY deploy/litestream/litestream.yml /etc/litestream.yml
COPY deploy/litestream/entrypoint.sh /usr/local/bin/shukka-entrypoint

RUN chmod +x /usr/local/bin/shukka-entrypoint && mkdir -p /data && chown node:node /data
USER node
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

VOLUME ["/data"]
EXPOSE 3000
CMD ["/usr/local/bin/shukka-entrypoint"]
