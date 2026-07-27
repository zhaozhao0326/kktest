import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const firebaseMocks = vi.hoisted(() => {
  const auth = { currentUser: null }
  return {
    auth,
    initializeApp: vi.fn(() => ({ name: 'aichat-cloud-sync-app' })),
    getApps: vi.fn(() => []),
    getApp: vi.fn(() => ({ name: 'aichat-cloud-sync-app' })),
    deleteApp: vi.fn(async () => {}),
    getAuth: vi.fn(() => auth),
    setPersistence: vi.fn(async () => {}),
    getRedirectResult: vi.fn(async () => null),
    onAuthStateChanged: vi.fn(() => vi.fn()),
    signInAnonymously: vi.fn(async () => {
      auth.currentUser = { uid: 'anon-user', isAnonymous: true, providerData: [] }
    }),
    linkWithRedirect: vi.fn(async () => {}),
    linkWithPopup: vi.fn(async () => {}),
    doc: vi.fn((_db, ...segments) => ({ segments })),
    getDoc: vi.fn(async () => ({
      exists: () => false,
      data: () => ({})
    })),
    getFirestore: vi.fn(() => ({ kind: 'db' })),
    serverTimestamp: vi.fn(() => ({ kind: 'server-timestamp' })),
    setDoc: vi.fn(async () => {}),
    getBlob: vi.fn(async () => new Blob(['backup'])),
    getStorage: vi.fn(() => ({ kind: 'storage' })),
    ref: vi.fn((_storage, path) => ({ path })),
    uploadBytes: vi.fn(async () => {})
  }
})

const storeMocks = vi.hoisted(() => ({
  settingsStore: {
    cloudSyncEnabled: true,
    cloudSyncAutoSync: false,
    cloudSyncAutoSyncPolicy: 'always',
    cloudSyncCustomMinIntervalMs: 0,
    cloudSyncCustomMinDeltaBytes: 0,
    cloudSyncForceSyncOnBackground: false,
    cloudSyncIncludeMedia: false,
    cloudSyncDeviceId: '',
    cloudSyncConfig: {
      apiKey: 'api-key',
      authDomain: 'demo.firebaseapp.com',
      projectId: 'demo-project',
      storageBucket: 'demo.appspot.com',
      appId: 'app-id',
      messagingSenderId: 'sender-id',
      measurementId: ''
    }
  },
  syncStore: {
    clearError: vi.fn(),
    resetRuntime: vi.fn(),
    setAccount: vi.fn(),
    setError: vi.fn(),
    setPendingAction: vi.fn(),
    setRemoteState: vi.fn(),
    setStatus: vi.fn(),
    setTimestamps: vi.fn()
  },
  showToast: vi.fn()
}))

vi.mock('firebase/app', () => ({
  deleteApp: firebaseMocks.deleteApp,
  getApp: firebaseMocks.getApp,
  getApps: firebaseMocks.getApps,
  initializeApp: firebaseMocks.initializeApp
}))

vi.mock('firebase/auth', () => ({
  browserLocalPersistence: { kind: 'local' },
  getAuth: firebaseMocks.getAuth,
  getRedirectResult: firebaseMocks.getRedirectResult,
  GoogleAuthProvider: class GoogleAuthProvider {},
  linkWithRedirect: firebaseMocks.linkWithRedirect,
  linkWithPopup: firebaseMocks.linkWithPopup,
  onAuthStateChanged: firebaseMocks.onAuthStateChanged,
  setPersistence: firebaseMocks.setPersistence,
  signInAnonymously: firebaseMocks.signInAnonymously
}))

vi.mock('firebase/firestore', () => ({
  doc: firebaseMocks.doc,
  getDoc: firebaseMocks.getDoc,
  getFirestore: firebaseMocks.getFirestore,
  serverTimestamp: firebaseMocks.serverTimestamp,
  setDoc: firebaseMocks.setDoc
}))

vi.mock('firebase/storage', () => ({
  getBlob: firebaseMocks.getBlob,
  getStorage: firebaseMocks.getStorage,
  ref: firebaseMocks.ref,
  uploadBytes: firebaseMocks.uploadBytes
}))

