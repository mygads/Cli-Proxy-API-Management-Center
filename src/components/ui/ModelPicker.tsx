import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';
import { Button } from './Button';
import type { ModelInfo } from '@/utils/models';
import styles from './ModelPicker.module.scss';

function extractPrefix(model: string): string | null {
  const idx = model.indexOf('/');
  if (idx <= 0) return null;
  return model.slice(0, idx);
}

interface ModelPickerProps {
  open: boolean;
  models: ModelInfo[];
  existingSelections: string[];
  loading: boolean;
  onClose: () => void;
  onPick: (model: string) => void;
  title?: string;
}

export function ModelPicker({ open, models, existingSelections, loading, onClose, onPick, title }: ModelPickerProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  const handleClose = useCallback(() => {
    setSearch('');
    onClose();
  }, [onClose]);

  const groups = useMemo(() => {
    const map = new Map<string, ModelInfo[]>();
    const query = search.trim().toLowerCase();
    models.forEach((m) => {
      if (query && !m.name.toLowerCase().includes(query)) return;
      const prefix = extractPrefix(m.name) ?? '(no prefix)';
      const list = map.get(prefix) ?? [];
      list.push(m);
      map.set(prefix, list);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [models, search]);

  const existing = useMemo(() => new Set(existingSelections), [existingSelections]);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title ?? t('combos.picker_title', { defaultValue: 'Select Model' })}
      footer={<Button variant="secondary" onClick={handleClose}>{t('common.close', { defaultValue: 'Close' })}</Button>}
    >
      <input
        className={styles.search}
        placeholder={t('combos.picker_search', { defaultValue: 'Search by model id...' })}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {loading ? (
        <div className={styles.empty}>{t('common.loading')}</div>
      ) : groups.length === 0 ? (
        <div className={styles.empty}>{t('combos.picker_empty', { defaultValue: 'No models match. Try refreshing from the System page first.' })}</div>
      ) : (
        <div className={styles.scroll}>
          {groups.map(([prefix, items]) => (
            <div key={prefix}>
              <div className={styles.groupLabel}>{prefix}</div>
              <div className={styles.pills}>
                {items.map((m) => {
                  const already = existing.has(m.name);
                  return (
                    <button
                      key={m.name}
                      type="button"
                      className={already ? `${styles.pill} ${styles.pillAdded}` : styles.pill}
                      onClick={() => onPick(m.name)}
                      title={m.description || m.alias || m.name}
                    >
                      {m.name}
                      {already ? ' ✓' : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

export default ModelPicker;
