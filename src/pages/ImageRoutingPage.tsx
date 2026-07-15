import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useNotificationStore } from '@/stores';
import { combosApi, type Combo } from '@/services/api/combos';
import {
  imageRoutingApi,
  IMAGE_ROUTING_MAX_CHAIN,
  type ImageRoutingConfig,
  type ImageRoutingEntry,
} from '@/services/api/imageRouting';
import styles from './ImageRoutingPage.module.scss';

const emptyConfig = (): ImageRoutingConfig => ({
  enabled: false,
  routed_combos: [],
  chain: [],
});

export function ImageRoutingPage() {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();

  const [config, setConfig] = useState<ImageRoutingConfig>(emptyConfig());
  const [combos, setCombos] = useState<Combo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgRes, comboRes] = await Promise.all([
        imageRoutingApi.get(),
        combosApi.list(),
      ]);
      const cfg = cfgRes.config ?? emptyConfig();
      setConfig({
        enabled: !!cfg.enabled,
        routed_combos: Array.isArray(cfg.routed_combos) ? cfg.routed_combos : [],
        chain: Array.isArray(cfg.chain) ? cfg.chain : [],
      });
      setCombos((comboRes.data ?? []).filter((c) => c.status === 'active'));
    } catch (e: unknown) {
      showNotification(
        e instanceof Error ? e.message : t('image_routing.load_error', { defaultValue: 'Failed to load image routing' }),
        'error',
      );
    } finally {
      setLoading(false);
    }
  }, [showNotification, t]);

  useEffect(() => { void load(); }, [load]);

  const toggleRoutedCombo = (name: string) => {
    setConfig((prev) => {
      const has = prev.routed_combos.includes(name);
      return {
        ...prev,
        routed_combos: has
          ? prev.routed_combos.filter((n) => n !== name)
          : [...prev.routed_combos, name],
      };
    });
  };

  const setChain = (chain: ImageRoutingEntry[]) => {
    // Re-number priority by position so the backend stores a clean order.
    setConfig((prev) => ({ ...prev, chain: chain.map((e, i) => ({ ...e, priority: i })) }));
  };

  const addChainEntry = () => {
    if (config.chain.length >= IMAGE_ROUTING_MAX_CHAIN) return;
    setChain([...config.chain, { priority: config.chain.length, model: '' }]);
  };

  const updateChainModel = (idx: number, model: string) => {
    const next = config.chain.slice();
    next[idx] = { ...next[idx], model };
    setChain(next);
  };

  const removeChainEntry = (idx: number) => {
    setChain(config.chain.filter((_, i) => i !== idx));
  };

  const moveChainEntry = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= config.chain.length) return;
    const next = config.chain.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    setChain(next);
  };

  const validate = (): string | null => {
    const seen = new Set<string>();
    for (const [i, e] of config.chain.entries()) {
      const model = e.model.trim();
      if (!model) return t('image_routing.entry_missing_model', { defaultValue: `Chain entry #${i + 1} is missing a model` });
      if (!model.includes('/')) return t('image_routing.entry_no_prefix', { defaultValue: `Chain entry #${i + 1} "${model}" must include a provider prefix` });
      const key = model.toLowerCase();
      if (seen.has(key)) return t('image_routing.entry_dup', { defaultValue: `Duplicate chain entry "${model}"` });
      seen.add(key);
    }
    if (config.enabled && config.routed_combos.length > 0 && config.chain.length === 0) {
      return t('image_routing.chain_required', { defaultValue: 'Enable with routed combos requires at least one chain entry' });
    }
    return null;
  };

  const save = async () => {
    const err = validate();
    if (err) { showNotification(err, 'warning'); return; }
    setSaving(true);
    try {
      const payload: ImageRoutingConfig = {
        enabled: config.enabled,
        routed_combos: config.routed_combos,
        chain: config.chain.map((e, i) => ({ priority: i, model: e.model.trim() })),
      };
      const res = await imageRoutingApi.update(payload);
      const cfg = res.config ?? payload;
      setConfig({
        enabled: !!cfg.enabled,
        routed_combos: Array.isArray(cfg.routed_combos) ? cfg.routed_combos : [],
        chain: Array.isArray(cfg.chain) ? cfg.chain : [],
      });
      showNotification(t('image_routing.saved', { defaultValue: 'Image routing saved' }), 'success');
    } catch (e: unknown) {
      showNotification(
        e instanceof Error ? e.message : t('image_routing.save_error', { defaultValue: 'Failed to save image routing' }),
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Card><div className={styles.loading}>{t('common.loading', { defaultValue: 'Loading…' })}</div></Card>;
  }

  const chainFull = config.chain.length >= IMAGE_ROUTING_MAX_CHAIN;

  return (
    <div className={styles.page}>
      <Card
        title={t('image_routing.title', { defaultValue: 'Image Routing' })}
        extra={<Button variant="primary" onClick={() => void save()} disabled={saving}>{t('common.save', { defaultValue: 'Save' })}</Button>}
      >
        <p className={styles.desc}>
          {t('image_routing.description', {
            defaultValue: 'When a request carries an image and targets one of the selected combos, it is routed entirely through the chain below instead of that combo\'s normal fallback. Text-only requests are unaffected.',
          })}
        </p>
        <div className={styles.row}>
          <ToggleSwitch
            checked={config.enabled}
            onChange={(v) => setConfig((prev) => ({ ...prev, enabled: v }))}
            label={t('image_routing.enabled', { defaultValue: 'Enable image routing' })}
          />
        </div>
      </Card>

      <Card title={t('image_routing.routed_combos', { defaultValue: 'Routed combos' })}>
        <p className={styles.desc}>
          {t('image_routing.routed_combos_hint', { defaultValue: 'Only these combos re-route image requests. Non-combo models are never affected.' })}
        </p>
        {combos.length === 0 ? (
          <div className={styles.empty}>{t('image_routing.no_combos', { defaultValue: 'No active combos found.' })}</div>
        ) : (
          <div className={styles.comboGrid}>
            {combos.map((c) => (
              <label key={c.name} className={styles.comboItem}>
                <input
                  type="checkbox"
                  checked={config.routed_combos.includes(c.name)}
                  onChange={() => toggleRoutedCombo(c.name)}
                />
                <span className={styles.comboName}>{c.display_name || c.name}</span>
                <span className={styles.comboCode}>{c.name}</span>
              </label>
            ))}
          </div>
        )}
      </Card>

      <Card
        title={t('image_routing.chain', { defaultValue: 'Image fallback chain' })}
        extra={
          <Button variant="secondary" onClick={addChainEntry} disabled={chainFull}>
            {t('image_routing.add_entry', { defaultValue: 'Add model' })}
          </Button>
        }
      >
        <p className={styles.desc}>
          {t('image_routing.chain_hint', {
            defaultValue: 'First entry is the target; the rest are fallbacks (max 5). Each entry may be a model or a combo, and must include a provider prefix (e.g. mk/mk/auto).',
          })}
        </p>
        {config.chain.length === 0 ? (
          <div className={styles.empty}>{t('image_routing.chain_empty', { defaultValue: 'No entries. Add a target model.' })}</div>
        ) : (
          <div className={styles.chain}>
            {config.chain.map((e, idx) => (
              <div key={idx} className={styles.chainRow}>
                <span className={styles.chainBadge}>{idx === 0 ? t('image_routing.target', { defaultValue: 'Target' }) : `#${idx}`}</span>
                <input
                  className={styles.chainInput}
                  value={e.model}
                  placeholder="provider/model"
                  onChange={(ev) => updateChainModel(idx, ev.target.value)}
                />
                <div className={styles.chainActions}>
                  <button type="button" onClick={() => moveChainEntry(idx, -1)} disabled={idx === 0} aria-label="up">↑</button>
                  <button type="button" onClick={() => moveChainEntry(idx, 1)} disabled={idx === config.chain.length - 1} aria-label="down">↓</button>
                  <button type="button" onClick={() => removeChainEntry(idx)} aria-label="remove">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {chainFull && (
          <div className={styles.note}>{t('image_routing.chain_full', { defaultValue: 'Maximum of 6 entries (1 target + 5 fallback).' })}</div>
        )}
      </Card>
    </div>
  );
}

export default ImageRoutingPage;
