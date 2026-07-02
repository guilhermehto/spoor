# syntax=docker/dockerfile:1
# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

# Pin pnpm to 9.x to avoid the minimumReleaseAge audit policy in pnpm 10+
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

WORKDIR /build

# Copy manifests first for layer caching
COPY package.json pnpm-lock.yaml ./

# Install all deps (devDeps needed for build + esbuild)
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build the app (outputs to dist/)
RUN pnpm build

# Vite bundles @opentelemetry/api (an optional peer dep of better-auth) as an
# empty stub when the package is not installed.  better-auth's dynamic import
# then resolves to {} instead of failing, so getOpenTelemetryAPI() returns {}
# instead of the noopOpenTelemetryAPI fallback, causing TypeError at runtime.
# Fix: replace the empty stub with a module that throws, so the .catch handler
# in better-auth keeps openTelemetryAPI=undefined and uses the noop instead.
RUN node --input-type=module << 'PATCH_EOF'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const dir = 'dist/server/assets';
for (const f of readdirSync(dir)) {
  if (!f.endsWith('.js')) continue;
  const p = join(dir, f);
  const src = readFileSync(p, 'utf8').trim();
  if (src === 'const core = {};\nexport {\n  core as default\n};') {
    writeFileSync(p, 'throw new Error("@opentelemetry/api not available");\n');
    console.log('Patched otel stub:', f);
  }
}
PATCH_EOF

# Compile the migrator to plain JS using esbuild (available via tsx's deps).
# The runtime image runs the compiled .mjs with node — no TypeScript tooling needed.
RUN node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild/bin/esbuild \
      scripts/migrate.ts \
      --bundle \
      --platform=node \
      --format=esm \
      --outfile=scripts/migrate.mjs \
      --external:postgres \
      --external:drizzle-orm

# Create the HTTP server entry that wraps the TanStack Start fetch handler.
# Uses Node.js built-in http/fs modules — no extra runtime deps needed.
# Static files under dist/client (assets/, spoor.js, favicon.ico, etc.) are
# served directly; all other requests are forwarded to the TanStack handler.
RUN cat > scripts/serve.mjs << 'EOF'
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import handler from '/app/dist/server/server.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const clientDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'client');

const MIME = {
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

// ponytail: no CSP, needs nonce plumbing through SSR
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

// Set via setHeader before any writeHead: writeHead merges (its own keys win),
// and the SSR header copy may overwrite — app-provided headers always win.
function applySecurityHeaders(req, res) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!res.hasHeader(k)) res.setHeader(k, v);
  }
  if (req.headers['x-forwarded-proto'] === 'https' && !res.hasHeader('Strict-Transport-Security')) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  }
}

function serveStatic(urlPath, res) {
  // Resolve the filesystem path; reject any path traversal attempts.
  const rel = decodeURIComponent(urlPath);
  const abs = path.resolve(clientDir, '.' + rel);
  if (!abs.startsWith(clientDir + path.sep) && abs !== clientDir) {
    res.writeHead(403);
    res.end('Forbidden');
    return true;
  }
  let stat;
  try { stat = fs.statSync(abs); } catch { return false; }
  if (!stat.isFile()) return false;
  const ext = path.extname(abs).toLowerCase();
  const mime = MIME[ext] ?? 'application/octet-stream';
  // Hashed assets are immutable; public files get a short cache.
  const isHashed = /\/assets\//.test(rel);
  res.writeHead(200, {
    'Content-Type': mime,
    'Cache-Control': isHashed ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
    'Content-Length': stat.size,
  });
  fs.createReadStream(abs).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  applySecurityHeaders(req, res);
  const urlPath = (req.url ?? '/').split('?')[0];

  // Serve static client assets before hitting the SSR handler.
  if (serveStatic(urlPath, res)) return;

  const proto = req.headers['x-forwarded-proto'] ?? 'http';
  const hostHeader = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost';
  const url = `${proto}://${hostHeader}${req.url}`;

  // Cap body accumulation to prevent memory DoS from unbounded request bodies.
  // 64 KB is generous for any legitimate app POST; ingest has its own 8 KB inner guard.
  const MAX_REQUEST_BODY = 64 * 1024;
  const chunks = [];
  let accumulated = 0;
  let bodyTooLarge = false;
  for await (const chunk of req) {
    accumulated += chunk.length;
    if (accumulated > MAX_REQUEST_BODY) {
      bodyTooLarge = true;
      req.destroy();
      break;
    }
    chunks.push(chunk);
  }
  if (bodyTooLarge) {
    res.writeHead(413, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'payload too large' }));
    return;
  }
  const body = chunks.length > 0 ? Buffer.concat(chunks) : null;

  const headers = [];
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    headers.push([req.rawHeaders[i], req.rawHeaders[i + 1]]);
  }

  const webReq = new Request(url, {
    method: req.method,
    headers,
    body: body && body.length > 0 ? body : undefined,
    duplex: 'half',
  });

  let webRes;
  try {
    webRes = await handler.fetch(webReq);
  } catch (err) {
    console.error('Handler error:', err);
    res.writeHead(500);
    res.end('Internal Server Error');
    return;
  }

  res.statusCode = webRes.status;
  for (const [k, v] of webRes.headers) {
    res.setHeader(k, v);
  }

  if (webRes.body) {
    Readable.fromWeb(webRes.body).pipe(res);
  } else {
    res.end();
  }
});

server.listen(port, host, () => {
  console.log(`Spoor listening on http://${host}:${port}`);
});
EOF

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:24-alpine AS runtime

# Non-root user
RUN addgroup -S spoor && adduser -S spoor -G spoor

WORKDIR /app

# Copy build artefacts
COPY --from=builder /build/dist ./dist
COPY --from=builder /build/drizzle ./drizzle
COPY --from=builder /build/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=builder /build/scripts/serve.mjs ./scripts/serve.mjs
COPY --from=builder /build/scripts/start.sh ./scripts/start.sh

# Install production dependencies only
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate \
    && pnpm install --frozen-lockfile --prod \
    && chmod +x /app/scripts/start.sh

USER spoor

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

ENTRYPOINT ["/app/scripts/start.sh"]
