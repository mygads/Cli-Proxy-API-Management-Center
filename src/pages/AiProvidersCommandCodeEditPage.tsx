import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ModelInputList } from '@/components/ui/ModelInputList';
import { useEdgeSwipeBack } from '@/hooks/useEdgeSwipeBack';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { SecondaryScreenShell } from '@/components/common/SecondaryScreenShell';
import { apiCallApi, getApiCallErrorMessage, providersApi } from '@/services/api';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import type { ProviderKeyConfig } from '@/types';
import { headersToEntries } from '@/utils/headers';
import { areModelEntriesEqual, areStringArraysEqual } from '@/utils/compare';
import { entriesToModels, modelsToEntries } from '@/components/ui/modelInputListUtils';
import { excludedModelsToText, parseExcludedModels } from '@/components/providers/utils';
import type { ProviderFormState } from '@/components/providers';
import layoutStyles from './AiProvidersEditLayout.module.scss';
import styles from './AiProvidersPage.module.scss';

type LocationState = { fromAiProviders?: boolean } | null;
type CatalogEntry = { id: string; name: string };
type TestStatus = 'idle' | 'loading' | 'success' | 'error';

const COMMANDCODE_DEFAULT_BASE_URL = 'https://api.commandcode.ai/alpha/generate';
const COMMANDCODE_DEFAULT_PREFIX = 'cmc';
const COMMANDCODE_TEST_TIMEOUT_MS = 30_000;
const COMMANDCODE_CLI_VERSION = '0.25.7';

