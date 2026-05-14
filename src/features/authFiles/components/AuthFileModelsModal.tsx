import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { AuthFileModelItem } from '@/features/authFiles/constants';
import { isModelExcluded } from '@/features/authFiles/constants';
import { authFilesApi } from '@/services/api';
import { useNotificationStore } from '@/stores';
import styles from '@/pages/AuthFilesPage.module.scss';

export type AuthFileModelsModalProps = {
  open: boolean;
  fileName: string;
  fileType: string;
  loading: boolean;
  error: 'unsupported' | null;
  models: AuthFileModelItem[];
  excluded: Record<string, string[]>;
  onClose: () => void;
  onCopyText: (text: string) => void;
  onRefresh?: () => void;
};

type TestState = Record<string, { loading: boolean; ok?: boolean; latencyMs?: number; error?: string }>;

const OAUTH_CHANNELS = new Set(['claude', 'codex', 'kiro', 'github', 'gemini-cli', 'kimi', 'qwen', 'cline', 'kilocode', 'antigravity']);

export function AuthFileModelsModal(props: AuthFileModelsModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const { open, fileName, fileType, loading, error, models, excluded, onClose, onCopyText, onRefresh } = props;

  const [testState, setTestState] = useState<TestState>({});
  const [customModel, setCustomModel] = useState('');
  const [customAlias, setCustomAlias] = useState('');
  const [showAddModel, setShowAddModel] = useState(false);
  const [addingModel, setAddingModel] = useState(false);

  const isOAuthProvider = OAUTH_CHANNELS.has((fileType || '').toLowerCase());
  const channel = (fileType || '').toLowerCase();

  const handleTest = useCallback(async (modelId: string) => {
    setTestState((prev) => ({ ...prev, [modelId]: { loading: true } }));
    try {
      const result = await authFilesApi.testAuthFileModel(fileName, modelId);
      setTestState((prev) => ({
        ...prev,
        [modelId]: { loading: false, ok: result.ok, latencyMs: result.latency_ms, error: result.error },
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setTestState((prev) => ({ ...prev, [modelId]: { loading: false, ok: false, error: msg } }));
    }
  }, [fileName]);

  const handleAddModel = useCallback(async () => {
    const name = customModel.trim();
    const alias = customAlias.trim();
    if (!name) return;

    setAddingModel(true);
    try {
      const existingAliases = await authFilesApi.getOauthModelAlias();
      const channelAliases = existingAliases[channel] ?? [];
      const newEntry = { name, alias: alias || name };
      const updated = [...channelAliases, newEntry];
      await authFilesApi.saveOauthModelAlias(channel, updated);
      showNotification(t('auth_files.model_added_success', { defaultValue: `Model "${alias || name}" added to ${channel}` }), 'success');
      setCustomModel('');
      setCustomAlias('');
      setShowAddModel(false);
      onRefresh?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to add model';
      showNotification(msg, 'error');
    } finally {
      setAddingModel(false);
    }
  }, [customModel, customAlias, channel, t, showNotification, onRefresh]);

  const handleNavigateAlias = () => {
    onClose();
    navigate('/auth-files/oauth-model-alias');
  };

  const handleNavigateExcluded = () => {
    onClose();
    navigate('/auth-files/oauth-excluded');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={680}
      title={t('auth_files.models_title', { defaultValue: 'Models' }) + ` - ${fileName}`}
      footer={
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', width: '100%', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {isOAuthProvider && (
              <>
                <Button variant="secondary" size="sm" onClick={handleNavigateAlias}>
                  {t('auth_files.manage_aliases', { defaultValue: 'Manage Aliases' })}
                </Button>
                <Button variant="secondary" size="sm" onClick={handleNavigateExcluded}>
                  {t('auth_files.manage_excluded', { defaultValue: 'Manage Excluded' })}
                </Button>
              </>
            )}
          </div>
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className={styles.hint}>
          {t('auth_files.models_loading', { defaultValue: 'Loading models...' })}
        </div>
      ) : error === 'unsupported' ? (
        <EmptyState
          title={t('auth_files.models_unsupported', { defaultValue: 'Not supported in this version' })}
          description={t('auth_files.models_unsupported_desc', {
            defaultValue: 'Please update CLI Proxy API to the latest version'
          })}
        />
      ) : (
        <>
          {models.length === 0 && !showAddModel ? (
            <EmptyState
              title={t('auth_files.models_empty', { defaultValue: 'No models available' })}
              description={t('auth_files.models_empty_desc', {
                defaultValue: 'This credential may not be loaded or has no bound models. Use "Add Model" to add one.'
              })}
            />
          ) : (
            <div className={styles.modelsList}>
              {models.map((model) => {
                const excludedModel = isModelExcluded(model.id, fileType, excluded);
                const test = testState[model.id];
                return (
                  <div
                    key={model.id}
                    className={`${styles.modelItem} ${excludedModel ? styles.modelItemExcluded : ''}`}
                  >
                    <div
                      style={{ flex: 1, cursor: 'pointer' }}
                      onClick={() => onCopyText(model.id)}
                      title={t('common.copy', { defaultValue: 'Click to copy' })}
                    >
                      <span className={styles.modelId}>{model.id}</span>
                      {model.display_name && model.display_name !== model.id && (
                        <span className={styles.modelDisplayName}>{model.display_name}</span>
                      )}
                      {model.type && <span className={styles.modelType}>{model.type}</span>}
                      {excludedModel && (
                        <span className={styles.modelExcludedBadge}>
                          {t('auth_files.models_excluded_badge', { defaultValue: 'Excluded' })}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
                      {test?.loading ? (
                        <LoadingSpinner size={12} />
                      ) : test?.ok === true ? (
                        <span style={{ color: 'var(--color-success, #22c55e)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                          OK {test.latencyMs != null ? `${test.latencyMs}ms` : ''}
                        </span>
                      ) : test?.ok === false ? (
                        <span style={{ color: 'var(--color-error, #ef4444)', fontSize: '12px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={test.error}>
                          {test.error || 'Failed'}
                        </span>
                      ) : null}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void handleTest(model.id)}
                        disabled={test?.loading}
                        style={{ padding: '2px 8px', fontSize: '11px' }}
                      >
                        {t('auth_files.test_model', { defaultValue: 'Test' })}
                      </Button>
                    </div>
                  </div>
                );
              })}

              {/* Custom model test results */}
              {Object.entries(testState)
                .filter(([id]) => !models.some((m) => m.id === id))
                .map(([id, test]) => (
                  <div key={id} className={styles.modelItem}>
                    <div style={{ flex: 1 }}>
                      <span className={styles.modelId}>{id}</span>
                      <span className={styles.modelType}>{t('auth_files.custom_model_badge', { defaultValue: 'custom' })}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
                      {test.loading ? (
                        <LoadingSpinner size={12} />
                      ) : test.ok === true ? (
                        <span style={{ color: 'var(--color-success, #22c55e)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                          OK {test.latencyMs != null ? `${test.latencyMs}ms` : ''}
                        </span>
                      ) : test.ok === false ? (
                        <span style={{ color: 'var(--color-error, #ef4444)', fontSize: '12px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={test.error}>
                          {test.error || 'Failed'}
                        </span>
                      ) : null}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void handleTest(id)}
                        disabled={test.loading}
                        style={{ padding: '2px 8px', fontSize: '11px' }}
                      >
                        {t('auth_files.test_model', { defaultValue: 'Test' })}
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* Add Model section */}
          <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-color, #e5e7eb)', paddingTop: '12px' }}>
            {showAddModel ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <Input
                      value={customModel}
                      placeholder={t('auth_files.add_model_name_placeholder', { defaultValue: 'Model name (upstream)' })}
                      onChange={(e) => setCustomModel(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && customModel.trim()) void handleAddModel(); }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Input
                      value={customAlias}
                      placeholder={t('auth_files.add_model_alias_placeholder', { defaultValue: 'Alias (client-facing, optional)' })}
                      onChange={(e) => setCustomAlias(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && customModel.trim()) void handleAddModel(); }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {isOAuthProvider && (
                    <Button size="sm" onClick={() => void handleAddModel()} disabled={!customModel.trim() || addingModel} loading={addingModel}>
                      {t('auth_files.add_model_save', { defaultValue: 'Add Model' })}
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" onClick={() => void handleTest(customModel.trim())} disabled={!customModel.trim()}>
                    {t('auth_files.test_model', { defaultValue: 'Test' })}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => { setShowAddModel(false); setCustomModel(''); setCustomAlias(''); }}>
                    {t('common.cancel', { defaultValue: 'Cancel' })}
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setShowAddModel(true)}>
                {t('auth_files.add_model_button', { defaultValue: 'Add Model' })}
              </Button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
