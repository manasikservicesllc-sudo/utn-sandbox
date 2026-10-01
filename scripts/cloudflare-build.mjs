import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
function run(args, cwd, env = {}) {
  const result = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    args,
    {
      cwd,
      env: { ...process.env, ...env },
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}
const origin = "https://ota.utn-staging.com",
  utn = "https://utn-staging.com",
  api = "https://api.utn-staging.com";
run(["run", "build", "-w", "apps/ota"], root, {
  VITE_OTA_API_URL: origin,
  VITE_UTN_WEB_URL: utn + "/utn/",
});
run(
  ["exec", "--", "expo", "export", "--platform", "web", "--output-dir", "dist"],
  resolve(root, "apps/utn"),
  { EXPO_PUBLIC_UTN_API_URL: api, EXPO_PUBLIC_OTA_URL: origin },
);
mkdirSync(resolve(root, "dist"), { recursive: true });
cpSync(resolve(root, "apps/ota/dist"), resolve(root, "dist"), {
  recursive: true,
});
cpSync(resolve(root, "apps/utn/dist"), resolve(root, "dist/utn"), {
  recursive: true,
});
rmSync(resolve(root, "dist/_redirects"), { force: true });
console.log("Combined presentation assets prepared in dist/.");
