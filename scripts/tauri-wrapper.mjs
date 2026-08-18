#!/usr/bin/env node
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureLinuxdeploy } from "./ensure-linuxdeploy.mjs";

const args = process.argv.slice(2);

/** npm, pnpm, or yarn — matches the package manager that invoked this script. */
function packageManager() {
  const userAgent = process.env.npm_config_user_agent ?? "";
  if (userAgent.startsWith("pnpm")) return "pnpm";
  if (userAgent.startsWith("yarn")) return "yarn";
  return "npm";
}

function run(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      stdio: "inherit",
      shell: process.platform === "win32",
      ...options,
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });
  });
}

async function runBuild(pm) {
  if (pm === "npm") {
    await run("npm", ["run", "build"]);
  } else {
    await run(pm, ["build"]);
  }
}

function linuxBuildEnv() {
  if (process.platform !== "linux") return process.env;
  return {
    ...process.env,
    // AppImageLauncher binfmt on Arch breaks Tauri's linuxdeploy + plugin ELFs named *.AppImage.
    APPIMAGELAUNCHER_DISABLE: process.env.APPIMAGELAUNCHER_DISABLE ?? "1",
    // linuxdeploy's bundled strip chokes on .relr.dyn on rolling distros (Arch).
    NO_STRIP: process.env.NO_STRIP ?? "true",
    APPIMAGE_EXTRACT_AND_RUN: process.env.APPIMAGE_EXTRACT_AND_RUN ?? "1",
  };
}

async function runTauri(pm, tauriArgs, env = process.env) {
  // The `--` separator stops npm/pnpm from swallowing flags after the package
  // name: `--config` is also an npm config option, so without it npm consumed
  // the flag and forwarded its VALUE (e.g. the local-config.json path) as a
  // stray positional arg that tauri then passed to `cargo build`, failing the
  // build with "unexpected argument '<value>' found".
  await run(pm, ["exec", "tauri", "--", ...tauriArgs], { env });
}

function tauriBuildArgs(args) {
  const subcommand = args[0]?.toLowerCase();
  if (subcommand !== "build" || process.env.TAURI_SIGNING_PRIVATE_KEY) {
    return args;
  }
  // Local builds without release signing keys should still succeed.
  // Pass the override as a config FILE rather than an inline JSON string: on
  // Windows the wrapper spawns through cmd (shell: true), and the inline
  // JSON's double quotes get mangled by cmd into a stray
  // `{bundle:{createUpdaterArtifacts:false}}` argument that tauri forwards to
  // cargo, failing the build. A plain file path needs no quoting.
  const dir = mkdtempSync(join(tmpdir(), "mooshie-tauri-"));
  const configPath = join(dir, "local-config.json");
  writeFileSync(configPath, '{"bundle":{"createUpdaterArtifacts":false}}', "utf8");
  return [...args, "--config", configPath];
}

async function main() {
  const pm = packageManager();
  const firstArg = args[0]?.toLowerCase();

  if (firstArg === "dev" || firstArg === "build") {
    await runBuild(pm);
  }

  if (firstArg === "build" && process.platform === "linux") {
    await ensureLinuxdeploy();
  }

  const env = firstArg === "build" ? linuxBuildEnv() : process.env;
  await runTauri(pm, tauriBuildArgs(args), env);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
