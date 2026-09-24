import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, Copy, Download, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import {
  useAppStore,
  type AppConfig,
  type ContextFamily,
  type CustomScene,
  type FamilySceneAssignment,
  type SystemSceneOverride,
} from '../../stores/appStore'
import { setFamilySceneAssignment, updateConfig as persistConfig } from '../../lib/tauri'
import { importCustomScenesJson, serializeCustomScenes } from '../../lib/scenes/sceneImportExport'
import { AppLogo } from '../AppLogo'
import { SegmentedControl } from './shared/SegmentedControl'
import { Group, Row } from '../ui/Group'

type ScenesTab = 'prompts' | 'apps'

/** The chosen sub-tab, kept for the rest of the app session when Settings panes switch. */
let lastScenesTab: ScenesTab = 'prompts'

interface EditorState {
  mode: 'create' | 'edit' | 'system'
  id: string | null
  name: string
  description: string
  promptTemplate: string
}

const APP_WRITING_MODES: Array<{
  family: Exclude<ContextFamily, 'general'>
  systemSceneId: string
  icons: Array<{ label: string; iconKey: string }>
}> = [
  {
    family: 'email',
    systemSceneId: 'system_email',
    icons: [
      { label: 'Gmail', iconKey: 'gmail' },
      { label: 'Apple Mail', iconKey: 'apple-mail' },
    ],
  },
  {
    family: 'work_chat',
    systemSceneId: 'system_work_chat',
    icons: [
      { label: 'Slack', iconKey: 'slack' },
      { label: 'Lark', iconKey: 'lark' },
    ],
  },
  {
    family: 'personal_chat',
    systemSceneId: 'system_personal_chat',
    icons: [
      { label: 'WeChat', iconKey: 'wechat' },
      { label: 'WhatsApp', iconKey: 'whatsapp' },
    ],
  },
  {
    family: 'document',
    systemSceneId: 'system_document',
    icons: [
      { label: 'Google Docs', iconKey: 'google-docs' },
      { label: 'Notion', iconKey: 'notion' },
    ],
  },
  {
    family: 'project_management',
    systemSceneId: 'system_project_management',
    icons: [
      { label: 'Linear', iconKey: 'linear' },
      { label: 'Jira', iconKey: 'jira' },
    ],
  },
  {
    family: 'developer_collaboration',
    systemSceneId: 'system_developer_collaboration',
    icons: [
      { label: 'GitHub', iconKey: 'github' },
      { label: 'GitLab', iconKey: 'gitlab' },
    ],
  },
  {
    family: 'prompt_or_code',
    systemSceneId: 'system_prompt_or_code',
    icons: [
      { label: 'Cursor', iconKey: 'cursor' },
      { label: 'VS Code', iconKey: 'vscode' },
    ],
  },
  {
    family: 'support',
    systemSceneId: 'system_support',
    icons: [
      { label: 'Zendesk', iconKey: 'zendesk' },
      { label: 'Intercom', iconKey: 'intercom' },
    ],
  },
  {
    family: 'social',
    systemSceneId: 'system_social',
    icons: [
      { label: 'X', iconKey: 'x' },
      { label: 'LinkedIn', iconKey: 'linkedin' },
    ],
  },
]

