const { chromium } = require('playwright');
const path = require('path');

async function testScreenshots() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Core Admin at /core
  await page.goto('http://localhost:5173/core', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(__dirname, 'docs/screenshots/screenshot_guide_core_admin.png') });

  // Click on RAG tab
  const tabs = page.locator('[role="tab"]');
  const count = await tabs.count();
  for (let i = 0; i < count; i++) {
    const text = await tabs.nth(i).innerText();
    if (text.includes('RAG')) {
      await tabs.nth(i).click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(__dirname, 'docs/screenshots/screenshot_guide_core_admin_rag_tab.png') });
      break;
    }
  }

  await browser.close();
  console.log('Captures /core et RAG réussies');
}

testScreenshots().catch(console.error);
