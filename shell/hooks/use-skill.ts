/**
 * KI-32: React hook wrapping callSkill with loading/error/data states.
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { callSkill, SkillResponse } from '../lib/skill-client';

export function useSkill<T = any>(
  skill: string,
  fn: string,
  params: Record<string, any> = {},
  deps: any[] = []
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);

    callSkill<T>(skill, fn, params)
      .then((res) => {
        if (!mountedRef.current) return;
        if (res.success) {
          setData(res.data);
        } else {
          setError(res.error || 'Skill call failed');
        }
      })
      .catch((err) => {
        if (!mountedRef.current) return;
        setError(err.message);
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error };
}

/**
 * Hook for calling multiple skills in parallel.
 * Returns combined data object with keys from the calls map.
 */
export function useSkills(
  calls: Record<string, { skill: string; fn: string; params?: Record<string, any> }>,
  deps: any[] = []
) {
  const [data, setData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    setLoading(true);
    setErrors({});

    const entries = Object.entries(calls);
    const promises = entries.map(([key, { skill, fn, params }]) =>
      callSkill(skill, fn, params || {}).then((res) => ({ key, res }))
    );

    Promise.all(promises)
      .then((results) => {
        if (!mountedRef.current) return;
        const newData: Record<string, any> = {};
        const newErrors: Record<string, string> = {};

        for (const { key, res } of results) {
          if (res.success) {
            newData[key] = res.data;
          } else {
            newErrors[key] = res.error || `${key} call failed`;
          }
        }

        setData(newData);
        setErrors(newErrors);
      })
      .catch((err) => {
        if (!mountedRef.current) return;
        setErrors({ _global: err.message });
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const hasErrors = Object.keys(errors).length > 0;
  return { data, loading, errors, hasErrors };
}