const SYSTEM_SCENE_PROMPTS: Record<string, string> = {
  system_email:
    'Email system mode: produce an email body when there is enough content. Use a greeting when the recipient is spoken, concise body paragraphs, and a light closing when appropriate. Do not generate a subject unless explicitly requested.',
  system_work_chat:
    'Work chat system mode: keep it casual and concise. Use short sentences or simple line breaks when helpful. No greeting or sign-off.',
  system_personal_chat:
    "Personal chat system mode: keep the user's casual voice and short-message rhythm; do not turn it into business writing.",
  system_document:
    'Document system mode: use coherent paragraphs. Use short headings or bullet points when the spoken structure has sections, takeaways, or multiple items.',
  system_project_management:
    'Project update system mode: format as a compact update with bullets for progress, blockers, and next steps when spoken. Do not invent owners, deadlines, or ticket fields.',
  system_developer_collaboration:
    'Engineering note system mode: format as a concise review or engineering note. Use bullets for issue, impact, and suggestion when helpful. Preserve technical identifiers exactly.',
  system_prompt_or_code:
    'Prompt/code system mode: make the spoken request explicit and usable. Use compact bullets for goal, constraints, and output shape when implied, but never invent code or unstated requirements.',
  system_support:
    'Support reply system mode: write a clear, empathetic reply. Use short paragraphs or numbered steps when next actions are spoken. Do not invent policy, refund, or resolution claims.',
  system_social:
    "Social post system mode: keep the user's voice and make it readable as a short post. No hashtags, emoji, or calls to action unless spoken.",
}

function systemFamilyForId(id: string): Exclude<ContextFamily, 'general'> {
  return APP_WRITING_MODES.find((mode) => mode.systemSceneId === id)?.family ?? 'email'
}

const emptyEditor = (): EditorState => ({
  mode: 'create',
  id: null,
  name: '',
  description: '',
  promptTemplate: '',
})

function createSceneId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `custom_${crypto.randomUUID()}`
  }
  return `custom_${Date.now()}`
}

function nowIso() {
  return new Date().toISOString()
}

function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text()
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

