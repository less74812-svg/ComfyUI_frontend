import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'

import type { LGraphNode, NodeId } from '@/lib/litegraph/src/LGraphNode'
import type { Bounds } from '@/renderer/core/layout/types'

vi.mock('@vueuse/core', () => ({
  useResizeObserver: vi.fn()
}))

vi.mock('@/utils/litegraphUtil', () => ({
  resolveNode: vi.fn()
}))

vi.mock('@/stores/nodeOutputStore', () => {
  const getNodeImageUrls = vi.fn()
  return {
    useNodeOutputStore: () => ({
      getNodeImageUrls,
      nodeOutputs: {},
      nodePreviewImages: {}
    })
  }
})

import { useNodeOutputStore } from '@/stores/nodeOutputStore'
import { resolveNode } from '@/utils/litegraphUtil'

import type { useImageCrop as UseImageCropFn } from './useImageCrop'
import { useImageCrop } from './useImageCrop'

function createMockNode(
  overrides: Partial<Record<string, unknown>> = {}
): LGraphNode {
  return {
    getInputNode: vi.fn().mockReturnValue(null),
    getInputLink: vi.fn(),
    ...overrides
  } as unknown as LGraphNode
}

function createPointerEvent(
  type: string,
  clientX: number,
  clientY: number
): PointerEvent {
  const event = new PointerEvent(type, { clientX, clientY })
  Object.defineProperty(event, 'target', {
    value: {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn()
    }
  })
  return event
}

function createOptions(modelValue?: Partial<Bounds>) {
  const bounds: Bounds = {
    x: 0,
    y: 0,
    width: 512,
    height: 512,
    ...modelValue
  }
  return {
    imageEl: ref<HTMLImageElement | null>(null),
    containerEl: ref<HTMLDivElement | null>(null),
    modelValue: ref(bounds)
  }
}

// Single wrapper component used to trigger onMounted lifecycle
const Wrapper = defineComponent({
  props: { run: { type: Function, required: true } },
  setup(props) {
    props.run()
    return () => null
  }
})

function mountComposable(
  options: ReturnType<typeof createOptions>,
  nodeId: NodeId = 1
) {
  let result!: ReturnType<typeof UseImageCropFn>

  mount(Wrapper, {
    props: { run: () => (result = useImageCrop(nodeId, options)) }
  })

  return result
}

function setup(modelValue?: Partial<Bounds>, nodeId: NodeId = 1) {
  const options = createOptions(modelValue)
  const result = mountComposable(options, nodeId)
  return { ...result, options }
}

function setupWithImage(
  naturalWidth: number,
  naturalHeight: number,
  containerWidth: number,
  containerHeight: number,
  modelValue?: Partial<Bounds>
) {
  const options = createOptions({
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    ...modelValue
  })

  options.imageEl.value = {
    naturalWidth,
    naturalHeight
  } as HTMLImageElement

  options.containerEl.value = {
    clientWidth: containerWidth,
    clientHeight: containerHeight,
    getBoundingClientRect: () => ({
      width: containerWidth,
      height: containerHeight,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: containerWidth,
      bottom: containerHeight,
      toJSON: () => {}
    })
  } as unknown as HTMLDivElement

  const result = mountComposable(options)
  result.handleImageLoad()
  return result
}

