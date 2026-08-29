import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

type CollectedFile = { filename: string; path: string; size: number }

// The action script is plain ESM with no .d.ts; keep the contract local to this file.
const { collectFiles, detectUpdaterKind, readInput, versionFromMetadata } = (await import(
  // @ts-expect-error — scripts/shukka-upload.mjs has no declaration file
  '../scripts/shukka-upload.mjs'
)) as {
  collectFiles: (directory: string, kind?: string) => Promise<CollectedFile[]>
  detectUpdaterKind: (directory: string, override?: string) => Promise<'electron' | 'tauri'>
  versionFromMetadata: (
    files: { filename: string; path: string }[],
    directory?: string,
    kind?: string,
  ) => Promise<string>
  readInput: (actionInput: string, envName: string, fallback?: string) => string
}

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'shukka-upload-'))
}

function write(path: string, body: string) {
  writeFileSync(path, body)
}

function mockExit() {
  const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: string | number | null) => {
    throw new Error(`process.exit(${code})`)
  }) as never)
  const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  return {
    write: writeSpy,
    restore() {
      exit.mockRestore()
      writeSpy.mockRestore()
    },
  }
}

describe('collectFiles', () => {
  it('includes latest.yml and App.exe and skips dotfiles', async () => {
    const directory = tempDir()
    write(join(directory, 'latest.yml'), 'version: 1.2.3\n')
    write(join(directory, 'App.exe'), 'binary')
    write(join(directory, '.DS_Store'), 'junk')
    write(join(directory, '.hidden'), 'secret')

    const files = await collectFiles(directory)
    expect(files.map((file) => file.filename)).toEqual(['App.exe', 'latest.yml'])
  })

  it('does not recurse into nested junk in an Electron dist', async () => {
    const directory = tempDir()
    write(join(directory, 'latest.yml'), 'version: 1.0.0\n')
    write(join(directory, 'App.exe'), 'binary')
    mkdirSync(join(directory, 'node_modules'))
    write(join(directory, 'node_modules', 'leftpad.js'), 'nope')

    const files = await collectFiles(directory)
    expect(files.map((file) => file.filename)).toEqual(['App.exe', 'latest.yml'])
  })

  it('collects AppImage + .sig from nested bundle/appimage without latest.json', async () => {
    const root = tempDir()
    const appimage = join(root, 'bundle', 'appimage')
    mkdirSync(join(appimage, 'demo.AppDir', 'usr', 'lib'), { recursive: true })
    write(join(appimage, 'demo_1.0.0_amd64.AppImage'), 'image')
    write(join(appimage, 'demo_1.0.0_amd64.AppImage.sig'), 'sig')
    write(join(appimage, 'demo.AppDir', 'AppRun'), 'run')
    write(join(appimage, 'demo.AppDir', 'usr', 'lib', 'libfoo.so'), 'lib')

    const fromBundle = await collectFiles(join(root, 'bundle'))
    expect(fromBundle.map((file) => file.filename)).toEqual([
      'demo_1.0.0_amd64.AppImage',
      'demo_1.0.0_amd64.AppImage.sig',
    ])

    const fromPlatform = await collectFiles(appimage)
    expect(fromPlatform.map((file) => file.filename)).toEqual([
      'demo_1.0.0_amd64.AppImage',
      'demo_1.0.0_amd64.AppImage.sig',
    ])
  })

  it('does not upload AppDir contents when the bundle has no updater pair', async () => {
    const bundle = join(tempDir(), 'bundle')
    const appimage = join(bundle, 'appimage')
    mkdirSync(join(appimage, 'demo.AppDir'), { recursive: true })
    write(join(appimage, 'demo.AppDir', 'AppRun'), 'run')

    expect(await collectFiles(bundle)).toEqual([])
  })

  it('returns no files for an empty directory', async () => {
    expect(await collectFiles(tempDir())).toEqual([])
  })

  it('fails when two platform dirs share a basename', async () => {
    const bundle = join(tempDir(), 'bundle')
    mkdirSync(join(bundle, 'appimage'), { recursive: true })
    mkdirSync(join(bundle, 'deb'), { recursive: true })
    write(join(bundle, 'appimage', 'app.AppImage'), 'a')
    write(join(bundle, 'appimage', 'app.AppImage.sig'), 's')
    write(join(bundle, 'deb', 'app.AppImage'), 'b')
    write(join(bundle, 'deb', 'app.AppImage.sig'), 's2')

    const exit = mockExit()
    await expect(collectFiles(bundle)).rejects.toThrow(/process\.exit\(1\)/)
    expect(exit.write).toHaveBeenCalledWith(expect.stringMatching(/basename collision/i))
    exit.restore()
  })
})

describe('detectUpdaterKind', () => {
  it('infers electron from yml and tauri from .sig, latest.json, or bundle layout', async () => {
    const electron = tempDir()
    write(join(electron, 'latest.yml'), 'version: 1.0.0\n')
    expect(await detectUpdaterKind(electron)).toBe('electron')

    const withSig = tempDir()
    write(join(withSig, 'a.sig'), 's')
    expect(await detectUpdaterKind(withSig)).toBe('tauri')

    const withJson = tempDir()
    write(join(withJson, 'latest.json'), '{"version":"1.0.0"}')
    expect(await detectUpdaterKind(withJson)).toBe('tauri')

    const bundle = join(tempDir(), 'bundle')
    mkdirSync(join(bundle, 'macos'), { recursive: true })
    expect(await detectUpdaterKind(bundle)).toBe('tauri')

    const platform = join(tempDir(), 'appimage')
    mkdirSync(platform)
    expect(await detectUpdaterKind(platform)).toBe('tauri')
  })

  it('lets yml win when a directory also has .sig, and honors an override', async () => {
    const mixed = tempDir()
    write(join(mixed, 'latest.yml'), 'version: 1.0.0\n')
    write(join(mixed, 'a.sig'), 's')
    expect(await detectUpdaterKind(mixed)).toBe('electron')
    expect(await detectUpdaterKind(mixed, 'tauri')).toBe('tauri')
    expect(await detectUpdaterKind(mixed, 'electron')).toBe('electron')
  })
})

