import { watch } from 'vue'

export function createAppRuntimeBootstrap(options) {
  const {
    accessStore,
    storageApi,
    bootstrapCloudSync,
    onStorageLoadError = () => {},
    onCloudSyncError = () => {}
  } = options || {}

  let appDataLoaded = false
  let appDataLoadPromise = null
  let cloudSyncStarted = false

  async function ensureLoaded() {
    if (!accessStore?.canAccessApp) return false
    if (appDataLoaded) return true
    if (appDataLoadPromise) return appDataLoadPromise

    appDataLoadPromise = (async () => {
      let snapshot = null
      try {
        snapshot = await storageApi.loadAll()
        appDataLoaded = true
      } catch (error) {
        onStorageLoadError(error)
        return false
      } finally {
        appDataLoadPromise = null
      }

      if (!cloudSyncStarted) {
        cloudSyncStarted = true
        try {
          Promise.resolve(bootstrapCloudSync?.({
            storageApi,
            initialSnapshot: snapshot
          })).catch(onCloudSyncError)
        } catch (error) {
          onCloudSyncError(error)
        }
      }

      return true
    })()

    return appDataLoadPromise
  }

  function startAccessWatcher() {
    return watch(
      () => [accessStore?.isChecking, accessStore?.canAccessApp],
      ([isChecking, canAccessApp]) => {
        if (isChecking || !canAccessApp) return
        void ensureLoaded()
      },
      { flush: 'sync' }
    )
  }

  return {
    ensureLoaded,
    startAccessWatcher,
    get appDataLoaded() {
      return appDataLoaded
    }
  }
}
