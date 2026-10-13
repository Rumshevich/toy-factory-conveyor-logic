const { test, expect } = require("@playwright/test");

async function readGameObjects(page) {
  return page.evaluate(async () => {
    const response = await window.c3_callFunction("Test_GetVisibleObjects", []);
    return response ? JSON.parse(response) : null;
  });
}

test("деталь исчезает, когда игрок перетаскивает её на тело", async ({ page }) => {
  await page.goto("?playwright=cd150d5");
  await page.waitForFunction(() => typeof window.c3_callFunction === "function");
  await page.waitForTimeout(10_000);

  let before = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    before = await readGameObjects(page);
    if (before?.details?.length && before?.bodies?.length) break;
    await page.waitForTimeout(1_000);
  }
  expect(before, "Тестовый датчик не вернул состояние игры").toBeTruthy();

  const isVisible = item => item.x > 0 && item.y > 0 && item.x < 1024 && item.y < 1365;
  const details = before.details.filter(isVisible);
  const body = before.bodies.find(isVisible);
  expect(details.length, "Не найдена видимая деталь для перетаскивания").toBeGreaterThan(0);
  expect(body, "Не найдено тело для перетаскивания").toBeTruthy();

  let attached = false;
  for (const detail of details) {
    await page.mouse.move(detail.x, detail.y);
    await page.mouse.down();
    await page.waitForTimeout(150);
    await page.mouse.move(body.x, body.y, { steps: 12 });
    await page.waitForTimeout(300);
    await page.mouse.up();
    await page.waitForTimeout(700);

    const afterDrop = await readGameObjects(page);
    if (!afterDrop.details.some(item => item.uid === detail.uid)) {
      attached = true;
      break;
    }
  }

  expect(attached, "Ни одна видимая деталь не исчезла после переноса на тело").toBe(true);
});