describe('versionFromMetadata', () => {
  it('reads version: 2.0.0 from yml', async () => {
    const directory = tempDir()
    const path = join(directory, 'latest.yml')
    write(path, 'version: 2.0.0\nfiles:\n  - url: App.exe\n')

    await expect(versionFromMetadata([{ filename: 'latest.yml', path }])).resolves.toBe('2.0.0')
  })

  it('reads version from latest.json when no yml is present', async () => {
    const directory = tempDir()
    const path = join(directory, 'latest.json')
    write(path, '{"version":"1.4.2","platforms":{}}')

    await expect(versionFromMetadata([{ filename: 'latest.json', path }])).resolves.toBe('1.4.2')
  })

  it('infers Tauri version from a _1.0.0_ filename token without latest.json', async () => {
    const directory = tempDir()
    const appimage = join(directory, 'bundle', 'appimage')
    mkdirSync(appimage, { recursive: true })
    const artifact = join(appimage, 'demo_1.0.0_amd64.AppImage')
    const sig = `${artifact}.sig`
    write(artifact, 'image')
    write(sig, 'sig')

    const files = await collectFiles(join(directory, 'bundle'))
    await expect(versionFromMetadata(files, join(directory, 'bundle'))).resolves.toBe('1.0.0')
  })

  it('prefers nearest tauri.conf.json over a filename token', async () => {
    const root = tempDir()
    write(join(root, 'tauri.conf.json'), '{"version":"3.2.1"}')
    const appimage = join(root, 'target', 'release', 'bundle', 'appimage')
    mkdirSync(appimage, { recursive: true })
    write(join(appimage, 'app_9.9.9_amd64.AppImage'), 'image')
    write(join(appimage, 'app_9.9.9_amd64.AppImage.sig'), 'sig')

    const bundle = join(root, 'target', 'release', 'bundle')
    const files = await collectFiles(bundle)
    await expect(versionFromMetadata(files, bundle)).resolves.toBe('3.2.1')
  })

  it('prefers latest.json over tauri.conf.json and the filename token', async () => {
    const root = tempDir()
    write(join(root, 'tauri.conf.json'), '{"version":"3.2.1"}')
    const bundle = join(root, 'bundle')
    mkdirSync(join(bundle, 'appimage'), { recursive: true })
    write(join(bundle, 'latest.json'), '{"version":"2.0.0"}')
    write(join(bundle, 'appimage', 'app_1.0.0_amd64.AppImage'), 'image')
    write(join(bundle, 'appimage', 'app_1.0.0_amd64.AppImage.sig'), 'sig')

    const files = await collectFiles(bundle)
    await expect(versionFromMetadata(files, bundle)).resolves.toBe('2.0.0')
  })

  it('fails with a clear message when an Electron directory has no yml', async () => {
    const exit = mockExit()

    await expect(versionFromMetadata([{ filename: 'App.exe', path: '/tmp/App.exe' }])).rejects.toThrow(
      /process\.exit\(1\)/,
    )
    expect(exit.write).toHaveBeenCalledWith(expect.stringMatching(/latest\*\.yml/))

    exit.restore()
  })

  it('fails naming Tauri version options when none are available', async () => {
    const directory = tempDir()
    write(join(directory, 'app.AppImage'), 'image')
    write(join(directory, 'app.AppImage.sig'), 'sig')
    const files = await collectFiles(directory)

    const exit = mockExit()
    await expect(versionFromMetadata(files, directory)).rejects.toThrow(/process\.exit\(1\)/)
    expect(exit.write).toHaveBeenCalledWith(expect.stringMatching(/SHUKKA_VERSION/))
    expect(exit.write).toHaveBeenCalledWith(expect.stringMatching(/latest\.json/))
    expect(exit.write).toHaveBeenCalledWith(expect.stringMatching(/tauri\.conf\.json/))
    expect(exit.write).toHaveBeenCalledWith(expect.stringMatching(/_1\.0\.0_/))
    exit.restore()
  })
})

describe('readInput', () => {
  const previous: Record<string, string | undefined> = {}

  afterEach(() => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    for (const name of Object.keys(previous)) delete previous[name]
  })

  function setEnv(name: string, value: string | undefined) {
    previous[name] = process.env[name]
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }

  it('prefers SHUKKA_* over INPUT_* over the fallback', () => {
    setEnv('SHUKKA_APP', undefined)
    setEnv('INPUT_APP', undefined)
    expect(readInput('app', 'SHUKKA_APP', 'fallback')).toBe('fallback')

    setEnv('INPUT_APP', 'from-action')
    expect(readInput('app', 'SHUKKA_APP', 'fallback')).toBe('from-action')

    setEnv('SHUKKA_APP', 'from-env')
    expect(readInput('app', 'SHUKKA_APP', 'fallback')).toBe('from-env')
  })

  it('maps hyphenated action inputs to INPUT_* with the hyphen kept', () => {
    setEnv('SHUKKA_SERVER_URL', undefined)
    setEnv('INPUT_SERVER-URL', 'https://updates.example.test')
    expect(readInput('server-url', 'SHUKKA_SERVER_URL')).toBe('https://updates.example.test')
  })
})
