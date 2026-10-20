import { describe, expect, it, vi } from 'vitest'
import { selectCurrentMiniMaxCatalog } from '../minimax-model-catalog'
import { buildEffectiveModelCatalog, resolveModelsPageCatalogState } from '../../shared/model-catalog-state'
import { applyModelConfigAction } from '../../../electron/main/openclaw-model-config'

const item = (key: string, tags: string[] = []) => ({ key, provider: key.split('/')[0], available: true, tags })

const models = [
  item('minimax/MiniMax-M2.7'),
  item('minimax/MiniMax-M3'),
  item('other/text-model'),
  item('minimax/MiniMax-M3.1-Flash'),
]

describe('current MiniMax catalog', () => {
  it('filters ordinary legacy choices and prefers Flash without changing runtime metadata', () => {
    const before = structuredClone(models)
    const result = buildEffectiveModelCatalog(models)
    expect(result.map((entry) => entry.key)).toEqual([
      'minimax/MiniMax-M3.1-Flash', 'other/text-model', 'minimax/MiniMax-M3',
    ])
    expect(result[0]).toBe(models[3])
    expect(models).toEqual(before)
    expect(selectCurrentMiniMaxCatalog([models[0]])).toEqual([])
    expect(buildEffectiveModelCatalog(models, {
      statusData: { allowed: models.map((entry) => entry.key), allowedSource: 'catalog' },
    }).map((entry) => entry.key)).toEqual(result.map((entry) => entry.key))
  })

  it.each([
    ['minimax', 'MiniMax-M3.1-Flash', 'MiniMax-M3', 'MiniMax-M2.5'],
    ['minimax-cn', 'MiniMax-M3.1-Flash', 'MiniMax-M3', 'MiniMax-M2.7'],
    ['openrouter', 'minimax/minimax-m3.1-flash:free', 'minimax/minimax-m3', 'minimax/minimax-m2.7'],
    ['opencode', 'minimax-m3.1-flash-free', 'minimax-m3', 'minimax-m2.5'],
  ])('passes the selected %s model unchanged to the real configuration command boundary', async (provider, flash, m3, legacy) => {
    const catalog = selectCurrentMiniMaxCatalog([item(`${provider}/${legacy}`), item(`${provider}/${m3}`), item(`${provider}/${flash}`)])
    expect(catalog.map((entry) => entry.key)).toEqual([`${provider}/${flash}`, `${provider}/${m3}`])
    const runCommand = vi.fn(async () => ({ ok: true, stdout: '', stderr: '', code: 0 }))
    const result = await applyModelConfigAction({ kind: 'set-default-model', model: catalog[0].key }, { runCommand })
    expect(result.ok).toBe(true)
    expect(runCommand).toHaveBeenCalledWith(['models', 'set', `${provider}/${flash}`], expect.any(Number))
  })

  it('preserves saved, configured, custom, media and portal entries', async () => {
    const preserved = [
      item('minimax/MiniMax-M2.5', ['configured']),
      item('minimax/MiniMax-M2.1', ['fallback#1']),
      item('minimax/my-custom-model'),
      item('minimax/speech-02-hd'),
      item('minimax/hailuo-02'),
      item('minimax-portal/MiniMax-M2.7'),
      item('custom/MiniMax-M2.7'),
    ]
    expect(selectCurrentMiniMaxCatalog(preserved)).toEqual(preserved)
    const legacy = item('minimax/MiniMax-M2.7')
    expect(buildEffectiveModelCatalog([legacy], {
      preferredModelKey: 'minimax-portal/MiniMax-M2.7',
    })).toEqual([legacy])
    expect(buildEffectiveModelCatalog([legacy], {
      statusData: { defaultModel: legacy.key },
    }).map((entry) => entry.key)).toEqual([legacy.key])
    const runCommand = vi.fn(async () => ({ ok: true, stdout: '', stderr: '', code: 0 }))
    for (const entry of [legacy, ...preserved]) {
      await applyModelConfigAction({ kind: 'set-default-model', model: entry.key }, { runCommand })
      expect(runCommand).toHaveBeenLastCalledWith(['models', 'set', entry.key], expect.any(Number))
    }
  })

  it.each(['switch-success', 'switch-failed', 'runtime-auto'] as const)('preserves explicit selection history but not automatic discovery: %s', (source) => {
    const legacy = item('minimax/MiniMax-M2.7')
    const result = buildEffectiveModelCatalog([legacy], {
      verificationRecords: [{
        modelKey: 'minimax-portal/MiniMax-M2.7',
        runtimeKey: 'minimax/minimax-m2.7',
        verificationState: 'verified-unavailable',
        source,
        updatedAt: '2026-10-20T00:00:00.000Z',
      }],
    })
    expect(result.map((entry) => entry.key)).toEqual(source === 'runtime-auto' ? [] : [legacy.key])
  })

  it('keeps configured legacy models in the real page catalog without advertising unsaved legacy models', () => {
    const config = { models: { providers: { minimax: { models: [{ id: 'MiniMax-M2.5' }] } } } }
    const before = structuredClone(config)
    const result = resolveModelsPageCatalogState({
      catalog: models,
      config,
      envVars: null,
      statusData: null,
      mode: 'all',
    })
    expect(result.visibleCatalog.map((entry) => entry.key)).toEqual([
      'minimax/MiniMax-M3.1-Flash', 'minimax/MiniMax-M3', 'minimax/MiniMax-M2.5',
    ])
    expect(config).toEqual(before)
  })

  it('does not invent routes or treat paid and free gateway IDs as interchangeable', () => {
    expect(selectCurrentMiniMaxCatalog([
      item('openrouter/minimax/minimax-m3.1-flash'),
      item('opencode/minimax-m3.1-flash'),
      item('openrouter/minimax/minimax-m3'),
    ]).map((entry) => entry.key)).toEqual(['openrouter/minimax/minimax-m3'])
  })
})