describe('useImageCrop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveNode).mockReturnValue(undefined)
  })

  describe('crop computed properties', () => {
    it('reads crop dimensions from modelValue', () => {
      const { cropX, cropY, cropWidth, cropHeight } = setup({
        x: 10,
        y: 20,
        width: 200,
        height: 300
      })

      expect(cropX.value).toBe(10)
      expect(cropY.value).toBe(20)
      expect(cropWidth.value).toBe(200)
      expect(cropHeight.value).toBe(300)
    })

    it('writes crop dimensions back to modelValue', () => {
      const { cropX, cropY, cropWidth, cropHeight, options } = setup()

      cropX.value = 50
      cropY.value = 60
      cropWidth.value = 100
      cropHeight.value = 150

      expect(options.modelValue.value).toMatchObject({
        x: 50,
        y: 60,
        width: 100,
        height: 150
      })
    })

    it('defaults cropWidth/cropHeight to 512 when modelValue is 0', () => {
      const { cropWidth, cropHeight } = setup({ width: 0, height: 0 })

      expect(cropWidth.value).toBe(512)
      expect(cropHeight.value).toBe(512)
    })
  })

  describe('cropBoxStyle', () => {
    it('computes style from crop state and scale factor', () => {
      const { cropBoxStyle } = setup({
        x: 100,
        y: 50,
        width: 200,
        height: 150
      })

      // With default scaleFactor=1 and offsets=0, border=2
      expect(cropBoxStyle.value).toMatchObject({
        left: `${100 * 1 - 2}px`,
        top: `${50 * 1 - 2}px`,
        width: `${200 * 1}px`,
        height: `${150 * 1}px`
      })
    })
  })

  describe('selectedRatio', () => {
    it('defaults to custom when no ratio is locked', () => {
      const { selectedRatio } = setup()
      expect(selectedRatio.value).toBe('custom')
    })

    it('sets lockedRatio when selecting a predefined ratio', () => {
      const { selectedRatio, isLockEnabled } = setup()

      selectedRatio.value = '16:9'

      expect(isLockEnabled.value).toBe(true)
      expect(selectedRatio.value).toBe('16:9')
    })

    it('clears lockedRatio when selecting custom', () => {
      const { selectedRatio, isLockEnabled } = setup()

      selectedRatio.value = '1:1'
      expect(isLockEnabled.value).toBe(true)

      selectedRatio.value = 'custom'
      expect(isLockEnabled.value).toBe(false)
    })
  })

  describe('isLockEnabled', () => {
    it('derives locked ratio from current crop dimensions', () => {
      const { isLockEnabled, selectedRatio } = setup({
        width: 400,
        height: 200
      })

      isLockEnabled.value = true

      // Should compute ratio as 400/200 = 2, not match any preset
      expect(selectedRatio.value).toBe('custom')
      expect(isLockEnabled.value).toBe(true)
    })

    it('unlocks when set to false', () => {
      const { isLockEnabled, selectedRatio } = setup()

      isLockEnabled.value = true
      isLockEnabled.value = false

      expect(isLockEnabled.value).toBe(false)
      expect(selectedRatio.value).toBe('custom')
    })
  })

  describe('applyLockedRatio (via selectedRatio setter)', () => {
    it('adjusts height to match 1:1 ratio when image is loaded', () => {
      const result = setupWithImage(1000, 1000, 500, 500, {
        x: 0,
        y: 0,
        width: 200,
        height: 400
      })

      result.selectedRatio.value = '1:1'

      expect(result.cropWidth.value).toBe(200)
      expect(result.cropHeight.value).toBe(200)
    })

    it('clamps height and adjusts width at naturalHeight boundary', () => {
      const result = setupWithImage(1000, 1000, 500, 500, {
        x: 0,
        y: 900,
        width: 200,
        height: 100
      })

      result.selectedRatio.value = '1:1'

      // Only 100px remain (1000 - 900), so height=100, width=100
      expect(result.cropHeight.value).toBeLessThanOrEqual(100)
      expect(result.cropWidth.value).toBe(result.cropHeight.value)
    })
  })

  describe('resizeHandles', () => {
    it('returns all 8 handles when ratio is unlocked', () => {
      const { resizeHandles } = setup()

      expect(resizeHandles.value).toHaveLength(8)
    })

    it('returns only corner handles when ratio is locked', () => {
      const { resizeHandles, isLockEnabled } = setup()

      isLockEnabled.value = true

      const directions = resizeHandles.value.map((h) => h.direction)
      expect(directions).toEqual(['nw', 'ne', 'sw', 'se'])
      expect(resizeHandles.value).toHaveLength(4)
    })
  })

  describe('handleImageLoad', () => {
    it('sets isLoading to false', () => {
      const { isLoading, handleImageLoad } = setup()

      isLoading.value = true
      handleImageLoad()

      expect(isLoading.value).toBe(false)
    })
  })

  describe('handleImageError', () => {
    it('sets isLoading to false and clears imageUrl', () => {
      const { isLoading, imageUrl, handleImageError } = setup()

      isLoading.value = true
      imageUrl.value = 'http://example.com/img.png'
      handleImageError()

      expect(isLoading.value).toBe(false)
      expect(imageUrl.value).toBeNull()
    })
  })

  describe('handleDragStart/Move/End', () => {
    it('does nothing when imageUrl is null', () => {
      const { handleDragStart, cropX } = setup({ x: 100 })

      handleDragStart(createPointerEvent('pointerdown', 50, 50))

      expect(cropX.value).toBe(100)
    })

    it('ignores drag move when not dragging', () => {
      const { handleDragMove, cropX } = setup({ x: 100 })

      handleDragMove(createPointerEvent('pointermove', 200, 200))

      expect(cropX.value).toBe(100)
    })

    it('ignores drag end when not dragging', () => {
      const { handleDragEnd } = setup()

      handleDragEnd(createPointerEvent('pointerup', 200, 200))
    })

    it('moves crop box by pointer delta', () => {
      // 1000x1000 image in 500x500 container: effectiveScale = 0.5
      // pointer delta of 50px -> natural delta of 50/0.5 = 100
      const result = setupWithImage(1000, 1000, 500, 500, {
        x: 100,
        y: 100,
        width: 200,
        height: 200
      })
      result.imageUrl.value = 'http://example.com/img.png'

      result.handleDragStart(createPointerEvent('pointerdown', 0, 0))
      result.handleDragMove(createPointerEvent('pointermove', 50, 30))

      expect(result.cropX.value).toBe(200)
      expect(result.cropY.value).toBe(160)

      result.handleDragEnd(createPointerEvent('pointerup', 50, 30))
    })

    it('clamps drag to image boundaries', () => {
      const result = setupWithImage(1000, 1000, 500, 500, {
        x: 700,
        y: 700,
        width: 200,
        height: 200
      })
      result.imageUrl.value = 'http://example.com/img.png'

      result.handleDragStart(createPointerEvent('pointerdown', 0, 0))
      // delta = 500/0.5 = 1000, so x would be 1700 but max is 800
      result.handleDragMove(createPointerEvent('pointermove', 500, 500))

      expect(result.cropX.value).toBe(800)
      expect(result.cropY.value).toBe(800)

      result.handleDragEnd(createPointerEvent('pointerup', 500, 500))
    })
  })

  describe('handleResizeStart/Move/End', () => {
    it('does nothing when imageUrl is null', () => {
      const { handleResizeStart, cropWidth } = setup({ width: 200 })

      handleResizeStart(createPointerEvent('pointerdown', 50, 50), 'se')

      expect(cropWidth.value).toBe(200)
    })

    it('ignores resize move when not resizing', () => {
      const { handleResizeMove, cropWidth } = setup({ width: 200 })

      handleResizeMove(createPointerEvent('pointermove', 300, 300))

      expect(cropWidth.value).toBe(200)
    })

    it('ignores resize end when not resizing', () => {
      const { handleResizeEnd } = setup()

      handleResizeEnd(createPointerEvent('pointerup', 200, 200))
    })

    it('resizes from the right edge', () => {
      // effectiveScale = 0.5, so pointer delta 25px -> natural 50px
      const result = setupWithImage(1000, 1000, 500, 500, {
        x: 100,
        y: 100,
        width: 200,
        height: 200
      })
      result.imageUrl.value = 'http://example.com/img.png'

      result.handleResizeStart(createPointerEvent('pointerdown', 0, 0), 'right')
      result.handleResizeMove(createPointerEvent('pointermove', 25, 0))

      expect(result.cropWidth.value).toBe(250)
      expect(result.cropX.value).toBe(100)

      result.handleResizeEnd(createPointerEvent('pointerup', 25, 0))
    })

    it('resizes from the bottom edge', () => {
      // effectiveScale = 0.5, so pointer delta 40px -> natural 80px
      const result = setupWithImage(1000, 1000, 500, 500, {
        x: 100,
        y: 100,
        width: 200,
        height: 200
      })
      result.imageUrl.value = 'http://example.com/img.png'

      result.handleResizeStart(
        createPointerEvent('pointerdown', 0, 0),
        'bottom'
      )
      result.handleResizeMove(createPointerEvent('pointermove', 0, 40))

      expect(result.cropHeight.value).toBe(280)
      expect(result.cropY.value).toBe(100)

      result.handleResizeEnd(createPointerEvent('pointerup', 0, 40))
    })

    it('resizes from left edge, moving x and shrinking width', () => {
      // effectiveScale = 0.5, so pointer delta 25px -> natural 50px
      const result = setupWithImage(1000, 1000, 500, 500, {
        x: 200,
        y: 100,
        width: 400,
        height: 200
      })
      result.imageUrl.value = 'http://example.com/img.png'

      result.handleResizeStart(createPointerEvent('pointerdown', 0, 0), 'left')
      result.handleResizeMove(createPointerEvent('pointermove', 50, 0))

      // delta = 50/0.5 = 100 natural px; newX = 200+100 = 300, newW = 400-100 = 300
      expect(result.cropX.value).toBe(300)
      expect(result.cropWidth.value).toBe(300)

      result.handleResizeEnd(createPointerEvent('pointerup', 50, 0))
    })

    it('enforces MIN_CROP_SIZE when resizing', () => {
      // effectiveScale = 0.5, so pointer -200px -> natural -400px
      const result = setupWithImage(1000, 1000, 500, 500, {
        x: 100,
        y: 100,
        width: 50,
        height: 50
      })
      result.imageUrl.value = 'http://example.com/img.png'

      result.handleResizeStart(createPointerEvent('pointerdown', 0, 0), 'right')
      result.handleResizeMove(createPointerEvent('pointermove', -200, 0))

      // MIN_CROP_SIZE = 16
      expect(result.cropWidth.value).toBe(16)

      result.handleResizeEnd(createPointerEvent('pointerup', -200, 0))
    })

    it('performs constrained resize with locked ratio from se corner', () => {
      const result = setupWithImage(1000, 1000, 500, 500, {
        x: 100,
        y: 100,
        width: 200,
        height: 200
      })
      result.imageUrl.value = 'http://example.com/img.png'
      result.selectedRatio.value = '1:1'

      result.handleResizeStart(createPointerEvent('pointerdown', 0, 0), 'se')
      result.handleResizeMove(createPointerEvent('pointermove', 100, 100))

      // Both dimensions should grow equally for 1:1 ratio
      expect(result.cropWidth.value).toBe(result.cropHeight.value)
      expect(result.cropWidth.value).toBeGreaterThan(200)

      result.handleResizeEnd(createPointerEvent('pointerup', 100, 100))
    })
  })

  describe('getInputImageUrl (via imageUrl)', () => {
    it('returns null when node is not found', () => {
      const { imageUrl } = setup()
      expect(imageUrl.value).toBeNull()
    })

    it('returns URL from nodeOutputStore when node has output', () => {
      const mockSourceNode = { isSubgraphNode: () => false }
      const mockNode = createMockNode({
        getInputNode: vi.fn().mockReturnValue(mockSourceNode)
      })

      vi.mocked(resolveNode).mockReturnValue(mockNode)

      const store = useNodeOutputStore()
      vi.mocked(store.getNodeImageUrls).mockReturnValue([
        'http://example.com/output.png'
      ])

      const { imageUrl } = setup()
      expect(imageUrl.value).toBe('http://example.com/output.png')
    })

    it('returns null when source node has no output', () => {
      const mockSourceNode = { isSubgraphNode: () => false }
      const mockNode = createMockNode({
        getInputNode: vi.fn().mockReturnValue(mockSourceNode)
      })

      vi.mocked(resolveNode).mockReturnValue(mockNode)

      const store = useNodeOutputStore()
      vi.mocked(store.getNodeImageUrls).mockReturnValue(undefined)

      const { imageUrl } = setup()
      expect(imageUrl.value).toBeNull()
    })

    it('returns null when node has no input node', () => {
      const mockNode = createMockNode()

      vi.mocked(resolveNode).mockReturnValue(mockNode)

      const { imageUrl } = setup()
      expect(imageUrl.value).toBeNull()
    })

    it('resolves subgraph node output link', () => {
      const resolvedOutputNode = { isSubgraphNode: () => false }
      const mockSourceNode = {
        isSubgraphNode: () => true,
        resolveSubgraphOutputLink: vi
          .fn()
          .mockReturnValue({ outputNode: resolvedOutputNode })
      }
      const mockNode = createMockNode({
        getInputNode: vi.fn().mockReturnValue(mockSourceNode),
        getInputLink: vi.fn().mockReturnValue({ origin_slot: 0 })
      })

      vi.mocked(resolveNode).mockReturnValue(mockNode)

      const store = useNodeOutputStore()
      vi.mocked(store.getNodeImageUrls).mockReturnValue([
        'http://example.com/subgraph.png'
      ])

      const { imageUrl } = setup()
      expect(imageUrl.value).toBe('http://example.com/subgraph.png')
    })

    it('returns null when subgraph resolution fails (no link)', () => {
      const mockSourceNode = {
        isSubgraphNode: () => true,
        resolveSubgraphOutputLink: vi.fn()
      }
      const mockNode = createMockNode({
        getInputNode: vi.fn().mockReturnValue(mockSourceNode),
        getInputLink: vi.fn().mockReturnValue(null)
      })

      vi.mocked(resolveNode).mockReturnValue(mockNode)

      const { imageUrl } = setup()
      expect(imageUrl.value).toBeNull()
    })

    it('returns null when subgraph resolves to no output node', () => {
      const mockSourceNode = {
        isSubgraphNode: () => true,
        resolveSubgraphOutputLink: vi.fn().mockReturnValue({ outputNode: null })
      }
      const mockNode = createMockNode({
        getInputNode: vi.fn().mockReturnValue(mockSourceNode),
        getInputLink: vi.fn().mockReturnValue({ origin_slot: 0 })
      })

      vi.mocked(resolveNode).mockReturnValue(mockNode)

      const { imageUrl } = setup()
      expect(imageUrl.value).toBeNull()
    })
  })

  describe('updateDisplayedDimensions (via handleImageLoad)', () => {
    it('calculates scale for landscape image in smaller container', () => {
      const result = setupWithImage(1000, 500, 500, 400)

      // Landscape image: imageAspect=2 > containerAspect=1.25
      // width-constrained: displayedWidth=500, scaleFactor=0.5
      expect(result.cropBoxStyle.value.width).toBe(`${100 * 0.5}px`)
    })

    it('calculates scale for portrait image in wider container', () => {
      const result = setupWithImage(500, 1000, 600, 400)

      // Portrait: imageAspect=0.5 < containerAspect=1.5
      // height-constrained: displayedWidth=200, scaleFactor=0.4
      expect(result.cropBoxStyle.value.width).toBe(`${100 * 0.4}px`)
    })

    it('handles zero natural dimensions gracefully', () => {
      const result = setupWithImage(0, 0, 500, 400, {
        width: 512,
        height: 512
      })

      // scaleFactor should default to 1
      expect(result.cropBoxStyle.value.width).toBe(`${512}px`)
    })
  })

  describe('initialize', () => {
    it('calls resolveNode with the given nodeId', () => {
      const mockNode = createMockNode()
      vi.mocked(resolveNode).mockReturnValue(mockNode)

      setup()

      expect(resolveNode).toHaveBeenCalledWith(1)
    })

    it('sets node to null when resolveNode returns undefined', () => {
      vi.mocked(resolveNode).mockReturnValue(undefined)

      const { imageUrl } = setup()

      expect(resolveNode).toHaveBeenCalledWith(1)
      expect(imageUrl.value).toBeNull()
    })
  })
})
