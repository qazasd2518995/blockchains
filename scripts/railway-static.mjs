#!/usr/bin/env node

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const publicRoot = path.resolve(process.argv[2] || 'dist');
const fallbackName = process.argv[3] || 'index.html';
const rootRedirect = process.argv[4] || '';
const port = Number.parseInt(process.env.PORT || '3000', 10);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`Invalid PORT: ${process.env.PORT}`);
}

const contentTypes = new Map([
  ['.avif', 'image/avif'],
  ['.bin', 'application/octet-stream'],
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.m4a', 'audio/mp4'],
  ['.map', 'application/json; charset=utf-8'],
  ['.mp3', 'audio/mpeg'],
  ['.mp4', 'video/mp4'],
  ['.ogg', 'audio/ogg'],
  ['.otf', 'font/otf'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.ttf', 'font/ttf'],
  ['.wasm', 'application/wasm'],
  ['.wav', 'audio/wav'],
  ['.webm', 'video/webm'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.xml', 'application/xml; charset=utf-8'],
  ['.zip', 'application/zip'],
]);

function cacheControl(urlPath, extension) {
  const fileName = path.posix.basename(urlPath);
  const mutableScript = /(?:adapter|bridge|config|runtime-compat)\.js$/i.test(fileName);
  if (
    extension === '.html' ||
    fileName === 'sw.js' ||
    fileName === 'manifest.webmanifest' ||
    mutableScript
  ) {
    return 'no-store, no-cache, must-revalidate';
  }

  if (/[.-][a-f0-9]{8,}\./i.test(fileName)) {
    return 'public, max-age=31536000, immutable';
  }

  if (
    urlPath.startsWith('/assets/') ||
    urlPath.startsWith('/games/') ||
    urlPath.startsWith('/slotFramework/')
  ) {
    return 'public, max-age=31536000, immutable';
  }

  if (urlPath.startsWith('/qmoney/assets/')) {
    return 'public, max-age=604800';
  }

  return 'public, max-age=3600';
}

function resolveInsideRoot(urlPath) {
  const relativePath = urlPath.replace(/^\/+/, '');
  const resolvedPath = path.resolve(publicRoot, relativePath);
  if (resolvedPath !== publicRoot && !resolvedPath.startsWith(`${publicRoot}${path.sep}`)) {
    return null;
  }
  return resolvedPath;
}

async function resolveFile(urlPath, acceptHeader) {
  const hasFileExtension = path.posix.extname(urlPath) !== '';
  const acceptsHtml =
    !acceptHeader || acceptHeader.includes('text/html') || acceptHeader.includes('*/*');

  // Player-facing game URLs are React routes. Some archived source games also
  // live in a directory with the same slug, so resolving directories first
  // would bypass the authenticated shell and serve the engine's index.html.
  // Engine documents always use an explicit /index.html URL and remain static.
  const isPlayerGameRoute = /^\/games\/[^/]+\/?$/.test(urlPath);
  if (!hasFileExtension && acceptsHtml && isPlayerGameRoute) {
    return resolveFallbackFile();
  }

  let candidate = resolveInsideRoot(urlPath);
  if (!candidate) return { status: 403 };

  try {
    const candidateStat = await stat(candidate);
    if (candidateStat.isDirectory()) {
      candidate = path.join(candidate, 'index.html');
    }
    const fileStat = candidateStat.isDirectory() ? await stat(candidate) : candidateStat;
    if (fileStat.isFile()) return { filePath: candidate, fileStat };
  } catch {
    // The SPA fallback below handles browser routes; missing assets remain 404.
  }

  if (hasFileExtension || !acceptsHtml) return { status: 404 };

  return resolveFallbackFile();
}

async function resolveFallbackFile() {
  const fallbackPath = resolveInsideRoot(`/${fallbackName}`);
  if (!fallbackPath) return { status: 500 };
  try {
    const fallbackStat = await stat(fallbackPath);
    return fallbackStat.isFile()
      ? { filePath: fallbackPath, fileStat: fallbackStat, isFallback: true }
      : { status: 404 };
  } catch {
    return { status: 404 };
  }
}

function parseRange(rangeHeader, size) {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || (!match[1] && !match[2])) return { invalid: true };

  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number.parseInt(match[2], 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return { invalid: true };
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number.parseInt(match[1], 10);
    end = match[2] ? Number.parseInt(match[2], 10) : size - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || end < start) {
    return { invalid: true };
  }
  return { start, end: Math.min(end, size - 1) };
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
  });
  response.end(message);
}

const server = http.createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    sendText(response, 405, 'Method Not Allowed');
    return;
  }

  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
  } catch {
    sendText(response, 400, 'Bad Request');
    return;
  }

  if (urlPath.includes('\0')) {
    sendText(response, 400, 'Bad Request');
    return;
  }

  if (urlPath === '/healthz') {
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    });
    response.end(request.method === 'HEAD' ? undefined : '{"status":"healthy"}');
    return;
  }

  if (urlPath === '/' && rootRedirect) {
    response.writeHead(302, { 'Cache-Control': 'no-store', Location: rootRedirect });
    response.end();
    return;
  }

  const result = await resolveFile(urlPath, String(request.headers.accept || ''));
  if (!result.filePath || !result.fileStat) {
    sendText(response, result.status || 404, result.status === 403 ? 'Forbidden' : 'Not Found');
    return;
  }

  const extension = path.extname(result.filePath).toLowerCase();
  const etag = `W/"${result.fileStat.size.toString(16)}-${Math.trunc(result.fileStat.mtimeMs).toString(16)}"`;
  const headers = {
    'Accept-Ranges': 'bytes',
    'Cache-Control': cacheControl(urlPath, extension),
    'Content-Type': contentTypes.get(extension) || 'application/octet-stream',
    ETag: etag,
    'Last-Modified': result.fileStat.mtime.toUTCString(),
    'X-Content-Type-Options': 'nosniff',
  };

  if (request.headers['if-none-match'] === etag) {
    response.writeHead(304, headers);
    response.end();
    return;
  }

  const range = parseRange(request.headers.range, result.fileStat.size);
  if (range?.invalid) {
    response.writeHead(416, { ...headers, 'Content-Range': `bytes */${result.fileStat.size}` });
    response.end();
    return;
  }

  if (range) {
    const contentLength = range.end - range.start + 1;
    response.writeHead(206, {
      ...headers,
      'Content-Length': contentLength,
      'Content-Range': `bytes ${range.start}-${range.end}/${result.fileStat.size}`,
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    createReadStream(result.filePath, { start: range.start, end: range.end }).pipe(response);
    return;
  }

  response.writeHead(200, { ...headers, 'Content-Length': result.fileStat.size });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(result.filePath).pipe(response);
});

server.listen(port, '0.0.0.0', () => {
  console.log(
    `[railway-static] Serving ${publicRoot} on 0.0.0.0:${port}; fallback=${fallbackName}; rootRedirect=${rootRedirect || '(none)'}`,
  );
});

function shutdown(signal) {
  console.log(`[railway-static] Received ${signal}; shutting down.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
