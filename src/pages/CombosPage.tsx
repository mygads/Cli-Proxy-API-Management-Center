import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useAuthStore, useNotificationStore } from '@/stores';
import { useModelsStore } from '@/stores';
import { apiKeysApi } from '@/services/api/apiKeys';
import { useConfigStore } from '@/stores';
import { combosApi, type Combo, type ComboEntry, type ComboMetrics } from '@/services/api/combos';
import { ModelPicker } from '@/components/ui/ModelPicker';
import styles from './CombosPage.module.scss';

const STATUSES = ['active', 'draft', 'disabled'] as const;

const emptyCombo = (): Combo => ({
  name: '',
  description: '',
  display_name: '',
  status: 'active',
  load_balance: false,
  entries: [],
});

function lbBadgeClass(lb: boolean) {
  return lb ? styles.badgeRoundRobin : styles.badgeFallback;
}
function statusBadgeClass(s: string) {
  if (s === 'active') return styles.badgeActive;
  if (s === 'draft') return styles.badgeDraft;
  return styles.badgeDisabled;
}

export function CombosPage() {
  const { t } = useTranslation();
  const { showNotification, showConfirmation } = useNotificationStore();
  const auth = useAuthStore();
  const config = useConfigStore((s) => s.config);
  const models = useModelsStore((s) => s.models);
  const modelsLoading = useModelsStore((s) => s.loading);
  const fetchModelsFromStore = useModelsStore((s) => s.fetchModels);

  const [combos, setCombos] = useState<Combo[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [form, setForm] = useState<Combo>(emptyCombo());
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [metrics, setMetrics] = useState<ComboMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [showMetrics, setShowMetrics] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await combosApi.list();
      setCombos(res.data ?? []);
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : t('combos.load_error', { defaultValue: 'Failed to load combos' }), 'error');
    } finally {
      setLoading(false);
    }
  }, [showNotification, t]);

  useEffect(() => { void load(); }, [load]);

  const ensureModelsLoaded = useCallback(async () => {
    if (models.length > 0) return;
    if (auth.connectionStatus !== 'connected' || !auth.apiBase) return;
    try {
      const configKeys = Array.isArray(config?.apiKeys) ? (config!.apiKeys as unknown as string[]) : [];
      let primaryKey = configKeys[0];
      if (!primaryKey) {
        try {
          const list = await apiKeysApi.list();
          if (Array.isArray(list) && list.length > 0) {
            const first = list[0] as unknown;
            if (typeof first === 'string') primaryKey = first;
            else if (first && typeof first === 'object') {
              const rec = first as Record<string, unknown>;
              primaryKey = String(rec['api-key'] ?? rec.apiKey ?? rec.key ?? rec.Key ?? '');
            }
          }
        } catch { /* ignore */ }
      }
      await fetchModelsFromStore(auth.apiBase, primaryKey || undefined);
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : t('combos.models_load_error', { defaultValue: 'Failed to load model list' }), 'warning');
    }
  }, [models.length, auth.connectionStatus, auth.apiBase, config, fetchModelsFromStore, showNotification, t]);

  const openCreate = () => {
    setEditingName(null);
    setForm(emptyCombo());
    setMetrics(null);
    setShowMetrics(false);
    setModalOpen(true);
    void ensureModelsLoaded();
  };

  const openEdit = (combo: Combo) => {
    setEditingName(combo.name);
    setForm({ ...combo, entries: combo.entries.length ? combo.entries : [] });
    setMetrics(null);
    setShowMetrics(false);
    setModalOpen(true);
    void ensureModelsLoaded();
  };

  const loadMetrics = async (name: string) => {
    setMetricsLoading(true);
    try {
      const m = await combosApi.metrics(name);
      setMetrics(m);
    } catch {
      setMetrics(null);
    } finally {
      setMetricsLoading(false);
    }
  };

  const toggleMetrics = () => {
    const next = !showMetrics;
    setShowMetrics(next);
    if (next && editingName) void loadMetrics(editingName);
  };

  const handleSave = async () => {
    const name = form.name.trim();
    if (!name) {
      showNotification(t('combos.name_required', { defaultValue: 'Combo name is required' }), 'warning');
      return;
    }
      if (!/^[a-zA-Z0-9_./:-]+$/.test(name)) {
      showNotification(t('combos.name_invalid', { defaultValue: 'Name may only contain letters, digits, dashes, underscores, dots, slashes, and colons' }), 'warning');
      return;
    }
    if (form.entries.length === 0) {
      showNotification(t('combos.entries_required', { defaultValue: 'Add at least one model to the combo' }), 'warning');
      return;
    }
    for (const entry of form.entries) {
      if (!entry.model.trim()) {
        showNotification(t('combos.entry_model_required', { defaultValue: 'Each entry needs a model (e.g. cc/claude-opus-4-7)' }), 'warning');
        return;
      }
      if (!entry.model.includes('/')) {
        showNotification(t('combos.entry_prefix_required', { defaultValue: 'Each entry model must include a provider prefix (e.g. cc/...)' }), 'warning');
        return;
      }
    }

    const payload: Combo = {
      ...form,
      name,
      entries: form.entries.map((entry, idx) => ({
        ...entry,
        priority: form.load_balance ? (entry.priority ?? 0) : idx,
        model: entry.model.trim(),
      })),
    };

    setSaving(true);
    try {
      if (editingName) {
        const renamed = name !== editingName;
        if (renamed) {
          await combosApi.create(payload);
          await combosApi.delete(editingName);
          showNotification(t('combos.renamed', { defaultValue: 'Combo renamed' }), 'success');
        } else {
          await combosApi.update(editingName, payload);
          showNotification(t('combos.updated', { defaultValue: 'Combo updated' }), 'success');
        }
      } else {
        await combosApi.create(payload);
        showNotification(t('combos.created', { defaultValue: 'Combo created' }), 'success');
      }
      setModalOpen(false);
      void load();
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : t('combos.save_error', { defaultValue: 'Failed to save combo' }), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (name: string) => {
    showConfirmation({
      title: t('combos.delete_title', { defaultValue: 'Delete Combo' }),
      message: t('combos.delete_confirm', { defaultValue: `Delete combo "${name}"?` }),
      variant: 'danger',
      confirmText: t('common.confirm'),
      onConfirm: async () => {
        try {
          await combosApi.delete(name);
          showNotification(t('combos.deleted', { defaultValue: 'Combo deleted' }), 'success');
          void load();
        } catch (e: unknown) {
          showNotification(e instanceof Error ? e.message : t('combos.delete_error', { defaultValue: 'Failed to delete' }), 'error');
        }
      }
    });
  };

  const addModelFromPicker = (model: string) => {
    setForm((f) => {
      if (f.entries.some((e) => e.model === model)) {
        return { ...f, entries: f.entries.filter((e) => e.model !== model) };
      }
      return { ...f, entries: [...f.entries, { priority: f.entries.length, model, trigger_on: [] }] };
    });
  };

  const updateEntry = (i: number, patch: Partial<ComboEntry>) => {
    setForm((f) => ({ ...f, entries: f.entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)) }));
  };

  const removeEntry = (i: number) => {
    setForm((f) => ({ ...f, entries: f.entries.filter((_, idx) => idx !== i) }));
  };

  const moveEntry = (i: number, direction: -1 | 1) => {
    setForm((f) => {
      const j = i + direction;
      if (j < 0 || j >= f.entries.length) return f;
      const next = f.entries.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return { ...f, entries: next };
    });
  };

  const existingSelections = form.entries.map((e) => e.model);

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>{t('combos.title', { defaultValue: 'Virtual Combos' })}</h1>
      <Card>
        <div className={styles.header}>
          <span>{t('combos.subtitle', { defaultValue: 'Named fallback chains for model routing' })}</span>
          <Button onClick={openCreate}>{t('combos.new', { defaultValue: 'New Combo' })}</Button>
        </div>
        {loading ? (
          <div className={styles.emptyState}>{t('common.loading')}</div>
        ) : combos.length === 0 ? (
          <div className={styles.emptyState}>{t('combos.empty', { defaultValue: 'No combos yet. Create one to get started.' })}</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('combos.col_name', { defaultValue: 'Model ID' })}</th>
                <th>{t('combos.col_display_name', { defaultValue: 'Display Name' })}</th>
                <th>{t('combos.col_description', { defaultValue: 'Description' })}</th>
                <th>{t('combos.col_strategy', { defaultValue: 'Mode' })}</th>
                <th>{t('combos.col_entries', { defaultValue: 'Entries' })}</th>
                <th>{t('combos.col_status', { defaultValue: 'Status' })}</th>
                <th>{t('common.actions', { defaultValue: 'Actions' })}</th>
              </tr>
            </thead>
            <tbody>
              {combos.map(c => (
                <tr key={c.name}>
                  <td><strong>{c.name}</strong></td>
                  <td>{c.display_name || '—'}</td>
                  <td>{c.description || '—'}</td>
                  <td><span className={`${styles.badge} ${lbBadgeClass(c.load_balance)}`}>{c.load_balance ? 'load balance' : 'fallback'}</span></td>
                  <td>{c.entries?.length ?? 0}</td>
                  <td><span className={`${styles.badge} ${statusBadgeClass(c.status)}`}>{c.status}</span></td>
                  <td>
                    <div className={styles.actions}>
                      <Button size="sm" variant="secondary" onClick={() => openEdit(c)}>{t('common.edit')}</Button>
                      <Button size="sm" variant="danger" onClick={() => handleDelete(c.name)}>{t('common.delete')}</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingName ? t('combos.edit_title', { defaultValue: 'Edit Combo' }) : t('combos.create_title', { defaultValue: 'Create Combo' })}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>{t('common.cancel')}</Button>
            <Button onClick={handleSave} loading={saving}>{t('common.save')}</Button>
          </>
        }
      >
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>{t('combos.field_name', { defaultValue: 'Model ID' })} *</label>
          <input
            className={styles.formInput}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="genfity/gpt-5.5:free"
          />
          <div className={styles.formHint}>{t('combos.name_hint', { defaultValue: 'The model ID customers use to call this combo (e.g. "genfity/gpt-5.5:free"). Letters, digits, dashes, underscores, dots, slashes, and colons.' })}</div>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>{t('combos.field_display_name', { defaultValue: 'Display Name (Identity Rewrite)' })}</label>
          <input
            className={styles.formInput}
            value={form.display_name ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
            placeholder="GPT-5.5|OpenAI"
          />
          <div className={styles.formHint}>
            {t('combos.display_name_hint', { defaultValue: 'Optional. Format: "ModelName|Vendor" (e.g. "GPT-5.5|OpenAI"). When set, identity questions like "what model are you?" are answered with this name instead of forwarding to upstream. Leave empty to disable identity rewrite (response stays pure from upstream).' })}
          </div>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>{t('combos.field_description', { defaultValue: 'Description' })}</label>
          <input
            className={styles.formInput}
            value={form.description ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>{t('combos.field_load_balance', { defaultValue: 'Load Balance' })}</label>
          <div className={styles.strategyChips}>
            <button
              type="button"
              className={!form.load_balance ? `${styles.strategyChip} ${styles.strategyChipActive}` : styles.strategyChip}
              onClick={() => setForm((f) => ({ ...f, load_balance: false }))}
            >
              {t('combos.mode_fallback', { defaultValue: 'Fallback' })}
            </button>
            <button
              type="button"
              className={form.load_balance ? `${styles.strategyChip} ${styles.strategyChipActive}` : styles.strategyChip}
              onClick={() => setForm((f) => ({ ...f, load_balance: true }))}
            >
              {t('combos.mode_load_balance', { defaultValue: 'Load Balance' })}
            </button>
          </div>
          <div className={styles.formHint}>
            {form.load_balance
              ? t('combos.lb_hint_on', { defaultValue: 'Rotate requests across all entries evenly (round-robin).' })
              : t('combos.lb_hint_off', { defaultValue: 'Try in order. Move to next entry only when the previous one fails.' })}
          </div>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>{t('combos.field_status', { defaultValue: 'Status' })}</label>
          <div className={styles.strategyChips}>
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                className={form.status === s ? `${styles.strategyChip} ${styles.strategyChipActive}` : styles.strategyChip}
                onClick={() => setForm((f) => ({ ...f, status: s }))}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.formGroup}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <label className={styles.formLabel} style={{ marginBottom: 0 }}>
              {t('combos.field_entries', { defaultValue: 'Models in this combo' })} *
            </label>
            <Button size="sm" variant="secondary" onClick={() => { setPickerOpen(true); void ensureModelsLoaded(); }}>
              + {t('combos.add_model', { defaultValue: 'Add model' })}
            </Button>
          </div>

          {form.entries.length === 0 ? (
            <div className={styles.emptyList}>
              {t('combos.entries_empty_hint', { defaultValue: 'No models yet. Click "Add model" to pick from the available list.' })}
            </div>
          ) : (
            <div className={styles.entryList}>
              {form.entries.map((entry, i) => (
                <div key={`${entry.model}-${i}`} className={styles.entryCard}>
                  <div className={styles.entryIndex}>{i + 1}</div>
                  <div className={styles.entryBody}>
                    <input
                      className={styles.formInput}
                      value={entry.model}
                      onChange={(e) => updateEntry(i, { model: e.target.value })}
                      placeholder="cc/claude-opus-4-7"
                    />
                    <input
                      className={styles.formInput}
                      value={(entry.trigger_on ?? []).join(', ')}
                      onChange={(e) => updateEntry(i, {
                        trigger_on: e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                      })}
                      placeholder={t('combos.trigger_placeholder', { defaultValue: 'trigger_on e.g. rate_limit, quota_exceeded (optional)' })}
                      style={{ marginTop: 6 }}
                    />
                  </div>
                  <div className={styles.entryControls}>
                    <Button size="sm" variant="secondary" onClick={() => moveEntry(i, -1)} disabled={i === 0} title={t('combos.move_up', { defaultValue: 'Move up' })}>↑</Button>
                    <Button size="sm" variant="secondary" onClick={() => moveEntry(i, 1)} disabled={i === form.entries.length - 1} title={t('combos.move_down', { defaultValue: 'Move down' })}>↓</Button>
                    <Button size="sm" variant="danger" onClick={() => removeEntry(i)}>✕</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className={styles.formHint}>
            {form.load_balance
              ? t('combos.entries_hint_round_robin', { defaultValue: 'All entries are rotated evenly.' })
              : t('combos.entries_hint_fallback', { defaultValue: 'Order = priority. The first entry is tried first.' })}
          </div>
        </div>

        {editingName && (
          <div className={styles.formGroup}>
            <Button size="sm" variant="secondary" onClick={toggleMetrics}>
              {showMetrics
                ? t('combos.hide_metrics', { defaultValue: 'Hide metrics' })
                : t('combos.show_metrics', { defaultValue: 'Show metrics' })}
            </Button>
            {showMetrics && (
              <div style={{ marginTop: 12 }}>
                {metricsLoading ? (
                  <div className={styles.emptyState}>{t('common.loading')}</div>
                ) : !metrics || metrics.entries.length === 0 ? (
                  <div className={styles.emptyState}>{t('combos.no_metrics', { defaultValue: 'No metrics data yet.' })}</div>
                ) : (
                  <>
                    <div className={styles.formHint} style={{ marginBottom: 8 }}>
                      {t('combos.metrics_window', { defaultValue: 'Window' })}: {metrics.window}
                    </div>
                    <table className={styles.metricsTable}>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>{t('combos.metrics_total', { defaultValue: 'Total' })}</th>
                          <th>{t('combos.metrics_success', { defaultValue: 'Success' })}</th>
                          <th>{t('combos.metrics_rate', { defaultValue: 'Rate' })}</th>
                          <th>p50 (s)</th>
                          <th>p95 (s)</th>
                          <th>p99 (s)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {metrics.entries.map(e => (
                          <tr key={e.entry_index}>
                            <td>{e.entry_index}</td>
                            <td>{e.total_requests}</td>
                            <td>{e.success_count}</td>
                            <td>{(e.success_rate * 100).toFixed(1)}%</td>
                            <td>{e.latency_p50_sec.toFixed(3)}</td>
                            <td>{e.latency_p95_sec.toFixed(3)}</td>
                            <td>{e.latency_p99_sec.toFixed(3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      <ModelPicker
        open={pickerOpen}
        models={models}
        existingSelections={existingSelections}
        loading={modelsLoading}
        onClose={() => setPickerOpen(false)}
        onPick={(m) => {
          addModelFromPicker(m);
        }}
      />
    </div>
  );
}
