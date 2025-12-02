import puppeteer from 'puppeteer';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function takeScreenshots() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/usr/bin/google-chrome',
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

    // Try different ports
    const ports = [5173, 5174, 5175];
    let connected = false;
    let serverUrl = '';

    for (const port of ports) {
      try {
        serverUrl = `http://localhost:${port}`;
        console.log(`Trying to connect to ${serverUrl}...`);
        await page.goto(serverUrl, { waitUntil: 'networkidle0', timeout: 10000 });
        connected = true;
        console.log(`Successfully connected to ${serverUrl}`);
        break;
      } catch (err) {
        console.log(`Port ${port} not available`);
      }
    }

    if (!connected) {
      throw new Error('Could not connect to any dev server');
    }

    // Wait a bit for any initial rendering
    await delay(2000);

    // Take intro screenshot
    console.log('Taking intro screenshot...');
    await page.screenshot({ 
      path: '/tmp/intro-screenshot.png',
      fullPage: false
    });
    console.log('✓ Intro screenshot saved to /tmp/intro-screenshot.png');

    // Try to find and click "Start Game" button
    console.log('Looking for Start Game button...');
    
    try {
      // Wait for any button to appear
      await page.waitForSelector('button', { timeout: 5000 });
      
      // Find the "Start Game" button
      const buttons = await page.$$('button');
      let buttonClicked = false;
      
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
        console.log('Trying to click first visible button...');
        await page.click('button');
      }

      // Wait for game to load and render
      await delay(4000);

      // Take game screenshot
      console.log('Taking game screenshot...');
      await page.screenshot({ 
        path: '/tmp/game-screenshot.png',
        fullPage: false
      });
      console.log('✓ Game screenshot saved to /tmp/game-screenshot.png');

    } catch (err) {
      console.error('Error interacting with game:', err.message);
      console.log('Taking screenshot of current state...');
      await page.screenshot({ 
        path: '/tmp/game-screenshot.png',
        fullPage: false
      });
      console.log('✓ Fallback screenshot saved');
    }

  } finally {
    await browser.close();
    console.log('Browser closed');
  }
}

takeScreenshots().catch(console.error);
