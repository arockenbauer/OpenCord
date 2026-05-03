// scripts/seed.ts
import { execSync } from "child_process";
console.log("Running database seed...");
execSync("npm run db:seed -w packages/server", { stdio: "inherit" });
console.log("Seed complete!");
