import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useNotificationStore } from '@/stores';
import { healthApi, type BreakerState, type ExclusionEntry } from '@/services/api/health';
import styles from './HealthPage.module.scss';

function breakerBadgeClass(state: string) {
  if (state === 'closed') return styles.badgeClosed;
  if (state === 'open') return styles.badgeOpen;
  return styles.badgeHalfOpen;
}

function formatMs(ms?: number) {
  if (!ms || ms <= 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDate(s?: string) {
  if (!s) return '—';
  try { return new Date(s).toLocaleString(); } catch { return s; }
}

export function HealthPage() {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const [breakers, setBreakers] = useState<Record<string, BreakerState>>({});
  const [exclusions, setExclusions] = useState<Record<string, ExclusionEntry>>({});
  const [loading, setLoading] = useState(true);
  const [forcing, setForcing] = useState<string | null>(null);
  const [clearing, setClearing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, eRes] = await Promise.allSettled([
        healthApi.listBreakers(),
        healthApi.listExclusions(),
      ]);
      if (bRes.status === 'fulfilled') setBreakers(bRes.value.breakers ?? {});
      if (eRes.status === 'fulfilled') setExclusions(eRes.value.exclusions ?? {});
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : t('health.load_error', { defaultValue: 'Failed to load health data' }), 'error');
    } finally {
      setLoading(false);
    }
  }, [showNotification, t]);

  useEffect(() => { void load(); }, [load]);

  const forceBreaker = async (authId: string, action: 'open' | 'closed' | 'clear') => {
    setForcing(authId + action);
    try {
      await healthApi.forceBreaker(authId, action);
      showNotification(t('health.breaker_forced', { defaultValue: 'Breaker updated' }), 'success');
      void load();
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : t('health.force_error', { defaultValue: 'Failed to force breaker' }), 'error');
    } finally {
      setForcing(null);
    }
  };

  const clearExclusion = async (authId: string) => {
    setClearing(authId);
    try {
      await healthApi.clearExclusion(authId);
      showNotification(t('health.exclusion_cleared', { defaultValue: 'Exclusion cleared' }), 'success');
      void load();
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : t('health.clear_error', { defaultValue: 'Failed to clear exclusion' }), 'error');
    } finally {
      setClearing(null);
    }
  };

  const breakerEntries = Object.entries(breakers);
  const exclusionEntries = Object.entries(exclusions);
  const incidentMode = breakerEntries.length > 0 && exclusionEntries.length >= breakerEntries.length * 0.5;

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>{t('health.title', { defaultValue: 'Health' })}</h1>

      {incidentMode && (
        <div className={styles.incidentBanner}>
          ⚠ {t('health.incident_banner', { defaultValue: 'Incident mode active — ≥50% of credentials are excluded. Only best-scored entries will be used.' })}
        </div>
      )}

      {loading ? (
        <div>{t('common.loading')}</div>
      ) : (
        <>
          <div className={styles.section}>
            <Card title={t('health.breakers_title', { defaultValue: 'Circuit Breakers' })}
              extra={<Button size="sm" variant="secondary" onClick={load}>{t('common.refresh')}</Button>}>
              {breakerEntries.length === 0 ? (
                <div className={styles.emptyState}>{t('health.no_breakers', { defaultValue: 'No breaker data available.' })}</div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>{t('health.col_id', { defaultValue: 'Auth ID' })}</th>
                      <th>{t('health.col_provider', { defaultValue: 'Provider' })}</th>
                      <th>{t('health.col_label', { defaultValue: 'Label' })}</th>
                      <th>{t('health.col_state', { defaultValue: 'State' })}</th>
                      <th>{t('health.col_fails', { defaultValue: 'Fails' })}</th>
                      <th>{t('health.col_reset_in', { defaultValue: 'Reset In' })}</th>
                      <th>{t('common.actions', { defaultValue: 'Actions' })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakerEntries.map(([id, b]) => (
                      <tr key={id}>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.8em' }}>{id}</td>
                        <td>{b.provider ?? '—'}</td>
                        <td>{b.label ?? '—'}</td>
                        <td><span className={`${styles.badge} ${breakerBadgeClass(b.state)}`}>{b.state}</span></td>
                        <td>{b.consecutive_fails}</td>
                        <td>{formatMs(b.reset_in_ms)}</td>
                        <td>
                          <div className={styles.actions}>
                            <Button size="sm" variant="secondary"
                              loading={forcing === id + 'closed'}
                              onClick={() => void forceBreaker(id, 'closed')}>
                              {t('health.force_close', { defaultValue: 'Force Close' })}
                            </Button>
                            <Button size="sm" variant="secondary"
                              loading={forcing === id + 'open'}
                              onClick={() => void forceBreaker(id, 'open')}>
                              {t('health.force_open', { defaultValue: 'Force Open' })}
                            </Button>
                            <Button size="sm" variant="secondary"
                              loading={forcing === id + 'clear'}
                              onClick={() => void forceBreaker(id, 'clear')}>
                              {t('health.clear_force', { defaultValue: 'Clear' })}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>

          <div className={styles.section}>
            <Card title={t('health.exclusions_title', { defaultValue: 'Self-Healing Exclusions' })}>
              {exclusionEntries.length === 0 ? (
                <div className={styles.emptyState}>{t('health.no_exclusions', { defaultValue: 'No active exclusions.' })}</div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>{t('health.col_id', { defaultValue: 'Auth ID' })}</th>
                      <th>{t('health.col_provider', { defaultValue: 'Provider' })}</th>
                      <th>{t('health.col_label', { defaultValue: 'Label' })}</th>
                      <th>{t('health.col_level', { defaultValue: 'Level' })}</th>
                      <th>{t('health.col_reason', { defaultValue: 'Last Reason' })}</th>
                      <th>{t('health.col_expires', { defaultValue: 'Expires At' })}</th>
                      <th>{t('common.actions', { defaultValue: 'Actions' })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exclusionEntries.map(([id, e]) => (
                      <tr key={id}>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.8em' }}>{id}</td>
                        <td>{e.provider ?? '—'}</td>
                        <td>{e.label ?? '—'}</td>
                        <td><span className={styles.levelBadge}>{e.level}</span></td>
                        <td>{e.last_reason}</td>
                        <td>{formatDate(e.expires_at)}</td>
                        <td>
                          <Button size="sm" variant="secondary"
                            loading={clearing === id}
                            onClick={() => void clearExclusion(id)}>
                            {t('health.clear_exclusion', { defaultValue: 'Clear' })}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
