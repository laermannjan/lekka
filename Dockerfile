FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable && \
	apt-get update && apt-get install -y --no-install-recommends python3 make g++ && \
	rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
# better-sqlite3's bundled prebuilt binary for this platform/arch is linked
# against a newer glibc than node:24-slim (Debian bookworm) ships, so it
# dlopen-fails at runtime. Drop it and compile from source instead, using the
# node-gyp toolchain installed above.
RUN for dir in node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3; do \
		rm -f "$dir/prebuilds/$(node -p process.platform)-$(node -p process.arch).node"; \
		( cd "$dir" && npx node-gyp rebuild --release ); \
	done
COPY . .
RUN pnpm run build
RUN pnpm prune --prod

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/drizzle ./drizzle
COPY package.json ./

VOLUME /app/data
ENV DATABASE_URL=/app/data/lekka.db
ENV PORT=3000
# Restore uploads a whole export back (see src/lib/server/data-export.ts), and
# a real household's dump is far past the Node adapter's 512 KB default - which
# rejects the upload with a raw 413 before the restore action can say anything
# useful about it. Set here rather than only in docker-compose.yml so every
# deployment of this image inherits it (#39).
ENV BODY_SIZE_LIMIT=64M
EXPOSE 3000

CMD ["node", "build"]
