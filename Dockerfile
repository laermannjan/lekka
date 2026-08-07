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
#
# node-gyp is a pinned devDependency invoked through its installed binary, not
# `npx node-gyp`: npx would resolve the latest published version from the
# registry at build time, so the same source tree could produce a different
# image on a different day.
RUN for dir in node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3; do \
		rm -f "$dir/prebuilds/$(node -p process.platform)-$(node -p process.arch).node"; \
		( cd "$dir" && /app/node_modules/.bin/node-gyp rebuild --release ); \
	done
COPY . .
RUN pnpm run build
RUN pnpm prune --prod

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --chown=node:node package.json ./

# Create the data dir owned by `node` *before* declaring the volume: Docker
# seeds a fresh named volume from whatever is at this path in the image,
# ownership included, so this is what makes the mounted volume writable
# without running the server as root. An instance created before this change
# has a root-owned volume and needs a one-off chown - see the README.
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME /app/data
ENV DATABASE_URL=/app/data/lekka.db
ENV PORT=3000
EXPOSE 3000

USER node
CMD ["node", "build"]
