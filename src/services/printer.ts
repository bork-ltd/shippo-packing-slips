import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function printPDF(filePath: string): Promise<void> {
  const printerName = process.env.CUPS_PRINTER_NAME;
  if (!printerName) {
    throw new Error('CUPS_PRINTER_NAME environment variable is required');
  }
  try {
    // lp submits the job to the CUPS queue and returns before printing completes
    const { stdout, stderr } = await execFileAsync('lp', [
      '-d',
      printerName,
      filePath,
    ]);
    const jobId = stdout.trim();
    if (jobId) {
      console.log(`  CUPS job: ${jobId}`);
    }
    if (stderr.trim()) {
      console.warn(`  lp warning: ${stderr.trim()}`);
    }
  } catch (error) {
    const exitCode = (error as NodeJS.ErrnoException).code;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to print ${filePath} on printer "${printerName}"${exitCode ? ` (${exitCode})` : ''}: ${message}`,
    );
  }
}
