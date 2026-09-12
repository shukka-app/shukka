import { describe, expect, it } from 'vitest'
import { classifyInstaller, installersOf } from '~/lib/installers.ts'

describe('classifyInstaller', () => {
  it.each([
    ['Setup.exe', { os: 'windows', arch: 'x64', extension: '.exe' }],
    ['Setup-arm64.msi', { os: 'windows', arch: 'arm', extension: '.msi' }],
    ['App-1.0.0.dmg', { os: 'macos', arch: 'x64', extension: '.dmg' }],
    ['App-1.0.0-mac.zip', { os: 'macos', arch: 'x64', extension: '.zip' }],
    ['App-1.0.0-universal.dmg', { os: 'macos', arch: 'universal', extension: '.dmg' }],
    ['demo-app-1.0.0.AppImage', { os: 'linux', arch: 'x64', extension: '.AppImage' }],
    ['app_1.0.0_amd64.deb', { os: 'linux', arch: 'x64', extension: '.deb' }],
    ['app-1.0.0.x86_64.rpm', { os: 'linux', arch: 'x64', extension: '.rpm' }],
    ['app-aarch64.app.tar.gz', { os: 'macos', arch: 'arm', extension: '.app.tar.gz' }],
    ['demo-app-setup-1.0.0.exe', { os: 'windows', arch: 'x64', extension: '.exe' }],
  ] as const)('classifies %s', (filename, expected) => {
    expect(classifyInstaller(filename)).toMatchObject({ filename, ...expected })
  })

  it.each([
    'latest.yml',
    'latest-mac.yaml',
    'stable.yml',
    'App.exe.blockmap',
    'app.tar.gz.sig',
    'latest.json',
    'appcast.xml',
    'App-1.0.0.zip',
    'notes.txt',
    'App.pkg',
    'app-i686.deb',
    'Setup-ia32.exe',
  ])('hides %s', (filename) => {
    expect(classifyInstaller(filename)).toBeNull()
  })
})

describe('installersOf', () => {
  it('sorts windows → macos → linux, then x64 → arm → universal', () => {
    expect(
      installersOf([
        'app-aarch64.app.tar.gz',
        'app-linux-x86_64.AppImage',
        'app-universal.dmg',
        'Setup.exe',
        'Setup-arm64.msi',
      ]).map((tile) => tile.filename),
    ).toEqual([
      'Setup.exe',
      'Setup-arm64.msi',
      'app-aarch64.app.tar.gz',
      'app-universal.dmg',
      'app-linux-x86_64.AppImage',
    ])
  })
})
