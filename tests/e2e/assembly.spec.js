const { test, expect } = require('@playwright/test');

const PLAY_AREA = { left: 70, right: 730, top: 300, bottom: 1_300 };

test.setTimeout(90_000);

async function readState(page) {
  return page.evaluate(async () => {
    const result = await window.c3_callFunction('Test_GetVisibleObjects', []);
    return result ? JSON.parse(result) : null;
  });
}

function isInPlayArea(item) {
  return (
    item.x > PLAY_AREA.left &&
    item.y > PLAY_AREA.top &&
    item.x < PLAY_AREA.right &&
    item.y < PLAY_AREA.bottom
  );
}

function includesPart(anchor, detailType) {
  return anchor.attachedParts.includes(`|${detailType}|`);
}

function findAssemblyPair(state, sameColor) {
  const anchors = state.details.filter(detail =>
    isInPlayArea(detail) && detail.detailType === 'body'
  );
  const parts = state.details.filter(detail =>
    isInPlayArea(detail) && detail.detailType !== 'body'
  );

  for (const anchor of anchors) {
    const body = state.bodies.find(item =>
      item.parentDetailId === anchor.uid && isInPlayArea(item)
    );
    if (!body) continue;

    for (const part of parts) {
      if (
        part.toyType === anchor.toyType &&
        (part.detailColor === anchor.detailColor) === sameColor &&
        !includesPart(anchor, part.detailType)
      ) {
        return { anchor, body, part };
      }
    }
  }

  return null;
}

async function openGame(page) {
  await page.goto(`?testRun=${Date.now()}`);
  await page.waitForFunction(() => typeof window.c3_callFunction === 'function');
}

async function waitForPair(page, sameColor, timeout = 35_000) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const state = await readState(page);
    const pair = state && findAssemblyPair(state, sameColor);
    if (pair) return pair;
    await page.waitForTimeout(500);
  }

  throw new Error(
    sameColor
      ? 'Не появились видимые деталь и тело одного цвета для проверки сборки'
      : 'Не появились видимые деталь и тело разных цветов для проверки запрета сборки'
  );
}

async function dragToBody(page, part, anchorUid) {
  await page.mouse.move(part.x, part.y);
  await page.mouse.down();
  await page.waitForTimeout(150);

  const held = await readState(page);
  const body = held.bodies.find(item => item.parentDetailId === anchorUid);
  expect(body, 'Тело исчезло до отпускания детали').toBeTruthy();

  await page.mouse.move(body.x, body.y, { steps: 12 });
  await page.waitForTimeout(250);
  await page.mouse.up();
  await page.waitForTimeout(800);
}

async function attachSameColorPart(page) {
  let lastState = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { anchor, part } = await waitForPair(page, true);
    await dragToBody(page, part, anchor.uid);

    const after = await readState(page);
    const anchorAfter = after.details.find(detail => detail.uid === anchor.uid);
    const partWasAttached =
      anchorAfter &&
      includesPart(anchorAfter, part.detailType) &&
      !after.details.some(detail => detail.uid === part.uid);

    if (partWasAttached) return { anchor, part, after };
    lastState = { anchor, part, anchorAfter };
    await page.waitForTimeout(400);
  }

  throw new Error(`Деталь того же цвета не присоединилась: ${JSON.stringify(lastState)}`);
}

test('деталь того же цвета присоединяется к телу', async ({ page }) => {
  await openGame(page);
  const { anchor, part, after } = await attachSameColorPart(page);
  const anchorAfter = after.details.find(detail => detail.uid === anchor.uid);

  expect(anchorAfter, 'Тело исчезло во время сборки').toBeTruthy();
  expect(anchorAfter.attachedParts).toContain(`|${part.detailType}|`);
  expect(after.details.some(detail => detail.uid === part.uid)).toBe(false);
});

test('деталь другого цвета не присоединяется к телу', async ({ page }) => {
  await openGame(page);
  const { anchor, part } = await waitForPair(page, false);
  const attachedPartsBefore = anchor.attachedParts;

  await dragToBody(page, part, anchor.uid);

  const after = await readState(page);
  const anchorAfter = after.details.find(detail => detail.uid === anchor.uid);
  const partAfter = after.details.find(detail => detail.uid === part.uid);

  expect(anchorAfter, 'Тело исчезло после неподходящей детали').toBeTruthy();
  expect(anchorAfter.attachedParts).toBe(attachedPartsBefore);
  expect(partAfter, 'Деталь другого цвета ошибочно присоединилась').toBeTruthy();
  expect(partAfter.isDragging).toBe(false);
});
