import { describe, expect, it, vi } from 'vitest'
import { resolveDefaultModelForProviderCandidates } from '../ModelCenter'
import { applyModelConfigAction } from '../../../electron/main/openclaw-model-config'

const keys = ['minimax/MiniMax-M2.7', 'minimax/MiniMax-M3', 'minimax/MiniMax-M3.1-Flash']
const catalog = keys.map((key) => ({ key, provider: 'minimax', available: true }))

describe('MiniMax onboarding default request', () => {
  it.each(['cli', 'upstream'] as const)('chooses runtime-advertised Flash from %s and sends the exact model to OpenClaw', async (source) => {
    const listCatalog = vi.fn(async () => ({ total: catalog.length, items: catalog }))
    const model = await resolveDefaultModelForProviderCandidates(['minimax'], {
      readConfig: async () => null,
      getModelStatus: async () => ({ ok: true, data: {} }),
      listCatalog,
      ...(source === 'upstream' ? {
        getModelUpstreamState: async () => ({
          ok: true,
          source: 'control-ui-app' as const,
          fallbackUsed: false,
          data: {
            source: 'control-ui-app' as const,
            connected: true,
            hasClient: true,
            appKeys: [],
            catalogItemsLike: catalog,
            modelStatusLike: { allowed: keys, allowedSource: 'catalog' },
          },
          diagnostics: {
            upstreamAvailable: true, connected: true, hasClient: true,
            hasHelloSnapshot: false, hasHealthResult: false,
            hasSessionsState: false, hasModelCatalogState: true, appKeys: [],
          },
        }),
      } : {}),
    })
    expect(model).toBe(keys[2])
    if (source === 'upstream') expect(listCatalog).not.toHaveBeenCalled()
    const runCommand = vi.fn(async () => ({ ok: true, stdout: '', stderr: '', code: 0 }))
    await applyModelConfigAction({ kind: 'set-default-model', model }, { runCommand })
    expect(runCommand).toHaveBeenCalledWith(['models', 'set', keys[2]], expect.any(Number))
  })

  it.each(['minimax/MiniMax-M2.7', 'minimax/my-deployment'])('retains explicit saved default %s', async (model) => {
    const listCatalog = vi.fn(async () => ({ total: catalog.length, items: catalog }))
    expect(await resolveDefaultModelForProviderCandidates(['minimax'], {
      readConfig: async () => ({ agents: { defaults: { model: { primary: model } } } }),
      getModelStatus: async () => ({ ok: true, data: {} }),
      listCatalog,
    })).toBe(model)
    expect(listCatalog).not.toHaveBeenCalled()
  })

  it('does not synthesize an unsupported model when only unsaved legacy catalog entries exist', async () => {
    expect(await resolveDefaultModelForProviderCandidates(['minimax'], {
      readConfig: async () => null,
      getModelStatus: async () => ({ ok: true, data: {} }),
      listCatalog: async () => ({ total: 1, items: [catalog[0]] }),
    })).toBe('')
  })
})
