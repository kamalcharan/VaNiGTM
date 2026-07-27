'use client';

/**
 * /dashboard/storyteller — mission control home for Storytelling.
 *
 * GTM pipeline v2: Storyteller lives HERE, not in onboarding (a shareable
 * deck from thin inputs is a landmine — see design-notes-gtm-pipeline-v2).
 * Build reads the confirmed profile + knowledge graph; awaiting decks are
 * approved here (mints the share token), approved decks share/open.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { formatDate } from '@/lib/format';
import { useToast } from '@/components/toast';
import {
  VdfPageHeader,
  VdfButton,
  VdfLoader,
  VdfKgLoader,
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
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const buildInFlight = useRef(false);

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
    if (buildInFlight.current) return;
    buildInFlight.current = true;
    setBuilding(true);
    try {
      // POST /build reads nothing from the request body — it's driven
      // entirely by the tenant's confirmed profile + knowledge graph.
      // The call blocks until the draft lands (usually under two minutes).
      await apiFetch(API.storyteller.build);
      showToast({ message: 'Deck drafted — review and approve to get your share link', type: 'success' });
      await loadDecks();
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Failed to build deck', type: 'error' });
    } finally {
      buildInFlight.current = false;
      setBuilding(false);
    }
  }

  async function handleApprove(deck: Deck) {
    setApprovingId(deck.id);
    try {
      await apiFetch<{ shareToken: string }>(API.storyteller.approve, {
        pathParams: { id: deck.id },
      });
      showToast({ message: 'Deck approved — share link is live', type: 'success' });
      await loadDecks();
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Failed to approve deck', type: 'error' });
    } finally {
      setApprovingId(null);
    }
  }

  async function copyShareLink(token: string) {
    const url = `${window.location.origin}/deck/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast({ message: 'Share link copied', type: 'success' });
    } catch {
      showToast({ message: url, type: 'info' });
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
        {building && (
          <div className={s.buildingCard}>
            <VdfKgLoader
              message="Storyteller is reading your knowledge graph"
              hint="Weaving your ICP, pains, proof points and differentiators into seven slides — usually under two minutes"
            />
          </div>
        )}

        {loading ? (
          <VdfLoader message="Loading your decks" />
        ) : decks.length === 0 && !building ? (
          <VdfEmptyState
            icon="🎬"
            title="No decks yet"
            description="Storyteller turns your confirmed ICP, pains and competitor map into a shareable pitch deck."
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
              const isAwaiting = deck.status === 'awaiting';
              const title = deck.title || 'Untitled deck';
              const createdAt = formatDate(deck.created_at);

              return (
                <div
                  key={deck.id}
                  className={`${s.deckRow} ${isApproved ? s.deckRowLink : ''}`}
                  onClick={isApproved ? () => router.push(`/deck/${deck.share_token}`) : undefined}
                >
                  <div className={s.deckMain}>
                    <span className={s.deckTitle}>{title}</span>
                    <span className={s.deckDate}>{createdAt}</span>
                  </div>
                  <div className={s.deckActions}>
                    {isAwaiting && (
                      <VdfButton
                        variant="primary"
                        size="sm"
                        loading={approvingId === deck.id}
                        onClick={(e) => { e.stopPropagation(); handleApprove(deck); }}
                      >
                        Approve &amp; share
                      </VdfButton>
                    )}
                    {isApproved && deck.share_token && (
                      <VdfButton
                        variant="outline"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); copyShareLink(deck.share_token!); }}
                      >
                        Copy link
                      </VdfButton>
                    )}
                    <VdfStatusBadge
                      label={deck.status === 'approved' ? 'Approved' : 'Awaiting approval'}
                      variant={deck.status === 'approved' ? 'success' : 'muted'}
                      size="sm"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
