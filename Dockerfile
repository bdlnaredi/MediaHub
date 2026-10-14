FROM node:22-alpine

ARG VERSION=dev
LABEL org.opencontainers.image.title="MediaHub" \
      org.opencontainers.image.description="A self-hosted dashboard for Sonarr, Radarr, qBittorrent, Seerr, Plex, Unraid and more" \
      org.opencontainers.image.source="https://github.com/bdlnaredi/mediahub" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}"

# su-exec lets the container drop root after fixing folder ownership; tini handles shutdown signals.
RUN apk add --no-cache su-exec tini

WORKDIR /app
COPY package.json server.js entrypoint.sh ./
COPY lib ./lib
COPY public ./public
RUN chmod +x entrypoint.sh && mkdir -p /data

ENV NODE_ENV=production \
    PORT=5080 \
    DATA_DIR=/data \
    PUID=1000 \
    PGID=1000

VOLUME /data
EXPOSE 5080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/app/entrypoint.sh"]
