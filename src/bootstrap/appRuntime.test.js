import { describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { createAppRuntimeBootstrap } from './appRuntime'

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('app runtime bootstrap', () => {
  it('loads local data and starts cloud sync after access is restored', async () => {
    const accessStore = reactive({
      isChecking: true,
      canAccessApp: false
    })
    const snapshot = { localUpdatedAt: 123 }
    const storageApi = {
      loadAll: vi.fn(async () => snapshot)
    }
    const bootstrapCloudSync = vi.fn(async () => true)

    const runtime = createAppRuntimeBootstrap({
      accessStore,
      storageApi,
      bootstrapCloudSync
    })
    const stop = runtime.startAccessWatcher()

    accessStore.isChecking = false
    await flushMicrotasks()
    expect(storageApi.loadAll).not.toHaveBeenCalled()

    accessStore.canAccessApp = true
    await flushMicrotasks()

    expect(storageApi.loadAll).toHaveBeenCalledTimes(1)
    expect(bootstrapCloudSync).toHaveBeenCalledWith({
      storageApi,
      initialSnapshot: snapshot
    })
    expect(runtime.appDataLoaded).toBe(true)

    stop()
  })

  it('deduplicates concurrent load requests', async () => {
    const accessStore = reactive({
      isChecking: false,
      canAccessApp: true
    })
    let resolveLoad
    const storageApi = {
      loadAll: vi.fn(() => new Promise((resolve) => {
        resolveLoad = resolve
      }))
    }
    const bootstrapCloudSync = vi.fn(async () => true)
    const runtime = createAppRuntimeBootstrap({
      accessStore,
      storageApi,
      bootstrapCloudSync
    })

    const first = runtime.ensureLoaded()
    const second = runtime.ensureLoaded()

    expect(storageApi.loadAll).toHaveBeenCalledTimes(1)
    resolveLoad({ localUpdatedAt: 456 })
    await Promise.all([first, second])
    await flushMicrotasks()

    expect(bootstrapCloudSync).toHaveBeenCalledTimes(1)
  })
})
