// serve.mjs — zero-dependency static server for local development.
// The app is plain ES modules, which browsers refuse to load from
// file://, so it has to be served over HTTP. Binds to localhost only.
//
//   npm start            → http://127.0.0.1:8080
//   PORT=0 npm start     → random free port
//
// Also exported for tools/shot-app.mjs, which needs a server it controls.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
};

export function serve(port = 8080) {
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
      let file = normalize(join(ROOT, path));
      if (!file.startsWith(ROOT)) throw Object.assign(new Error("forbidden"), { code: "EACCES" });
      if ((await stat(file)).isDirectory()) file = join(file, "index.html");
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
      res.end(body);
    } catch (err) {
      res.writeHead(err.code === "EACCES" ? 403 : 404, { "content-type": "text/plain" });
      res.end(err.code === "EACCES" ? "Forbidden" : "Not found");
    }
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok({ server, port: server.address().port })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { port } = await serve(Number(process.env.PORT ?? 8080));
  console.log(`Soda Pop Groove Trainer → http://127.0.0.1:${port}`);
}
