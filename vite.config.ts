import type { Plugin } from "vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Vite plugin that replaces chunked transfer encoding with Content-Length.
 * Works around a Daytona proxy bug where chunked responses get corrupted
 * after connection pool reuse, causing 400 errors on refresh.
 */
function daytonaBufferPlugin(): Plugin {
  return {
    name: "daytona-buffer",
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        const originalWrite = res.write.bind(res);
        const originalEnd = res.end.bind(res);
        const chunks: Buffer[] = [];
        let headersAlreadySent = false;

        res.write = function (chunk: any, ...args: any[]) {
          if (res.headersSent) {
            return originalWrite(chunk, ...args);
          }
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          return true;
        } as any;

        res.end = function (chunk?: any, ...args: any[]) {
          if (headersAlreadySent || res.headersSent) {
            return originalEnd(chunk, ...args);
          }
          headersAlreadySent = true;
          if (chunk) {
            chunks.push(
              Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
            );
          }
          const body = Buffer.concat(chunks);
          res.removeHeader("transfer-encoding");
          res.setHeader("content-length", body.length);
          originalEnd(body);
        } as any;

        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [daytonaBufferPlugin(), react()],
  server: {
    host: true,
    allowedHosts: true,
    cors: true,
  },
});
