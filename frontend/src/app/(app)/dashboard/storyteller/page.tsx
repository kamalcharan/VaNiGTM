'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import {
  VdfPageHeader,
  VdfButton,
  VdfLoader,
  VdfEmptyState,
  VdfStatusBadge,
} from '@/components/vdf';
import s from './storyteller-page.module.css';

interface Deck {
  id: string;
  title: string | null;
  status: string;
  share_token: string | null;
  created_at: string;
}

export default function StorytellerDashboardPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);

  const loadDecks = useCallback(async () => {
    try {
      const res = await apiFetch<{ decks: Deck[]; total: number }>(API.storyteller.list);
      setDecks(res.decks);
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Failed to load decks', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadDecks();
  }, [loadDecks]);

  async function handleBuild() {
    setBuilding(true);
    try {
      // POST /build reads nothing from the request body — it's driven
      // entirely by the tenant's existing profile + knowledge graph.
      await apiFetch(API.storyteller.build);
      showToast({ message: 'Deck build started', type: 'success' });
      await loadDecks();
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Failed to build deck', type: 'error' });
    } finally {
      setBuilding(false);
    }
  }

  return (
    <div className={s.page}>
      <VdfPageHeader
        eyebrow="STORYTELLING"
        title="Your Decks"
        meta={<>{decks.length} deck{decks.length === 1 ? '' : 's'}</>}
        actions={
          <VdfButton variant="primary" onClick={handleBuild} loading={building}>
            + New Deck
          </VdfButton>
        }
      />

      <div className={s.body}>
        {loading ? (
          <VdfLoader message="Loading your decks" />
        ) : decks.length === 0 ? (
          <VdfEmptyState
            icon="🎬"
            title="No decks yet"
            description="Build your first deck from your ICP profile."
            action={
              <VdfButton variant="primary" onClick={handleBuild} loading={building}>
                + New Deck
              </VdfButton>
            }
          />
        ) : (
          <div className={s.deckList}>
            {decks.map((deck) => {
              const isApproved = deck.status === 'approved' && !!deck.share_token;
              const title = deck.title || 'Untitled deck';
              const createdAt = new Date(deck.created_at).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric',
              });

              return (
                <div
                  key={deck.id}
                  className={`${s.deckRow} ${isApproved ? s.deckRowLink : s.deckRowInert}`}
                  onClick={isApproved ? () => router.push(`/deck/${deck.share_token}`) : undefined}
                  title={isApproved ? undefined : 'Not yet approved'}
                >
                  <div className={s.deckMain}>
                    <span className={s.deckTitle}>{title}</span>
                    <span className={s.deckDate}>{createdAt}</span>
                  </div>
                  <VdfStatusBadge
                    label={deck.status === 'approved' ? 'Approved' : 'Awaiting approval'}
                    variant={deck.status === 'approved' ? 'success' : 'muted'}
                    size="sm"
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
