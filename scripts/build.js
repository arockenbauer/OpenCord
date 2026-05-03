// scripts/build.ts
import { execSync } from "child_process";
console.log("Building shared...");
execSync("npm run build -w packages/shared", { stdio: "inherit" });
console.log("Building server...");
execSync("npm run build -w packages/server", { stdio: "inherit" });
console.log("Building client...");
execSync("npm run build -w packages/client", { stdio: "inherit" });
console.log("Build complete!");
