const { test, expect } = require('@playwright/test');

const VIEWPORT = { width: 1024, height: 1365 };

async function readState(page) {
  return page.evaluate(async () => {
    const result = await window.c3_callFunction('Test_GetVisibleObjects', []);
    return result ? JSON.parse(result) : null;
  });
}

function isVisible(item) {
  return item.x > 0 && item.y > 0 && item.x < VIEWPORT.width && item.y < VIEWPORT.height;
}

function distance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

async function openReadyGame(page) {
  await page.goto(`?testRun=${Date.now()}`);
  await page.waitForFunction(() => typeof window.c3_callFunction === 'function');
  await page.waitForTimeout(10_000);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const state = await readState(page);
    if (state?.details?.length && state?.cells?.length) return state;
    await page.waitForTimeout(1_000);
  }

  throw new Error('Игра не вернула состояние деталей и ячеек');
}

async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.waitForTimeout(250);
  await page.mouse.up();
}

function pickDetailInCell(state) {
  return state.details.find(detail =>
    isVisible(detail) &&
    detail.currentCellId !== -1 &&
    state.cells.some(cell => cell.uid === detail.currentCellId)
  );
}

test('захваченная деталь останавливается на время перетаскивания', async ({ page }) => {
  const before = await openReadyGame(page);
  const detail = pickDetailInCell(before);
  expect(detail, 'Не найдена видимая деталь в ячейке').toBeTruthy();

  await page.mouse.move(detail.x, detail.y);
  await page.mouse.down();
  await page.waitForTimeout(300);

  const held = await readState(page);
  const heldDetail = held.details.find(item => item.uid === detail.uid);
  expect(heldDetail.isDragging).toBe(true);

  await page.waitForTimeout(700);
  const later = await readState(page);
  const laterDetail = later.details.find(item => item.uid === detail.uid);
  expect(distance(heldDetail, laterDetail), 'Деталь продолжила ехать, пока игрок держал её').toBeLessThan(3);

  await page.mouse.up();
});

test('деталь встаёт в свободную ячейку и освобождает прежнюю', async ({ page }) => {
  const before = await openReadyGame(page);
  const detail = pickDetailInCell(before);
  expect(detail, 'Не найдена деталь для переноса').toBeTruthy();

  const source = before.cells.find(cell => cell.uid === detail.currentCellId);
  const target = before.cells.find(cell =>
    isVisible(cell) && cell.state === 'empty' && distance(cell, detail) > detail.width
  );
  expect(source, 'Не найдена исходная ячейка детали').toBeTruthy();
  expect(target, 'Не найдена видимая свободная ячейка').toBeTruthy();

  await drag(page, detail, target);
  await page.waitForTimeout(300);

  const after = await readState(page);
  const moved = after.details.find(item => item.uid === detail.uid);
  const sourceAfter = after.cells.find(cell => cell.uid === source.uid);
  const targetAfter = after.cells.find(cell => cell.uid === target.uid);

  expect(moved.currentCellId).toBe(target.uid);
  expect(moved.previousCellId).toBe(-1);
  expect(moved.isDragging).toBe(false);
  expect(sourceAfter.state).toBe('empty');
  expect(targetAfter.state).toBe('occupied');
});

test('деталь возвращается в прежнюю ячейку, если отпустить её мимо сетки', async ({ page }) => {
  const before = await openReadyGame(page);
  const detail = pickDetailInCell(before);
  expect(detail, 'Не найдена деталь для проверки возврата').toBeTruthy();

  await page.mouse.move(detail.x, detail.y);
  await page.mouse.down();
  await page.waitForTimeout(150);

  const held = await readState(page);
  const heldDetail = held.details.find(item => item.uid === detail.uid);
  const source = held.cells.find(cell => cell.uid === heldDetail.previousCellId);
  expect(heldDetail.isDragging, 'Деталь не перешла в режим перетаскивания').toBe(true);
  expect(source, 'При захвате не запомнилась исходная ячейка').toBeTruthy();

  await page.mouse.move(20, 100, { steps: 12 });
  await page.waitForTimeout(250);
  await page.mouse.up();
  await page.waitForTimeout(300);

  const after = await readState(page);
  const returned = after.details.find(item => item.uid === detail.uid);
  const sourceAfter = after.cells.find(cell => cell.uid === source.uid);

  expect(returned.currentCellId).toBe(heldDetail.previousCellId);
  expect(returned.previousCellId).toBe(-1);
  expect(returned.isDragging).toBe(false);
  expect(sourceAfter.state).toBe('occupied');
});
