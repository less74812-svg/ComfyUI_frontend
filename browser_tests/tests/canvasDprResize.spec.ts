import { expect } from '@playwright/test'

import { comfyPageFixture as test } from '@e2e/fixtures/ComfyPage'

test.describe('Canvas DPR scaling', { tag: ['@canvas'] }, () => {
  test('Canvas buffer resizes when device pixel ratio changes', async ({
    comfyPage
  }) => {
    await comfyPage.workflow.loadWorkflow('default')
    await comfyPage.nextFrame()

    const cssRect = await comfyPage.page.evaluate(() => {
      const canvas = window.app!.canvas.canvas
      const rect = canvas.getBoundingClientRect()
      return { width: rect.width, height: rect.height }
    })

    await expect
      .poll(
        () => comfyPage.page.evaluate(() => window.app!.canvas.canvas.width),
        {
          message: 'Initial canvas buffer width should equal CSS width at DPR 1'
        }
      )
      .toBe(Math.round(cssRect.width))

    const viewport = comfyPage.page.viewportSize()!
    const cdp = await comfyPage.page.context().newCDPSession(comfyPage.page)
    try {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 2,
        mobile: false
      })

      await expect
        .poll(
          () => comfyPage.page.evaluate(() => window.app!.canvas.canvas.width),
          {
            message:
              'Canvas buffer width should be 2x CSS width after DPR change'
          }
        )
        .toBe(Math.round(cssRect.width * 2))

      await expect
        .poll(
          () => comfyPage.page.evaluate(() => window.app!.canvas.canvas.height),
          {
            message:
              'Canvas buffer height should be 2x CSS height after DPR change'
          }
        )
        .toBe(Math.round(cssRect.height * 2))
    } finally {
      await cdp.send('Emulation.clearDeviceMetricsOverride')
      await cdp.detach()
    }
  })
})
