import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function takeScreenshots() {
  // Start the Vite dev server
  console.log('Starting Vite dev server...');
  const viteProcess = spawn('npm', ['run', 'start'], {
    cwd: '/home/runner/work/www.gamedev.pl/www.gamedev.pl/games/tribe2',
    stdio: 'pipe',
    shell: true
  });

  let serverReady = false;
  let serverUrl = '';

  // Wait for server to be ready
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Server failed to start within 60 seconds'));
    }, 60000);

    viteProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('Server output:', output);
      
      // Look for the local URL
      const urlMatch = output.match(/Local:\s+(http:\/\/[^\s]+)/);
      if (urlMatch) {
        serverUrl = urlMatch[1];
        serverReady = true;
        clearTimeout(timeout);
        resolve();
      }
    });

    viteProcess.stderr.on('data', (data) => {
      console.error('Server error:', data.toString());
    });

    viteProcess.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  console.log(`Server is ready at ${serverUrl}`);

  // Launch browser
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    // Navigate to the game
    console.log('Navigating to game...');
    await page.goto(serverUrl, { waitUntil: 'networkidle0', timeout: 30000 });

    // Wait a bit for any initial rendering
    await page.waitForTimeout(2000);

    // Take intro screenshot
    console.log('Taking intro screenshot...');
    await page.screenshot({ 
      path: '/tmp/intro-screenshot.png',
      fullPage: false
    });
    console.log('Intro screenshot saved to /tmp/intro-screenshot.png');

    // Try to find and click "Start Game" button
    console.log('Looking for Start Game button...');
    
    // Wait for the button to be visible
    try {
      await page.waitForSelector('button', { timeout: 5000 });
      
      // Find the "Start Game" button - try multiple approaches
      let buttonClicked = false;
      
      // Try to click button with text "Start Game"
      const buttons = await page.$$('button');
      for (const button of buttons) {
        const text = await page.evaluate(el => el.textContent, button);
        if (text && text.includes('Start Game')) {
          console.log('Found Start Game button, clicking...');
          await button.click();
          buttonClicked = true;
          break;
        }
      }

      if (!buttonClicked) {
        console.log('Could not find Start Game button by text, trying first button...');
        await page.click('button');
      }

      // Wait for game to load
      await page.waitForTimeout(3000);

      // Take game screenshot
      console.log('Taking game screenshot...');
      await page.screenshot({ 
        path: '/tmp/game-screenshot.png',
        fullPage: false
      });
      console.log('Game screenshot saved to /tmp/game-screenshot.png');

    } catch (err) {
      console.error('Error finding or clicking Start Game button:', err.message);
      console.log('Taking screenshot of current state anyway...');
      await page.screenshot({ 
        path: '/tmp/game-screenshot.png',
        fullPage: false
      });
    }

  } finally {
    await browser.close();
    viteProcess.kill();
    console.log('Browser closed and server stopped');
  }
}

takeScreenshots().catch(console.error);
