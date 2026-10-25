import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";

// Configuration
const host = "127.0.0.1";
const port = Number(process.env.PORT ?? 8080);
const webRoot = resolve(import.meta.dirname, "..", "web");

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".woff2", "font/woff2"],
]);

// Request handling
async function resolveFile(urlPath) {
  const decodedPath = decodeURIComponent(urlPath);
  const filePath = normalize(join(webRoot, decodedPath));
  if (filePath !== webRoot && !filePath.startsWith(webRoot + sep)) {
    return null;
  }
  const info = await stat(filePath).catch(() => null);
  if (info?.isDirectory()) {
    return join(filePath, "index.html");
  }
  return info?.isFile() ? filePath : null;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}`);
  const filePath = await resolveFile(url.pathname).catch(() => null);
  const content = filePath === null ? null : await readFile(filePath).catch(() => null);

  if (content === null) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": contentTypes.get(extname(filePath)) ?? "application/octet-stream",
    "Cache-Control": "no-store",
  });
  response.end(content);
});

server.listen(port, host, () => {
  console.log(`Serving ${webRoot} at http://${host}:${port}/`);
});
