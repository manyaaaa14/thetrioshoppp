import { spawn } from "node:child_process";

const port = process.env.PORT || "4173";
const server = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "preview", "--host", "0.0.0.0", "--port", port],
  { stdio: "inherit" }
);

server.on("error", (error) => {
  console.error("Unable to start the production preview server:", error);
  process.exitCode = 1;
});

server.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
