#!/usr/bin/env node
/** Capture genuine ccb.h666h.com mobile pages for the portrait promo.
 * This is read-only: it does not generate tests, submit answers or create shares.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const out = new URL('../assets/real-pages/', import.meta.url).pathname;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({
  viewport: { width: 390, height: 693 },
  deviceScaleFactor: 3,
  locale: 'zh-CN',
  reducedMotion: 'reduce',
});
page.setDefaultTimeout(12_000);

try {
  await page.goto('https://ccb.h666h.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${out}01-home-hero.png` });

  await page.getByText('挑一个好奇，出发吧', { exact: true }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${out}02-home-explore.png` });

  const prompt = page.locator('textarea').first();
  await prompt.scrollIntoViewIfNeeded();
  await prompt.fill('我更适合怎样的相处方式？');
  await page.evaluate(() => window.scrollBy(0, 120));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}03-home-prompt.png` });

  await page.goto('https://ccb.h666h.com/t/test-eXr17tvojN4l', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${out}04-test-intro.png` });

  await page.getByText('开始测试', { exact: true }).click();
  await page.waitForTimeout(350);
  await page.getByText('运算与控制', { exact: true }).click();
  await page.screenshot({ path: `${out}05-question-first-selected.png` });

  const middle = page.getByText('5. IP 地址的主要作用是什么？', { exact: true });
  await middle.scrollIntoViewIfNeeded();
  await page.getByText('标识网络中的设备', { exact: true }).click();
  await page.screenshot({ path: `${out}06-question-middle-selected.png` });

  const last = page.getByText('10. 收到可疑中奖链接时，较安全的做法是？', { exact: true });
  await last.scrollIntoViewIfNeeded();
  await page.getByText('不点击并删除', { exact: true }).click();
  await page.screenshot({ path: `${out}07-question-last-selected.png` });
  console.log(`Captured real pages from ${page.url()} into ${out}`);
} finally {
  await browser.close();
}
