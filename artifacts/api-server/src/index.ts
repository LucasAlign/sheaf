import { createServer } from "node:http";
import { handleApiRequest } from "../server/adapter";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith("/api/")) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    await handleApiRequest(req, res);
  } catch {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end("Unexpected API error");
    } else {
      res.end();
    }
  }
}).listen(port, "0.0.0.0", () => {
  process.stdout.write(`Bridge API is running on port ${port}\n`);
});