const COMMANDCODE_BUILTIN_CATALOG: CatalogEntry[] = [
  { id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
  { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
  { id: 'moonshotai/Kimi-K2.6', name: 'Kimi K2.6' },
  { id: 'moonshotai/Kimi-K2.5', name: 'Kimi K2.5' },
  { id: 'zai-org/GLM-5.1', name: 'GLM 5.1' },
  { id: 'zai-org/GLM-5', name: 'GLM 5' },
  { id: 'MiniMaxAI/MiniMax-M2.7', name: 'MiniMax M2.7' },
  { id: 'MiniMaxAI/MiniMax-M2.5', name: 'MiniMax M2.5' },
  { id: 'Qwen/Qwen3.6-Max-Preview', name: 'Qwen 3.6 Max Preview' },
  { id: 'Qwen/Qwen3.6-Plus', name: 'Qwen 3.6 Plus' },
  { id: 'stepfun/Step-3.5-Flash', name: 'Step 3.5 Flash' },
];

const buildEmptyForm = (): ProviderFormState => ({
  apiKey: '',
  priority: undefined,
  prefix: COMMANDCODE_DEFAULT_PREFIX,
  baseUrl: COMMANDCODE_DEFAULT_BASE_URL,
  websockets: false,
  proxyUrl: '',
  headers: [],
  models: [],
  excludedModels: [],
  modelEntries: [{ name: '', alias: '' }],
  excludedText: '',
});

const parseIndexParam = (value: string | undefined) => {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeModelEntries = (entries: Array<{ name: string; alias: string }>) =>
  (entries ?? []).reduce<Array<{ name: string; alias: string }>>((acc, entry) => {
    const name = String(entry?.name ?? '').trim();
    let alias = String(entry?.alias ?? '').trim();
    if (name && alias === name) {
      alias = '';
    }
    if (!name && !alias) return acc;
    acc.push({ name, alias });
    return acc;
  }, []);

const slugifyAlias = (id: string) => {
  const tail = id.includes('/') ? id.slice(id.lastIndexOf('/') + 1) : id;
  return tail
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

type CommandCodeFormBaseline = {
  apiKey: string;
  priority: number | null;
  prefix: string;
  models: ReturnType<typeof normalizeModelEntries>;
  excludedModels: string[];
};

const buildCommandCodeBaseline = (form: ProviderFormState): CommandCodeFormBaseline => ({
  apiKey: String(form.apiKey ?? '').trim(),
  priority:
    form.priority !== undefined && Number.isFinite(form.priority) ? Math.trunc(form.priority) : null,
  prefix: String(form.prefix ?? '').trim(),
  models: normalizeModelEntries(form.modelEntries),
  excludedModels: parseExcludedModels(form.excludedText ?? ''),
});

const getErrorMessage = (err: unknown) => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return '';
};

const generateUUID = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export function AiProvidersCommandCodeEditPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ index?: string }>();

  const { showNotification } = useNotificationStore();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const disableControls = connectionStatus !== 'connected';

  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);
  const clearCache = useConfigStore((state) => state.clearCache);

  const [configs, setConfigs] = useState<ProviderKeyConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<ProviderFormState>(() => buildEmptyForm());
  const [baseline, setBaseline] = useState(() => buildCommandCodeBaseline(buildEmptyForm()));
  const [catalog, setCatalog] = useState<CatalogEntry[]>(COMMANDCODE_BUILTIN_CATALOG);
  const [catalogRefreshing, setCatalogRefreshing] = useState(false);
  const [catalogPick, setCatalogPick] = useState('');
  const [testModel, setTestModel] = useState('');
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testMessage, setTestMessage] = useState('');

  const hasIndexParam = typeof params.index === 'string';
  const editIndex = useMemo(() => parseIndexParam(params.index), [params.index]);
  const invalidIndexParam = hasIndexParam && editIndex === null;

  const initialData = useMemo(() => {
    if (editIndex === null) return undefined;
    return configs[editIndex];
  }, [configs, editIndex]);

  const invalidIndex = editIndex !== null && !initialData;

  const title =
    editIndex !== null
      ? t('ai_providers.commandcode_edit_modal_title')
      : t('ai_providers.commandcode_add_modal_title');

  const handleBack = useCallback(() => {
    const state = location.state as LocationState;
    if (state?.fromAiProviders) {
      navigate(-1);
      return;
    }
    navigate('/ai-providers', { replace: true });
  }, [location.state, navigate]);

  const swipeRef = useEdgeSwipeBack({ onBack: handleBack });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleBack]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    fetchConfig('commandcode-api-key')
      .then((value) => {
        if (cancelled) return;
        setConfigs(Array.isArray(value) ? (value as ProviderKeyConfig[]) : []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : '';
        setError(message || t('notification.refresh_failed'));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchConfig, t]);

  useEffect(() => {
    if (loading) return;

    if (initialData) {
      const nextForm: ProviderFormState = {
        ...buildEmptyForm(),
        apiKey: initialData.apiKey ?? '',
        priority: initialData.priority,
        prefix: initialData.prefix ?? COMMANDCODE_DEFAULT_PREFIX,
        baseUrl: initialData.baseUrl ?? COMMANDCODE_DEFAULT_BASE_URL,
        websockets: Boolean(initialData.websockets),
        proxyUrl: initialData.proxyUrl ?? '',
        headers: headersToEntries(initialData.headers),
        modelEntries: modelsToEntries(initialData.models),
        excludedText: excludedModelsToText(initialData.excludedModels),
      };
      setForm(nextForm);
      setBaseline(buildCommandCodeBaseline(nextForm));
      return;
    }
    const nextForm = buildEmptyForm();
    setForm(nextForm);
    setBaseline(buildCommandCodeBaseline(nextForm));
  }, [initialData, loading]);

  const normalizedModels = useMemo(
    () => normalizeModelEntries(form.modelEntries),
    [form.modelEntries]
  );
  const normalizedExcludedModels = useMemo(
    () => parseExcludedModels(form.excludedText ?? ''),
    [form.excludedText]
  );
  const normalizedPriority = useMemo(() => {
    return form.priority !== undefined && Number.isFinite(form.priority)
      ? Math.trunc(form.priority)
      : null;
  }, [form.priority]);
  const isModelsDirty = useMemo(
    () => !areModelEntriesEqual(baseline.models, normalizedModels),
    [baseline.models, normalizedModels]
  );
  const isExcludedModelsDirty = useMemo(
    () => !areStringArraysEqual(baseline.excludedModels, normalizedExcludedModels),
    [baseline.excludedModels, normalizedExcludedModels]
  );
  const isDirty =
    baseline.apiKey !== form.apiKey.trim() ||
    baseline.priority !== normalizedPriority ||
    baseline.prefix !== String(form.prefix ?? '').trim() ||
    isModelsDirty ||
    isExcludedModelsDirty;
  const canGuard = !loading && !saving && !invalidIndexParam && !invalidIndex;

  const { allowNextNavigation } = useUnsavedChangesGuard({
    enabled: canGuard,
    shouldBlock: ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname,
    dialog: {
      title: t('common.unsaved_changes_title'),
      message: t('common.unsaved_changes_message'),
      confirmText: t('common.leave'),
      cancelText: t('common.stay'),
      variant: 'danger',
    },
  });

  const canSave = !disableControls && !saving && !loading && !invalidIndexParam && !invalidIndex;

  const availableModelOptions = useMemo(() => {
    return normalizedModels.map((entry) => {
      const value = entry.alias?.trim() || entry.name;
      const label = entry.alias?.trim() ? `${entry.alias} (${entry.name})` : entry.name;
      return { value, label };
    });
  }, [normalizedModels]);

  useEffect(() => {
    if (!availableModelOptions.length) {
      if (testModel !== '') setTestModel('');
      return;
    }
    if (!availableModelOptions.some((opt) => opt.value === testModel)) {
      setTestModel(availableModelOptions[0].value);
    }
  }, [availableModelOptions, testModel]);

  const catalogOptions = useMemo(() => {
    const existing = new Set(
      normalizedModels
        .map((m) => m.name.toLowerCase())
        .filter((s) => s.length > 0)
    );
    return catalog
      .filter((entry) => !existing.has(entry.id.toLowerCase()))
      .map((entry) => ({ value: entry.id, label: `${entry.name} (${entry.id})` }));
  }, [catalog, normalizedModels]);

  const handlePickFromCatalog = useCallback(
    (modelId: string) => {
      if (!modelId) return;
      const found = catalog.find((entry) => entry.id === modelId);
      if (!found) return;
      const alias = slugifyAlias(found.id);
      setForm((prev) => {
        const merged = prev.modelEntries.filter((entry) => entry.name?.trim() || entry.alias?.trim());
        const exists = merged.some((entry) => entry.name.trim().toLowerCase() === found.id.toLowerCase());
        if (exists) return prev;
        return {
          ...prev,
          modelEntries: [...merged, { name: found.id, alias }],
        };
      });
      setCatalogPick('');
    },
    [catalog]
  );

  const handleRefreshCatalog = useCallback(async () => {
    if (catalogRefreshing) return;
    setCatalogRefreshing(true);
    try {
      const apiKey = form.apiKey.trim();
      const headers: Record<string, string> = {
        'x-command-code-version': COMMANDCODE_CLI_VERSION,
        'x-cli-environment': 'cli',
      };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      const result = await apiCallApi.request(
        {
          method: 'GET',
          url: 'https://api.commandcode.ai/v1/models',
          header: headers,
        },
        { timeout: 15_000 }
      );
      if (result.statusCode >= 200 && result.statusCode < 300) {
        const body = result.body as { data?: Array<{ id?: string; name?: string }> } | undefined;
        const list = Array.isArray(body?.data) ? body!.data : [];
        const normalized = list
          .map((m) => ({
            id: String(m?.id ?? '').trim(),
            name: String(m?.name ?? m?.id ?? '').trim(),
          }))
          .filter((m) => m.id);
        if (normalized.length > 0) {
          setCatalog(normalized);
          showNotification(t('ai_providers.commandcode_catalog_refresh_success'), 'success');
          return;
        }
      }
      setCatalog(COMMANDCODE_BUILTIN_CATALOG);
      showNotification(t('ai_providers.commandcode_catalog_refresh_fallback'), 'info');
    } catch (err: unknown) {
      setCatalog(COMMANDCODE_BUILTIN_CATALOG);
      const message = getErrorMessage(err);
      showNotification(
        `${t('ai_providers.commandcode_catalog_refresh_fallback')}${message ? ` (${message})` : ''}`,
        'info'
      );
    } finally {
      setCatalogRefreshing(false);
    }
  }, [catalogRefreshing, form.apiKey, showNotification, t]);

  const runCommandCodeTest = useCallback(async () => {
    if (testStatus === 'loading') return;

    const alias = testModel.trim();
    if (!alias) {
      const message = t('ai_providers.commandcode_test_model_required');
      setTestStatus('error');
      setTestMessage(message);
      showNotification(message, 'error');
      return;
    }
    const entry = normalizedModels.find(
      (m) => (m.alias?.trim() || m.name) === alias
    );
    if (!entry) {
      const message = t('ai_providers.commandcode_test_model_required');
      setTestStatus('error');
      setTestMessage(message);
      showNotification(message, 'error');
      return;
    }
    const upstreamModel = entry.name.trim();
    if (!upstreamModel) {
      const message = t('ai_providers.commandcode_test_model_required');
      setTestStatus('error');
      setTestMessage(message);
      showNotification(message, 'error');
      return;
    }

    const apiKey = form.apiKey.trim();
    if (!apiKey) {
      const message = t('notification.commandcode_api_key_required');
      setTestStatus('error');
      setTestMessage(message);
      showNotification(message, 'error');
      return;
    }

    setTestStatus('loading');
    setTestMessage(t('ai_providers.commandcode_test_running'));

    try {
      const result = await apiCallApi.request(
        {
          method: 'POST',
          url: COMMANDCODE_DEFAULT_BASE_URL,
          header: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'x-command-code-version': COMMANDCODE_CLI_VERSION,
            'x-cli-environment': 'cli',
            'x-session-id': generateUUID(),
            Accept: 'text/event-stream',
          },
          data: JSON.stringify({
            threadId: generateUUID(),
            memory: '',
            config: {
              workingDir: '/tmp',
              date: new Date().toISOString().slice(0, 10),
              environment: 'web',
              structure: [],
              isGitRepo: false,
              currentBranch: '',
              mainBranch: '',
              gitStatus: '',
              recentCommits: [],
            },
            params: {
              model: upstreamModel,
              messages: [
                {
                  role: 'user',
                  content: [{ type: 'text', text: 'Reply with just OK' }],
                },
              ],
              stream: true,
              max_tokens: 16,
              temperature: 0,
            },
          }),
        },
        { timeout: COMMANDCODE_TEST_TIMEOUT_MS }
      );

      if (result.statusCode < 200 || result.statusCode >= 300) {
        throw new Error(getApiCallErrorMessage(result));
      }

      const message = t('ai_providers.commandcode_test_success');
      setTestStatus('success');
      setTestMessage(message);
      showNotification(message, 'success');
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      const errorCode =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: string }).code)
          : '';
      const isTimeout = errorCode === 'ECONNABORTED' || message.toLowerCase().includes('timeout');
      const resolvedMessage = isTimeout
        ? t('ai_providers.commandcode_test_timeout', {
            seconds: COMMANDCODE_TEST_TIMEOUT_MS / 1000,
          })
        : `${t('ai_providers.commandcode_test_failed')}: ${message || t('common.unknown_error')}`;
      setTestStatus('error');
      setTestMessage(resolvedMessage);
      showNotification(resolvedMessage, 'error');
    }
  }, [form.apiKey, normalizedModels, showNotification, t, testModel, testStatus]);

  const handleSave = useCallback(async () => {
    if (!canSave) return;

    const apiKey = form.apiKey.trim();
    if (!apiKey) {
      showNotification(t('notification.commandcode_api_key_required'), 'error');
      return;
    }

    const baseUrl = (form.baseUrl ?? '').trim() || COMMANDCODE_DEFAULT_BASE_URL;
    const prefix = (form.prefix ?? '').trim() || COMMANDCODE_DEFAULT_PREFIX;

    setSaving(true);
    setError('');
    try {
      const payload: ProviderKeyConfig = {
        apiKey,
        priority: form.priority !== undefined ? Math.trunc(form.priority) : undefined,
        prefix,
        baseUrl,
        models: entriesToModels(form.modelEntries),
        excludedModels: parseExcludedModels(form.excludedText),
      };

      const nextList =
        editIndex !== null
          ? configs.map((item, idx) => (idx === editIndex ? payload : item))
          : [...configs, payload];

      await providersApi.saveCommandCodeConfigs(nextList);
      updateConfigValue('commandcode-api-key', nextList);
      clearCache('commandcode-api-key');
      showNotification(
        editIndex !== null
          ? t('notification.commandcode_config_updated')
          : t('notification.commandcode_config_added'),
        'success'
      );
      allowNextNavigation();
      setBaseline(buildCommandCodeBaseline(form));
      handleBack();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      setError(message);
      showNotification(`${t('notification.update_failed')}: ${message}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [
    allowNextNavigation,
    canSave,
    clearCache,
    configs,
    editIndex,
    form,
    handleBack,
    showNotification,
    t,
    updateConfigValue,
  ]);

  const isTesting = testStatus === 'loading';

  return (
    <SecondaryScreenShell
      ref={swipeRef}
      contentClassName={layoutStyles.content}
      title={title}
      onBack={handleBack}
      backLabel={t('common.back')}
      backAriaLabel={t('common.back')}
      hideTopBarBackButton
      hideTopBarRightAction
      floatingAction={
        <div className={layoutStyles.floatingActions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleBack}
            className={layoutStyles.floatingBackButton}
          >
            {t('common.back')}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            loading={saving}
            disabled={!canSave}
            className={layoutStyles.floatingSaveButton}
          >
            {t('common.save')}
          </Button>
        </div>
      }
      isLoading={loading}
      loadingLabel={t('common.loading')}
    >
      <Card>
        {error && <div className="error-box">{error}</div>}
        {invalidIndexParam || invalidIndex ? (
          <div className="hint">{t('common.invalid_provider_index')}</div>
        ) : (
          <>
            <Input
              label={t('ai_providers.commandcode_add_modal_key_label')}
              placeholder={t('ai_providers.commandcode_add_modal_key_placeholder')}
              value={form.apiKey}
              onChange={(e) => setForm((prev) => ({ ...prev, apiKey: e.target.value }))}
              disabled={disableControls || saving || isTesting}
            />
            <Input
              label={t('ai_providers.priority_label')}
              hint={t('ai_providers.priority_hint')}
              type="number"
              step={1}
              value={form.priority ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                const parsed = raw.trim() === '' ? undefined : Number(raw);
                setForm((prev) => ({
                  ...prev,
                  priority: parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined,
                }));
              }}
              disabled={disableControls || saving || isTesting}
            />
            <Input
              label={t('ai_providers.prefix_label')}
              placeholder={t('ai_providers.prefix_placeholder')}
              value={form.prefix ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, prefix: e.target.value }))}
              hint={t('ai_providers.prefix_hint')}
              disabled={disableControls || saving || isTesting}
            />

            <div className={styles.modelConfigSection}>
              <div className={styles.modelConfigHeader}>
                <label className={styles.modelConfigTitle}>
                  {t('ai_providers.commandcode_models_label')}
                </label>
                <div className={styles.modelConfigToolbar}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        modelEntries: [...prev.modelEntries, { name: '', alias: '' }],
                      }))
                    }
                    disabled={disableControls || saving || isTesting}
                  >
                    {t('ai_providers.commandcode_models_add_btn')}
                  </Button>
                </div>
              </div>
              <div className={styles.sectionHint}>{t('ai_providers.commandcode_models_hint')}</div>

              <div className={styles.modelTestControls}>
                <Select
                  value={catalogPick}
                  options={catalogOptions}
                  onChange={(value) => {
                    setCatalogPick(value);
                    handlePickFromCatalog(value);
                  }}
                  placeholder={
                    catalogOptions.length
                      ? t('ai_providers.commandcode_catalog_pick_placeholder')
                      : t('ai_providers.commandcode_catalog_pick_empty')
                  }
                  className={styles.openaiTestSelect}
                  ariaLabel={t('ai_providers.commandcode_catalog_pick_label')}
                  disabled={
                    disableControls || saving || isTesting || catalogOptions.length === 0
                  }
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleRefreshCatalog()}
                  loading={catalogRefreshing}
                  disabled={disableControls || saving || isTesting}
                >
                  {t('ai_providers.commandcode_catalog_refresh')}
                </Button>
              </div>

              <ModelInputList
                entries={form.modelEntries}
                onChange={(entries) => setForm((prev) => ({ ...prev, modelEntries: entries }))}
                namePlaceholder={t('common.model_name_placeholder')}
                aliasPlaceholder={t('common.model_alias_placeholder')}
                disabled={disableControls || saving || isTesting}
                hideAddButton
                className={styles.modelInputList}
                rowClassName={styles.modelInputRow}
                inputClassName={styles.modelInputField}
                removeButtonClassName={styles.modelRowRemoveButton}
                removeButtonTitle={t('common.delete')}
                removeButtonAriaLabel={t('common.delete')}
              />

              <div className={styles.modelTestPanel}>
                <div className={styles.modelTestMeta}>
                  <label className={styles.modelTestLabel}>
                    {t('ai_providers.commandcode_test_title')}
                  </label>
                  <span className={styles.modelTestHint}>
                    {t('ai_providers.commandcode_test_hint')}
                  </span>
                </div>
                <div className={styles.modelTestControls}>
                  <Select
                    value={testModel}
                    options={availableModelOptions}
                    onChange={(value) => {
                      setTestModel(value);
                      setTestStatus('idle');
                      setTestMessage('');
                    }}
                    placeholder={
                      availableModelOptions.length
                        ? t('ai_providers.commandcode_test_select_placeholder')
                        : t('ai_providers.commandcode_test_select_empty')
                    }
                    className={styles.openaiTestSelect}
                    ariaLabel={t('ai_providers.commandcode_test_title')}
                    disabled={
                      saving ||
                      disableControls ||
                      isTesting ||
                      availableModelOptions.length === 0
                    }
                  />
                  <Button
                    variant={testStatus === 'error' ? 'danger' : 'secondary'}
                    size="sm"
                    onClick={() => void runCommandCodeTest()}
                    loading={testStatus === 'loading'}
                    disabled={
                      saving ||
                      disableControls ||
                      isTesting ||
                      availableModelOptions.length === 0
                    }
                    className={styles.modelTestAllButton}
                  >
                    {t('ai_providers.commandcode_test_action')}
                  </Button>
                </div>
              </div>

              {testMessage && (
                <div
                  className={`status-badge ${
                    testStatus === 'error'
                      ? 'error'
                      : testStatus === 'success'
                        ? 'success'
                        : 'muted'
                  }`}
                >
                  {testMessage}
                </div>
              )}
            </div>
            <div className="form-group">
              <label>{t('ai_providers.excluded_models_label')}</label>
              <textarea
                className="input"
                placeholder={t('ai_providers.excluded_models_placeholder')}
                value={form.excludedText}
                onChange={(e) => setForm((prev) => ({ ...prev, excludedText: e.target.value }))}
                rows={4}
                disabled={disableControls || saving || isTesting}
              />
              <div className="hint">{t('ai_providers.excluded_models_hint')}</div>
            </div>
          </>
        )}
      </Card>
    </SecondaryScreenShell>
  );
}
