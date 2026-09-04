import { expect, test, type Locator, type Page } from '@playwright/test';
import path from 'node:path';

const AUTHENTICATED_STORAGE_STATE = path.join(__dirname, '.auth/user.json');
const TASK_TITLE = 'Работа над проектом';

test.use({ storageState: AUTHENTICATED_STORAGE_STATE });

// Drags `source` onto `target` via a manual pointer sequence (mousedown ->
// several intermediate moves -> mouseup) rather than Playwright's `dragTo()`
// helper: dnd-kit's sensors track real `pointerdown`/`pointermove`/
// `pointerup` events (not the HTML5 `draggable` attribute `dragTo()`
// simulates), and only start tracking a drag once the pointer clears the
// 8px activation distance configured in `planner-dnd-context.tsx`.
async function dragBetween(page: Page, source: Locator, target: Locator) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error('dragBetween: source or target has no bounding box (not visible/attached)');
  }

  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;
  const endX = targetBox.x + targetBox.width / 2;
  const endY = targetBox.y + targetBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Clear the activation distance before making the rest of the move, so
  // dnd-kit actually registers a drag start instead of treating this as a
  // click.
  await page.mouse.move(startX + 12, startY + 12, { steps: 5 });
  await page.mouse.move(endX, endY, { steps: 12 });
  await page.mouse.up();
}

// A local wall-clock instant `daysFromNow` days after today, at
// `hour`:`minute` - matches how `DroppableTimeSlot` computes its own
// `data-slot-start` (`value.toISOString()` from a local-time `Date`), so
// this always resolves to the same slot the browser renders, in whichever
// timezone the test runs under.
function localInstant(daysFromNow: number, hour: number, minute = 0): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysFromNow, hour, minute, 0, 0);
}

function timeSlot(page: Page, instant: Date): Locator {
  return page.locator(`[data-slot-start="${instant.toISOString()}"]`);
}

function dateCell(page: Page, instant: Date): Locator {
  const dateKey = `${instant.getFullYear()}-${String(instant.getMonth() + 1).padStart(2, '0')}-${String(
    instant.getDate(),
  ).padStart(2, '0')}`;
  return page.locator(`[data-cell-date="${dateKey}"]`);
}

test('backlog task can be scheduled, moved, resized, and completed from the calendar', async ({ page }) => {
  await page.goto('/planner');

  // Wait for the local database (and its worker bundle) to finish
  // initializing before doing anything - see `offline-backlog.spec.ts` for
  // the same pattern.
  await expect(page.getByRole('button', { name: 'Новая задача' })).toBeVisible();

  // 1. Create the task in Backlog.
  await page.getByRole('button', { name: 'Новая задача' }).click();
  await page.getByLabel('Название').fill(TASK_TITLE);
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText(TASK_TITLE)).toBeVisible();

  // Switch to Week view, where individual timed slots are addressable.
  await page.getByRole('button', { name: 'Week' }).click();
  await expect(page.getByTestId('planner-calendar')).toHaveAttribute('data-view', 'week');

  // 2. Drag it to tomorrow at 10:00.
  const tomorrow10 = localInstant(1, 10, 0);
  await dragBetween(page, page.getByLabel(`Перетащить: ${TASK_TITLE}`), timeSlot(page, tomorrow10));

  // 3. It disappears from Backlog and appears in the Week view.
  await expect(page.getByLabel(`Перетащить: ${TASK_TITLE}`)).toHaveCount(0);
  const event = page.locator(`[data-task-id]`, { hasText: TASK_TITLE });
  await expect(event).toBeVisible();

  // 4. Move it from 10:00 to 14:00 on the same day.
  const tomorrow14 = localInstant(1, 14, 0);
  await dragBetween(page, event, timeSlot(page, tomorrow14));
  await expect(event).toBeVisible();

  // 5. Move it to the following day (still 14:00).
  const dayAfter14 = localInstant(2, 14, 0);
  await dragBetween(page, event, timeSlot(page, dayAfter14));
  await expect(event).toBeVisible();

  // 6. Resize it to 90 minutes: the resize handle adds 1/3 minute per
  // pixel dragged, snapped to 15 minutes - 90px adds exactly 30 minutes to
  // the default 60-minute drop duration.
  const resizeHandle = page.locator('[aria-label="Изменить длительность"]');
  const handleBox = await resizeHandle.boundingBox();
  if (!handleBox) throw new Error('resize handle not visible');
  const handleX = handleBox.x + handleBox.width / 2;
  const handleY = handleBox.y + handleBox.height / 2;
  await page.mouse.move(handleX, handleY);
  await page.mouse.down();
  await page.mouse.move(handleX, handleY + 90, { steps: 6 });
  await page.mouse.up();

  // 7. Select that day and complete it from "Дела на день". Dispatches via
  // the DOM `click()` method directly on the target element, rather than a
  // coordinate-based Playwright click (even with `force: true`, which still
  // clicks *at a point* and would land on react-big-calendar's
  // `.rbc-events-container` - an empty overlay stacked above the background
  // time-slot divs across the whole day column): this guarantees the click
  // reaches the exact element under test regardless of that stacking.
  const emptyMorningSlot = timeSlot(page, localInstant(2, 6, 0));
  await emptyMorningSlot.evaluate((el) => (el as HTMLElement).click());

  const selectedDayList = page.getByTestId('selected-day-list');
  const selectedDayCheckbox = selectedDayList.getByRole('checkbox', { name: `Выполнено: ${TASK_TITLE}` });
  await expect(selectedDayCheckbox).toBeVisible();
  await selectedDayCheckbox.click();
  await expect(selectedDayList.getByText(TASK_TITLE, { exact: true })).toHaveClass(/line-through/);

  // 8. Reload and assert the scheduled/completed state persists. The
  // calendar's view/date/selected-day state is component-local (not
  // persisted), so it comes back up on Month view showing today - re-select
  // the day via its month-view cell (always rendered, even for a date
  // outside the "titled" month, since react-big-calendar pads Month view to
  // full weeks) rather than assuming Week view already shows the right week.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Новая задача' })).toBeVisible();
  await dateCell(page, localInstant(2, 0, 0)).evaluate((el) => (el as HTMLElement).click());

  await expect(selectedDayList.getByRole('checkbox', { name: `Выполнено: ${TASK_TITLE}` })).toBeChecked();
});
