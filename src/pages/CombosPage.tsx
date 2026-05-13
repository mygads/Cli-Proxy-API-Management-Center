import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useNotificationStore } from '@/stores';
import { combosApi, type Combo, type ComboEntry, type ComboMetrics } from '@/services/api/combos';
import styles from './CombosPage.module.scss';

const STRATEGIES = ['fallback', 'round-robin', 'auto'] as const;
const STATUSES = ['active', 'draft', 'disabled'] as const;
const TRIGGER_OPTIONS = ['quota_exceeded', 'rate_limit', 'error'];

const emptyEntry = (): ComboEntry => ({ priority: 0, model: '', trigger_on: [] });
const emptyCombo = (): Combo => ({
  name: '', description: '', status: 'active', strategy: 'fallback', entries: [emptyEntry()]
});

function strategyBadgeClass(s: string) {
  if (s === 'round-robin') return styles.badgeRoundRobin;
  if (s === 'auto') return styles.badgeAuto;
  return styles.badgeFallback;
}
function statusBadgeClass(s: string) {
  if (s === 'active') return styles.badgeActive;
  if (s === 'draft') return styles.badgeDraft;
  return styles.badgeDisabled;
}

export function CombosPage() {
  const { t } = useTranslation();
  const { showNotification, showConfirmation } = useNotificationStore();
  const [combos, setCombos] = useState<Combo[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [form, setForm] = useState<Combo>(emptyCombo());
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'config' | 'entries' | 'metrics'>('config');
  const [metrics, setMetrics] = useState<ComboMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

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

  const openCreate = () => {
    setEditingName(null);
    setForm(emptyCombo());
    setActiveTab('config');
    setMetrics(null);
    setModalOpen(true);
  };

  const openEdit = (combo: Combo) => {
    setEditingName(combo.name);
    setForm({ ...combo, entries: combo.entries.length ? combo.entries : [emptyEntry()] });
    setActiveTab('config');
    setMetrics(null);
    setModalOpen(true);
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

  const handleTabChange = (tab: 'config' | 'entries' | 'metrics') => {
    setActiveTab(tab);
    if (tab === 'metrics' && editingName) void loadMetrics(editingName);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      showNotification(t('combos.name_required', { defaultValue: 'Combo name is required' }), 'warning');
      return;
    }
    setSaving(true);
    try {
      if (editingName) {
        await combosApi.update(editingName, form);
        showNotification(t('combos.updated', { defaultValue: 'Combo updated' }), 'success');
      } else {
        await combosApi.create(form);
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

  const updateEntry = (i: number, patch: Partial<ComboEntry>) => {
    setForm(f => ({ ...f, entries: f.entries.map((e, idx) => idx === i ? { ...e, ...patch } : e) }));
  };

  const addEntry = () => setForm(f => ({ ...f, entries: [...f.entries, emptyEntry()] }));
  const removeEntry = (i: number) => setForm(f => ({ ...f, entries: f.entries.filter((_, idx) => idx !== i) }));

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
                <th>{t('combos.col_name', { defaultValue: 'Name' })}</th>
                <th>{t('combos.col_description', { defaultValue: 'Description' })}</th>
                <th>{t('combos.col_strategy', { defaultValue: 'Strategy' })}</th>
                <th>{t('combos.col_entries', { defaultValue: 'Entries' })}</th>
                <th>{t('combos.col_status', { defaultValue: 'Status' })}</th>
                <th>{t('common.actions', { defaultValue: 'Actions' })}</th>
              </tr>
            </thead>
            <tbody>
              {combos.map(c => (
                <tr key={c.name}>
                  <td><strong>{c.name}</strong></td>
                  <td>{c.description || '—'}</td>
                  <td><span className={`${styles.badge} ${strategyBadgeClass(c.strategy)}`}>{c.strategy}</span></td>
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
            {activeTab !== 'metrics' && (
              <Button onClick={handleSave} loading={saving}>{t('common.save')}</Button>
            )}
          </>
        }
      >
        <div className={styles.modalTabs}>
          {(['config', 'entries', ...(editingName ? ['metrics'] : [])] as const).map(tab => (
            <button
              key={tab}
              className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
              onClick={() => handleTabChange(tab as 'config' | 'entries' | 'metrics')}
            >
              {t(`combos.tab_${tab}`, { defaultValue: tab.charAt(0).toUpperCase() + tab.slice(1) })}
            </button>
          ))}
        </div>

        {activeTab === 'config' && (
          <>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t('combos.field_name', { defaultValue: 'Name' })} *</label>
              <input
                className={styles.formInput}
                value={form.name}
                disabled={!!editingName}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. genfity-smart"
              />
              <div className={styles.formHint}>{t('combos.name_hint', { defaultValue: 'No "/" allowed. Cannot be changed after creation.' })}</div>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t('combos.field_description', { defaultValue: 'Description' })}</label>
              <input
                className={styles.formInput}
                value={form.description ?? ''}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t('combos.field_strategy', { defaultValue: 'Strategy' })}</label>
              <select
                className={styles.formSelect}
                value={form.strategy}
                onChange={e => setForm(f => ({ ...f, strategy: e.target.value as Combo['strategy'] }))}
              >
                {STRATEGIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {form.strategy === 'round-robin' && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>{t('combos.field_sticky_limit', { defaultValue: 'Sticky Limit' })}</label>
                <input
                  className={styles.formInput}
                  type="number"
                  min={0}
                  value={form.sticky_limit ?? 0}
                  onChange={e => setForm(f => ({ ...f, sticky_limit: parseInt(e.target.value) || 0 }))}
                />
                <div className={styles.formHint}>{t('combos.sticky_limit_hint', { defaultValue: 'Number of requests to stick to one entry before rotating.' })}</div>
              </div>
            )}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t('combos.field_status', { defaultValue: 'Status' })}</label>
              <select
                className={styles.formSelect}
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as Combo['status'] }))}
              >
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </>
        )}

        {activeTab === 'entries' && (
          <>
            {form.entries.map((entry, i) => (
              <div key={i} className={styles.entryRow}>
                <div>
                  <label className={styles.formLabel}>{t('combos.entry_priority', { defaultValue: 'Priority' })}</label>
                  <input
                    className={styles.formInput}
                    type="number"
                    value={entry.priority}
                    onChange={e => updateEntry(i, { priority: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className={styles.formLabel}>{t('combos.entry_model', { defaultValue: 'Model (prefix/model)' })}</label>
                  <input
                    className={styles.formInput}
                    value={entry.model}
                    onChange={e => updateEntry(i, { model: e.target.value })}
                    placeholder="cc/claude-opus-4-7"
                  />
                </div>
                <div>
                  <label className={styles.formLabel}>{t('combos.entry_trigger_on', { defaultValue: 'Trigger On' })}</label>
                  <select
                    className={styles.formSelect}
                    multiple
                    value={entry.trigger_on ?? []}
                    onChange={e => updateEntry(i, { trigger_on: Array.from(e.target.selectedOptions, o => o.value) })}
                    style={{ height: 72 }}
                  >
                    {TRIGGER_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <div className={styles.formHint}>{t('combos.trigger_hint', { defaultValue: 'Empty = all retriable errors' })}</div>
                </div>
                <div style={{ paddingTop: 24 }}>
                  <Button size="sm" variant="danger" onClick={() => removeEntry(i)} disabled={form.entries.length <= 1}>✕</Button>
                </div>
              </div>
            ))}
            <Button variant="secondary" size="sm" className={styles.addEntryBtn} onClick={addEntry}>
              {t('combos.add_entry', { defaultValue: '+ Add Entry' })}
            </Button>
          </>
        )}

        {activeTab === 'metrics' && (
          metricsLoading ? (
            <div className={styles.emptyState}>{t('common.loading')}</div>
          ) : !metrics || metrics.entries.length === 0 ? (
            <div className={styles.emptyState}>{t('combos.no_metrics', { defaultValue: 'No metrics data yet.' })}</div>
          ) : (
            <>
              <div className={styles.formHint} style={{ marginBottom: 12 }}>
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
          )
        )}
      </Modal>
    </div>
  );
}
