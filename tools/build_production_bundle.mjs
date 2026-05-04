import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

function run(command, args, options = {}) {
  const printable = [command, ...args].join(' ');
  const result =
    process.platform === 'win32'
      ? spawnSync(printable, {
          cwd: root,
          stdio: 'inherit',
          shell: true,
          ...options,
        })
      : spawnSync(command, args, {
          cwd: root,
          stdio: 'inherit',
          ...options,
        });
  if (result.status !== 0) {
    throw new Error(
      `${printable} failed with exit code ${result.status}${result.error ? `: ${result.error.message}` : ''}`,
    );
  }
}

function runOptional(command, args, label) {
  try {
    run(command, args);
  } catch (error) {
    console.warn(`${label} skipped: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function copyDirectoryContents(source, target) {
  if (!existsSync(source)) {
    throw new Error(`Build output missing: ${source}`);
  }
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true });
}

run('npm', ['run', 'build']);
copyDirectoryContents(join(root, 'dist'), join(root, 'app', 'static', 'admin'));

runOptional('npm', ['--prefix', 'sales-assistant/frontend', 'run', 'build'], 'Sales assistant frontend build');
runOptional('npm', ['--prefix', 'sales-assistant/backend', 'run', 'build'], 'Sales assistant backend build');

console.log('Production bundles are ready.');
