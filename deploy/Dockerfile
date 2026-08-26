# Ein Prozess, keine Laufzeit-Abhängigkeiten. Die Karten liegen im Volume
# unter /data, sonst ist das Dateisystem schreibgeschützt.
FROM node:22-alpine

WORKDIR /srv
COPY app ./app
COPY server ./server

ENV PORT=8080 DATA_DIR=/data
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost:8080/ >/dev/null || exit 1

CMD ["node", "server/index.mjs"]