vi.mock('../../stores/settings', () => ({
  useSettingsStore: () => storeMocks.settingsStore
}))

vi.mock('../../stores/cloudSync', () => ({
  CLOUD_SYNC_STATUS: {
    disabled: 'disabled',
    needsConfig: 'needs-config',
    initializing: 'initializing',
    signingIn: 'signing-in',
    ready: 'ready',
    syncing: 'syncing',
    error: 'error'
  },
  useCloudSyncStore: () => storeMocks.syncStore
}))

vi.mock('../useToast', () => ({
  useToast: () => ({
    showToast: storeMocks.showToast
  })
}))

vi.mock('../../utils/id', () => ({
  makeId: vi.fn(() => 'device-fixed')
}))

function createMemoryStorage() {
  const map = new Map()
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null
    },
    setItem(key, value) {
      map.set(key, String(value))
    },
    removeItem(key) {
      map.delete(key)
    }
  }
}

function createWindowStub({ href, standalone, openResult = {} }) {
  const location = {
    href,
    assign: vi.fn((nextHref) => {
      location.href = String(nextHref)
    })
  }

  Object.defineProperty(location, 'hash', {
    get() {
      return new URL(location.href).hash
    },
    set(nextHash) {
      const url = new URL(location.href)
      url.hash = String(nextHash)
      location.href = url.toString()
    }
  })

  const history = {
    replaceState: vi.fn((_, __, nextHref) => {
      location.href = String(nextHref)
    })
  }

  return {
    location,
    history,
    open: vi.fn(() => openResult),
    matchMedia: vi.fn((query) => ({
      matches: standalone && query === '(display-mode: standalone)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })),
    navigator: { standalone: false },
    localStorage: createMemoryStorage(),
    sessionStorage: createMemoryStorage()
  }
}

function resetMockState() {
  firebaseMocks.auth.currentUser = null
  storeMocks.settingsStore.cloudSyncEnabled = true
  storeMocks.settingsStore.cloudSyncAutoSync = false
  storeMocks.settingsStore.cloudSyncAutoSyncPolicy = 'always'
  storeMocks.settingsStore.cloudSyncCustomMinIntervalMs = 0
  storeMocks.settingsStore.cloudSyncCustomMinDeltaBytes = 0
  storeMocks.settingsStore.cloudSyncForceSyncOnBackground = false
  storeMocks.settingsStore.cloudSyncIncludeMedia = false
  storeMocks.settingsStore.cloudSyncDeviceId = ''
  storeMocks.settingsStore.cloudSyncConfig = {
    apiKey: 'api-key',
    authDomain: 'demo.firebaseapp.com',
    projectId: 'demo-project',
    storageBucket: 'demo.appspot.com',
    appId: 'app-id',
    messagingSenderId: 'sender-id',
    measurementId: ''
  }
  Object.values(storeMocks.syncStore).forEach((mock) => mock.mockReset())
  storeMocks.showToast.mockReset()
  Object.values(firebaseMocks).forEach((mock) => {
    if (typeof mock?.mockReset === 'function') mock.mockReset()
  })
  firebaseMocks.initializeApp.mockReturnValue({ name: 'aichat-cloud-sync-app' })
  firebaseMocks.getApps.mockReturnValue([])
  firebaseMocks.getApp.mockReturnValue({ name: 'aichat-cloud-sync-app' })
  firebaseMocks.getAuth.mockImplementation(() => firebaseMocks.auth)
  firebaseMocks.setPersistence.mockResolvedValue(undefined)
  firebaseMocks.getRedirectResult.mockResolvedValue(null)
  firebaseMocks.onAuthStateChanged.mockReturnValue(vi.fn())
  firebaseMocks.signInAnonymously.mockImplementation(async () => {
    firebaseMocks.auth.currentUser = { uid: 'anon-user', isAnonymous: true, providerData: [] }
  })
  firebaseMocks.linkWithRedirect.mockResolvedValue(undefined)
  firebaseMocks.linkWithPopup.mockResolvedValue(undefined)
  firebaseMocks.doc.mockImplementation((_db, ...segments) => ({ segments }))
  firebaseMocks.getDoc.mockResolvedValue({
    exists: () => false,
    data: () => ({})
  })
  firebaseMocks.getFirestore.mockReturnValue({ kind: 'db' })
  firebaseMocks.serverTimestamp.mockReturnValue({ kind: 'server-timestamp' })
  firebaseMocks.setDoc.mockResolvedValue(undefined)
  firebaseMocks.getBlob.mockResolvedValue(new Blob(['backup']))
  firebaseMocks.getStorage.mockReturnValue({ kind: 'storage' })
  firebaseMocks.ref.mockImplementation((_storage, path) => ({ path }))
  firebaseMocks.uploadBytes.mockResolvedValue(undefined)
}

describe('cloudSync manager google link handoff', () => {
  beforeEach(() => {
    vi.resetModules()
    resetMockState()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-13T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('continues google link handoff even if the handoff URL reopens inside standalone PWA', async () => {
    const windowStub = createWindowStub({
      href: 'https://example.com/?googleLinkInBrowser=1#/settings/cloudSync',
      standalone: true
    })
    vi.stubGlobal('window', windowStub)

    const { bootstrapCloudSync } = await import('./manager')
    const result = await bootstrapCloudSync({
      storageApi: {
        scheduleSave: vi.fn()
      }
    })

    expect(result).toBe(false)
    expect(windowStub.history.replaceState).toHaveBeenCalledTimes(1)
    expect(firebaseMocks.linkWithRedirect).toHaveBeenCalledTimes(1)
    expect(firebaseMocks.linkWithRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'anon-user', isAnonymous: true }),
      expect.any(Object)
    )
    expect(windowStub.localStorage.getItem('aichat:cloud-sync:google-link-redirect')).toBeTruthy()
  })

  it('starts a direct redirect flow immediately inside standalone PWA', async () => {
    const windowStub = createWindowStub({
      href: 'https://example.com/#/settings/cloudSync',
      standalone: true
    })
    vi.stubGlobal('window', windowStub)
    firebaseMocks.auth.currentUser = { uid: 'anon-user', isAnonymous: true, providerData: [] }

    const { linkCloudSyncWithGoogle } = await import('./manager')
    const result = await linkCloudSyncWithGoogle({
      storageApi: {
        scheduleSave: vi.fn()
      }
    })

    expect(result).toBe(false)
    expect(firebaseMocks.linkWithRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'anon-user', isAnonymous: true }),
      expect.any(Object)
    )
    expect(windowStub.open).not.toHaveBeenCalled()
    expect(windowStub.location.assign).not.toHaveBeenCalled()
    expect(windowStub.localStorage.getItem('aichat:cloud-sync:google-link-return-hash')).toBe('#/settings/cloudSync')
    expect(windowStub.localStorage.getItem('aichat_lockscreen_unlock_grace_until')).toBeTruthy()
    expect(storeMocks.showToast).not.toHaveBeenCalled()
  })

  it('does not enter uploading state when an auto upload is deferred by policy', async () => {
    storeMocks.settingsStore.cloudSyncAutoSync = true
    storeMocks.settingsStore.cloudSyncAutoSyncPolicy = 'balanced'

    let localUpdatedAt = 1_000
    let backupPayload = 'a'.repeat(600 * 1024)
    const storageApi = {
      scheduleSave: vi.fn(),
      getCurrentSnapshotMeta: vi.fn(() => ({
        localUpdatedAt,
        hasUserData: true
      })),
      buildBackupBlob: vi.fn(async () => ({
        snapshot: { localUpdatedAt },
        blob: new Blob([backupPayload], { type: 'application/zip' })
      }))
    }

    const { notifyCloudSyncLocalSave } = await import('./manager')

    await notifyCloudSyncLocalSave({
      storageApi,
      snapshot: { localUpdatedAt },
      reason: 'auto'
    })

    expect(firebaseMocks.uploadBytes).toHaveBeenCalledTimes(1)

    firebaseMocks.uploadBytes.mockClear()
    storeMocks.syncStore.setStatus.mockClear()
    storeMocks.syncStore.setPendingAction.mockClear()

    localUpdatedAt = 2_000
    backupPayload = 'b'.repeat(600 * 1024 + 128)
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000)

    await notifyCloudSyncLocalSave({
      storageApi,
      snapshot: { localUpdatedAt },
      reason: 'auto'
    })

    expect(firebaseMocks.uploadBytes).not.toHaveBeenCalled()
    expect(storeMocks.syncStore.setStatus).not.toHaveBeenCalledWith('syncing')
    expect(storeMocks.syncStore.setPendingAction).not.toHaveBeenCalledWith('push')
  })

  it('only force-syncs on pagehide when the background toggle is enabled', async () => {
    storeMocks.settingsStore.cloudSyncAutoSync = true
    storeMocks.settingsStore.cloudSyncAutoSyncPolicy = 'balanced'
    storeMocks.settingsStore.cloudSyncForceSyncOnBackground = false

    let localUpdatedAt = 1_000
    let backupPayload = 'a'.repeat(600 * 1024)
    const storageApi = {
      scheduleSave: vi.fn(),
      getCurrentSnapshotMeta: vi.fn(() => ({
        localUpdatedAt,
        hasUserData: true
      })),
      buildBackupBlob: vi.fn(async () => ({
        snapshot: { localUpdatedAt },
        blob: new Blob([backupPayload], { type: 'application/zip' })
      }))
    }

    const { notifyCloudSyncLocalSave } = await import('./manager')

    await notifyCloudSyncLocalSave({
      storageApi,
      snapshot: { localUpdatedAt },
      reason: 'auto'
    })

    firebaseMocks.uploadBytes.mockClear()

    localUpdatedAt = 2_000
    backupPayload = 'b'.repeat(600 * 1024 + 128)
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000)

    await notifyCloudSyncLocalSave({
      storageApi,
      snapshot: { localUpdatedAt },
      reason: 'pagehide'
    })

    expect(firebaseMocks.uploadBytes).not.toHaveBeenCalled()

    storeMocks.settingsStore.cloudSyncForceSyncOnBackground = true
    localUpdatedAt = 3_000
    backupPayload = 'c'.repeat(600 * 1024 + 256)

    await notifyCloudSyncLocalSave({
      storageApi,
      snapshot: { localUpdatedAt },
      reason: 'pagehide'
    })

    expect(firebaseMocks.uploadBytes).toHaveBeenCalledTimes(1)
  })

  it('does not initialize Firebase or upload when local storage has not hydrated', async () => {
    storeMocks.settingsStore.cloudSyncAutoSync = true

    const storageApi = {
      scheduleSave: vi.fn(),
      getCurrentSnapshotMeta: vi.fn(() => ({
        localUpdatedAt: 1_000,
        hasUserData: true,
        isHydrated: false,
        canPersist: false
      })),
      buildBackupBlob: vi.fn()
    }

    const { notifyCloudSyncLocalSave } = await import('./manager')

    const result = await notifyCloudSyncLocalSave({
      storageApi,
      snapshot: { localUpdatedAt: 1_000 },
      reason: 'pagehide'
    })

    expect(result).toBe(true)
    expect(firebaseMocks.initializeApp).not.toHaveBeenCalled()
    expect(firebaseMocks.uploadBytes).not.toHaveBeenCalled()
    expect(storageApi.buildBackupBlob).not.toHaveBeenCalled()
  })

  it('does not upload empty local data even for forced pagehide sync', async () => {
    storeMocks.settingsStore.cloudSyncAutoSync = true
    storeMocks.settingsStore.cloudSyncForceSyncOnBackground = true

    const storageApi = {
      scheduleSave: vi.fn(),
      getCurrentSnapshotMeta: vi.fn(() => ({
        localUpdatedAt: 1_000,
        hasUserData: false,
        isHydrated: true,
        canPersist: true
      })),
      buildBackupBlob: vi.fn()
    }

    const { notifyCloudSyncLocalSave } = await import('./manager')

    const result = await notifyCloudSyncLocalSave({
      storageApi,
      snapshot: { localUpdatedAt: 1_000 },
      reason: 'pagehide'
    })

    expect(result).toBe(true)
    expect(firebaseMocks.initializeApp).not.toHaveBeenCalled()
    expect(firebaseMocks.uploadBytes).not.toHaveBeenCalled()
    expect(storageApi.buildBackupBlob).not.toHaveBeenCalled()
  })
})
