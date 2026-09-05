FROM node:24-alpine

RUN apk add --no-cache su-exec

WORKDIR /srv
COPY package.json ./
COPY app ./app
COPY server ./server
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh && mkdir -p /data

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=8080
ENV PUID=1000
ENV PGID=1000

VOLUME /data
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O - http://127.0.0.1:8080/healthz || exit 1

ENTRYPOINT ["/srv/entrypoint.sh"]
# Not `npm run serve`: that one watches for changes, and the server wants to be PID 1.
CMD ["node", "server/main.js"]