export function ScenesPane() {
  const { t } = useTranslation()
  const config = useAppStore((s) => s.config)
  const setConfig = useAppStore((s) => s.setConfig)
  const setSavedConfig = useAppStore((s) => s.setSavedConfig)
  const applyPersistedConfigPatch = useAppStore((s) => s.applyPersistedConfigPatch)

  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [mergeMsg, setMergeMsg] = useState<string | null>(null)
  const [mergeOk, setMergeOk] = useState(false)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const [tab, setTabState] = useState<ScenesTab>(lastScenesTab)
  const setTab = (next: ScenesTab) => {
    lastScenesTab = next
    setTabState(next)
  }

  const saveConfigPatch = async (patch: Partial<AppConfig>): Promise<boolean> => {
    const previousConfig = useAppStore.getState().config
    const previousSavedConfig = useAppStore.getState().savedConfig
    const nextConfig = { ...previousConfig, ...patch }
    const nextPersistedConfig = { ...(previousSavedConfig ?? previousConfig), ...patch }
    setConfig(nextConfig)
    setSaveError(null)
    try {
      await persistConfig(nextPersistedConfig)
      if (previousSavedConfig) applyPersistedConfigPatch(patch)
      else setSavedConfig(nextPersistedConfig)
      return true
    } catch {
      setConfig(previousConfig)
      setSaveError(t('scenes.failedToSave'))
      return false
    }
  }

  const sceneOptions = config.custom_scenes.map((scene) => ({ id: scene.id, name: scene.name }))

  const handleFamilySceneChange = async (family: ContextFamily, sceneId: string) => {
    setSaveError(null)
    try {
      const assignments = await setFamilySceneAssignment(family, sceneId || null)
      applyPersistedConfigPatch({ family_scene_assignments: assignments })
    } catch {
      setSaveError(t('scenes.failedToSave'))
    }
  }

  const handleStartCreate = () => {
    setEditor(emptyEditor())
  }

  const handleClearActiveScene = async () => {
    await saveConfigPatch({ active_scene: null })
  }

  const handleStartEdit = (scene: CustomScene) => {
    setEditor({
      mode: 'edit',
      id: scene.id,
      name: scene.name,
      description: scene.description,
      promptTemplate: scene.prompt_template,
    })
  }

  const systemOverrideFor = (id: string) =>
    config.system_scene_overrides.find((scene) => scene.id === id)

  const handleStartEditSystem = (id: string) => {
    setEditor({
      mode: 'system',
      id,
      name: t(`scenes.systemModes.${systemFamilyForId(id)}`),
      description: t('scenes.systemSceneDescription'),
      promptTemplate: systemOverrideFor(id)?.prompt_template ?? SYSTEM_SCENE_PROMPTS[id] ?? '',
    })
  }

  const handleSaveEditor = async () => {
    if (!editor) return
    const name = editor.name.trim()
    const description = editor.description.trim()
    const promptTemplate = editor.promptTemplate.trim()
    if (!name || !promptTemplate) return

    const timestamp = nowIso()
    if (editor.mode === 'system' && editor.id) {
      const nextOverride: SystemSceneOverride = {
        id: editor.id,
        prompt_template: promptTemplate,
      }
      const nextOverrides = [
        ...config.system_scene_overrides.filter((scene) => scene.id !== editor.id),
        nextOverride,
      ]
      if (await saveConfigPatch({ system_scene_overrides: nextOverrides })) {
        setEditor(null)
      }
      return
    }

    let nextScenes: CustomScene[]
    let savedScene: CustomScene

    if (editor.mode === 'edit' && editor.id) {
      const existing = config.custom_scenes.find((scene) => scene.id === editor.id)
      savedScene = {
        id: editor.id,
        name,
        description,
        prompt_template: promptTemplate,
        created_at: existing?.created_at ?? timestamp,
        updated_at: timestamp,
      }
      nextScenes = config.custom_scenes.map((scene) =>
        scene.id === editor.id ? savedScene : scene,
      )
    } else {
      savedScene = {
        id: createSceneId(),
        name,
        description,
        prompt_template: promptTemplate,
        created_at: timestamp,
        updated_at: timestamp,
      }
      nextScenes = [...config.custom_scenes, savedScene]
    }

    if (await saveConfigPatch({ custom_scenes: nextScenes })) setEditor(null)
  }

  const handleDuplicateCustom = async (scene: CustomScene) => {
    const timestamp = nowIso()
    const copy: CustomScene = {
      ...scene,
      id: createSceneId(),
      name: t('scenes.copyName', { name: scene.name }),
      created_at: timestamp,
      updated_at: timestamp,
    }
    await saveConfigPatch({ custom_scenes: [...config.custom_scenes, copy] })
  }

  const handleDeleteCustom = async (scene: CustomScene) => {
    const saved = await saveConfigPatch({
      custom_scenes: config.custom_scenes.filter((item) => item.id !== scene.id),
      family_scene_assignments: config.family_scene_assignments.filter(
        (assignment) => assignment.scene_id !== scene.id,
      ),
      active_scene:
        config.active_scene?.source === 'custom' && config.active_scene.id === scene.id
          ? null
          : config.active_scene,
    })
    if (saved) setDeleteCandidateId(null)
  }

  const handleResetSystemScene = async (id: string) => {
    await saveConfigPatch({
      system_scene_overrides: config.system_scene_overrides.filter((scene) => scene.id !== id),
    })
  }

  const handleExportCustomScenes = () => {
    const json = serializeCustomScenes(config.custom_scenes)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `typelite-prompt-presets-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleImportCustomScenes = async (file: File | undefined) => {
    if (!file) return
    setSaveError(null)
    setMergeMsg(null)
    setMergeOk(false)

    try {
      const json = await readFileText(file)
      const result = importCustomScenesJson(json, {
        existingIds: new Set(config.custom_scenes.map((scene) => scene.id)),
        createId: createSceneId,
        nowIso,
      })

      if (result.scenes.length === 0) {
        setSaveError(t('scenes.importNothing'))
        return
      }

      const saved = await saveConfigPatch({
        custom_scenes: [...config.custom_scenes, ...result.scenes],
      })
      if (!saved) return
      const importNotes = [
        result.report.skippedInvalid > 0
          ? t('scenes.importSkippedInvalid', { count: result.report.skippedInvalid })
          : null,
        result.report.skippedLimit > 0
          ? t('scenes.importSkippedLimit', { count: result.report.skippedLimit })
          : null,
        result.report.renamedConflicts > 0
          ? t('scenes.importRenamedConflicts', { count: result.report.renamedConflicts })
          : null,
      ].filter(Boolean)
      setMergeOk(true)
      setMergeMsg(
        [
          t('scenes.importedScenes', { count: result.scenes.length }),
          importNotes.length > 0 ? importNotes.join(' · ') : null,
        ]
          .filter(Boolean)
          .join(' · '),
      )
      setTimeout(() => {
        setMergeMsg(null)
        setMergeOk(false)
      }, 3000)
    } catch {
      setSaveError(t('scenes.importFailed'))
    }
  }

  const handleCopyPrompt = async (id: string, promptTemplate: string) => {
    try {
      await navigator.clipboard.writeText(promptTemplate)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // Clipboard write failed silently
    }
  }

  return (
    <div>
      <SegmentedControl
        ariaLabel={t('settings.scenes')}
        options={[
          { value: 'prompts', label: t('scenes.tabPrompts') },
          { value: 'apps', label: t('scenes.tabApps') },
        ]}
        value={tab}
        onChange={(value) => setTab(value as ScenesTab)}
      />

      {tab === 'apps' && (
        <div className="mt-[22px]">
          <Group label={t('scenes.appWritingModes')}>
            <Row>
              <p className="row-help mt-0">{t('scenes.appWritingModesDesc')}</p>
            </Row>
            <AppWritingModes
              assignments={config.family_scene_assignments}
              sceneOptions={sceneOptions}
              onChange={handleFamilySceneChange}
            />
          </Group>
        </div>
      )}

      {tab === 'prompts' && (
        <div className="mt-[22px]">
          {config.active_scene && (
            <Group>
              <Row label={t('scenes.activeScene', { name: config.active_scene.name })}>
                <button
                  type="button"
                  onClick={() => void handleClearActiveScene()}
                  className="btn-secondary"
                >
                  {t('scenes.clearActive')}
                </button>
              </Row>
            </Group>
          )}

          {editor && (
            <Group
              label={
                editor.mode === 'create'
                  ? t('scenes.newScene')
                  : editor.mode === 'system'
                    ? editor.name
                    : t('scenes.edit')
              }
            >
              <SceneEditor
                editor={editor}
                onChange={setEditor}
                onCancel={() => setEditor(null)}
                onSave={handleSaveEditor}
              />
            </Group>
          )}

          <Group label={t('scenes.builtIn')}>
            {APP_WRITING_MODES.map((mode) => {
              const override = systemOverrideFor(mode.systemSceneId)
              const promptTemplate =
                override?.prompt_template ?? SYSTEM_SCENE_PROMPTS[mode.systemSceneId] ?? ''
              return (
                <LocalSceneCard
                  key={mode.systemSceneId}
                  id={mode.systemSceneId}
                  name={t(`scenes.systemModes.${mode.family}`)}
                  description={t('scenes.systemSceneDescription')}
                  promptTemplate={promptTemplate}
                  active={false}
                  copied={copiedId === mode.systemSceneId}
                  onCopy={() => handleCopyPrompt(mode.systemSceneId, promptTemplate)}
                  onEdit={() => handleStartEditSystem(mode.systemSceneId)}
                  onReset={override ? () => handleResetSystemScene(mode.systemSceneId) : undefined}
                />
              )
            })}
          </Group>

          <Group
            label={t('scenes.myScenes')}
            actions={
              <>
                <button
                  type="button"
                  onClick={handleExportCustomScenes}
                  disabled={config.custom_scenes.length === 0}
                  className="btn-secondary normal-case tracking-normal"
                >
                  <Download size={12} />
                  {t('scenes.export')}
                </button>
                <button
                  type="button"
                  onClick={() => importInputRef.current?.click()}
                  className="btn-secondary normal-case tracking-normal"
                >
                  <Upload size={12} />
                  {t('scenes.import')}
                </button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept="application/json,.json"
                  aria-label={t('scenes.import')}
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    void handleImportCustomScenes(file)
                  }}
                />
                <button
                  type="button"
                  onClick={handleStartCreate}
                  className="btn-accent normal-case tracking-normal"
                >
                  <Plus size={12} />
                  {t('scenes.newScene')}
                </button>
              </>
            }
          >
            {config.custom_scenes.length === 0 ? (
              <Row label={t('scenes.noCustomScenes')} help={t('scenes.noCustomScenesDesc')} />
            ) : (
              config.custom_scenes.map((scene) => (
                <LocalSceneCard
                  key={scene.id}
                  id={scene.id}
                  name={scene.name}
                  description={scene.description}
                  promptTemplate={scene.prompt_template}
                  active={
                    config.active_scene?.source === 'custom' && config.active_scene.id === scene.id
                  }
                  copied={copiedId === scene.id}
                  onCopy={() => handleCopyPrompt(scene.id, scene.prompt_template)}
                  onEdit={() => handleStartEdit(scene)}
                  onDuplicate={() => handleDuplicateCustom(scene)}
                  onDelete={() => setDeleteCandidateId(scene.id)}
                  confirmingDelete={deleteCandidateId === scene.id}
                  onCancelDelete={() => setDeleteCandidateId(null)}
                  onConfirmDelete={() => handleDeleteCustom(scene)}
                />
              ))
            )}
          </Group>
        </div>
      )}

      {mergeMsg && (
        <p className={`mt-3 text-[12px] ${!mergeOk ? 'text-error' : 'text-success'}`}>{mergeMsg}</p>
      )}
      {saveError && <p className="mt-3 text-[12px] text-error">{saveError}</p>}
    </div>
  )
}

function AppWritingModes({
  assignments,
  sceneOptions,
  onChange,
}: {
  assignments: FamilySceneAssignment[]
  sceneOptions: Array<{ id: string; name: string }>
  onChange: (family: ContextFamily, sceneId: string) => void
}) {
  const { t } = useTranslation()

  return (
    <>
      {APP_WRITING_MODES.map((mode) => {
        const selectedSceneId =
          assignments.find((assignment) => assignment.family === mode.family)?.scene_id ?? ''
        const label = t(`contextFamilies.${mode.family}`)
        const selectLabel = `${label} ${t('scenes.appWritingScene')}`

        return (
          <div key={mode.family} className="row">
            <div className="flex min-w-0 flex-[1_1_220px] items-center gap-3">
              <div className="flex flex-none items-center gap-1.5">
                {mode.icons.map((icon) => (
                  <span
                    key={icon.iconKey}
                    role="img"
                    aria-label={icon.label}
                    title={icon.label}
                    className="grid h-6 w-6 place-items-center rounded-[6px] bg-bg-secondary"
                  >
                    <AppLogo iconKey={icon.iconKey} family={mode.family} />
                  </span>
                ))}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[13px] text-text-primary">{label}</p>
                <p className="row-help truncate">
                  {t(`scenes.appModeDescriptions.${mode.family}`)}
                </p>
              </div>
            </div>

            <select
              aria-label={selectLabel}
              value={selectedSceneId}
              onChange={(event) => onChange(mode.family, event.target.value)}
              className="popup w-[180px]"
            >
              <option value="">{t(`scenes.systemModes.${mode.family}`)}</option>
              {sceneOptions.map((scene) => (
                <option key={scene.id} value={scene.id}>
                  {scene.name}
                </option>
              ))}
            </select>
          </div>
        )
      })}
    </>
  )
}

function SceneEditor({
  editor,
  onChange,
  onCancel,
  onSave,
}: {
  editor: EditorState
  onChange: (editor: EditorState) => void
  onCancel: () => void
  onSave: () => void
}) {
  const { t } = useTranslation()
  const canSave = editor.name.trim().length > 0 && editor.promptTemplate.trim().length > 0

  return (
    <>
      {editor.mode !== 'system' && (
        <>
          <label className="row">
            <span className="row-label">{t('scenes.sceneName')}</span>
            <input
              value={editor.name}
              onChange={(e) => onChange({ ...editor, name: e.target.value })}
              maxLength={80}
              className="field min-w-0 flex-[1_1_240px]"
            />
          </label>
          <label className="row">
            <span className="row-label">{t('scenes.sceneDescription')}</span>
            <input
              value={editor.description}
              onChange={(e) => onChange({ ...editor, description: e.target.value })}
              maxLength={240}
              className="field min-w-0 flex-[1_1_240px]"
            />
          </label>
        </>
      )}
      <label className="row">
        <span className="row-label basis-full">{t('scenes.promptTemplate')}</span>
        <textarea
          value={editor.promptTemplate}
          onChange={(e) => onChange({ ...editor, promptTemplate: e.target.value })}
          maxLength={4000}
          rows={5}
          className="field w-full resize-y"
        />
      </label>
      <div className="row justify-end">
        <button type="button" onClick={onCancel} className="btn-secondary">
          {t('common.cancel')}
        </button>
        <button type="button" onClick={onSave} disabled={!canSave} className="btn-accent">
          {t('common.save')}
        </button>
      </div>
    </>
  )
}

function LocalSceneCard({
  id,
  name,
  description,
  promptTemplate,
  active,
  copied,
  onCopy,
  onEdit,
  onDuplicate,
  onDelete,
  confirmingDelete = false,
  onCancelDelete,
  onConfirmDelete,
  onReset,
}: {
  id: string
  name: string
  description: string
  promptTemplate: string
  active: boolean
  copied: boolean
  onCopy: () => void
  onEdit?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
  confirmingDelete?: boolean
  onCancelDelete?: () => void
  onConfirmDelete?: () => void
  onReset?: () => void
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="row flex-col items-stretch gap-0 p-0">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full cursor-pointer items-center justify-between gap-3 border-none bg-transparent px-3.5 py-2.5 text-left"
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate text-[13px] text-text-primary">{name}</span>
            {active && (
              <span className="rounded-full bg-accent-light px-1.5 py-0.5 text-[10px] font-medium text-accent">
                {t('scenes.active')}
              </span>
            )}
          </span>
          {description && <span className="row-help block truncate">{description}</span>}
        </span>
        <ChevronDown
          size={14}
          className={`flex-none text-text-tertiary transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>
      {expanded && (
        <div className="space-y-3 border-t border-hairline px-3.5 py-3">
          <pre className="max-h-[140px] overflow-y-auto whitespace-pre-wrap rounded-[6px] bg-bg-secondary px-3 py-2 font-mono text-[12px] leading-relaxed text-text-primary">
            {promptTemplate}
          </pre>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onCopy}
              aria-label={`Copy prompt for ${name}`}
              className="btn-secondary"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? t('scenes.copied') : t('scenes.copyPrompt')}
            </button>
            {onDuplicate && (
              <button type="button" onClick={onDuplicate} className="btn-secondary">
                {t('scenes.duplicate')}
              </button>
            )}
            {onEdit && (
              <button type="button" onClick={onEdit} className="btn-secondary">
                <Pencil size={12} />
                {t('scenes.edit')}
              </button>
            )}
            {onReset && (
              <button type="button" onClick={onReset} className="btn-secondary">
                {t('scenes.resetSystemScene')}
              </button>
            )}
            {onDelete && !confirmingDelete && (
              <button type="button" onClick={onDelete} className="btn-secondary text-error">
                <Trash2 size={12} />
                {t('scenes.delete')}
              </button>
            )}
          </div>
          {confirmingDelete && onCancelDelete && onConfirmDelete && (
            <div className="rounded-[8px] bg-error/10 px-3 py-2">
              <p className="text-[12px] leading-relaxed text-text-secondary">
                {t('scenes.deleteConfirm')}
              </p>
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" onClick={onCancelDelete} className="btn-secondary">
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={onConfirmDelete}
                  className="btn-secondary bg-error/15 font-medium text-error"
                >
                  {t('scenes.delete')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <span className="sr-only">{id}</span>
    </div>
  )
}
