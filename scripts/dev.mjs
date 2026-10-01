import { spawn } from "node:child_process";
const processes = [];
function start(args) {
  const p = spawn(process.execPath, args, {
    stdio: "inherit",
    env: process.env,
  });
  processes.push(p);
  p.on("exit", (code) => {
    if (code) console.error(`Process exited with ${code}`);
  });
}
start(["server/start.mjs"]);
start([
  "node_modules/vite/bin/vite.js",
  "apps/ota",
  "--host",
  "0.0.0.0",
  "--port",
  "5173",
]);
processes.push(
  spawn(
    process.execPath,
    ["../../node_modules/expo/bin/cli", "start", "--web", "--port", "8081"],
    { cwd: "apps/utn", stdio: "inherit", env: process.env },
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    processes.forEach((p) => p.kill());
    process.exit();
  });
