const { test, expect } = require("@playwright/test");

async function readGameObjects(page) {
  return page.evaluate(async () => {
    const response = await window.c3_callFunction("Test_GetVisibleObjects", []);
    return JSON.parse(response);
  });
}

test("деталь исчезает, когда игрок перетаскивает её на тело", async ({ page }) => {
  await page.goto("");
  await page.waitForFunction(() => typeof window.c3_callFunction === "function");

  await expect.poll(async () => {
    const { details, bodies } = await readGameObjects(page);
    return details.length > 0 && bodies.length > 0;
  }, { message: "Игра не создала деталь и тело для проверки" }).toBe(true);

  const before = await readGameObjects(page);
  const detail = before.details[0];
  const body = before.bodies[0];

  await page.mouse.move(detail.x, detail.y);
  await page.mouse.down();
  await page.mouse.move(body.x, body.y, { steps: 12 });
  await page.mouse.up();

  await expect.poll(async () => {
    const { details } = await readGameObjects(page);
    return details.some(item => item.uid === detail.uid);
  }, { timeout: 5_000, message: "Перетащенная деталь не исчезла" }).toBe(false);
});
