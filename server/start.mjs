import { existsSync } from "node:fs";
import { startServices } from "./services.mjs";
if (existsSync(".env")) process.loadEnvFile(".env");
const services = await startServices();
console.log(`OTA API: ${services.otaUrl}\nUTN API: ${services.utnUrl}`);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await services.close();
    process.exit(0);
  });
