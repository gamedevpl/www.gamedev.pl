import puppeteer, { type Browser } from 'puppeteer';
import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = join(__dirname, '..');
const shadersDir = join(projectRoot, 'src', 'game', 'renderer', 'shaders');

/**
 * This function is executed in the browser context via page.evaluate().
 * It attempts to create a WebGPU shader module from the provided code.
 * @param shaderCode The WGSL shader code to validate.
 * @returns A promise that resolves to an error message string if validation fails, or null if it succeeds.
 */
async function validateShaderInBrowser(shaderCode: string): Promise<string | null> {
  try {
    if (!navigator.gpu) {
      return 'WebGPU API not available in this browser environment.';
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      return 'Failed to request a WebGPU adapter.';
    }
    const device = await adapter.requestDevice();

    // The core of the validation: creating a shader module.
    // This will throw a GPUValidationError if the shader code is invalid.
    const module = device.createShaderModule({
      code: shaderCode,
    });

    const info = await module.getCompilationInfo(); // returns GPUCompilationInfo

    return info.messages.length === 0
      ? null
      : JSON.stringify(
          info.messages.map((m) => ({
            type: m.type, // 'error' | 'warning' | 'info'
            line: m.lineNum, // 1-based
            column: m.linePos, // 1-based
            length: m.length,
            message: m.message,
            snippet: shaderCode.split('\n')[m.lineNum - 1] || '',
          })),
          null,
          2,
        );
  } catch (e) {
    // Return the error message to the Node.js context.
    if (e instanceof Error) {
      return e.message;
    }
    return String(e);
  }
}

async function main() {
  console.log('🚀 Starting WGSL shader validation...');
  let browser: Browser | null = null;

  try {
    const files = await readdir(shadersDir);
    const shaderFiles = files.filter((file) => file.endsWith('.wgsl'));

    if (shaderFiles.length === 0) {
      console.log('✅ No .wgsl shaders found. Nothing to validate.');
      process.exit(0);
    }

    console.log(`🔎 Found ${shaderFiles.length} shader(s) to validate...`);

    browser = await puppeteer.launch({
      headless: true,
      // These arguments are crucial for enabling WebGPU in a headless environment.
      args: ['--enable-unsafe-webgpu'],
    });

    const page = await browser.newPage();
    await page.goto('https://webgpureport.org/');
    let hasErrors = false;

    for (const shaderFile of shaderFiles) {
      const filePath = join(shadersDir, shaderFile);
      const shaderCode = await readFile(filePath, 'utf-8');

      // Run the validation function in the browser's context.
      const outputContent = await page.evaluate(validateShaderInBrowser, shaderCode);

      if (outputContent) {
        console.error(`⚠️ Output from validation of ${shaderFile}:\n${outputContent}\n`);
        hasErrors = true;
      } else {
        console.log(`✅ Shader ${shaderFile} validated successfully.`);
      }
    }

    if (hasErrors) {
      console.error('Shader validation failed. See errors above.');
      process.exit(1);
    } else {
      console.log('\n🎉 All shaders validated successfully!');
      process.exit(0);
    }
  } catch (error) {
    console.error('An unexpected error occurred during the validation process:', error);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

main();
