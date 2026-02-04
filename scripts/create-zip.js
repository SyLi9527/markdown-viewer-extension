import { execSync } from 'child_process';

export function createZip(outdir, zipPath) {
  if (process.platform === 'win32') {
    const psCommand = `Compress-Archive -Path * -DestinationPath '${zipPath}' -Force`;
    execSync(`powershell -NoProfile -Command "${psCommand}"`, { cwd: outdir, stdio: 'ignore' });
    return;
  }

  if (process.platform === 'darwin') {
    execSync(`ditto -c -k --sequesterRsrc . "${zipPath}"`, { cwd: outdir, stdio: 'ignore' });
    return;
  }

  try {
    execSync('zip -v', { stdio: 'ignore' });
  } catch (error) {
    const err = new Error('zip command not found. Install zip or run the build on Windows/macOS (built-in packaging is used automatically).');
    err.cause = error;
    throw err;
  }

  execSync(`zip -r "${zipPath}" .`, { cwd: outdir, stdio: 'ignore' });
}
