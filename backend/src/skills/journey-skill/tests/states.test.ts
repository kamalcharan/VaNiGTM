/**
 * The state machine, on its own.
 *
 * These are the cheapest tests in the product and they guard the most
 * expensive mistake: a journey that can be moved somewhere it should not go,
 * or moved backwards without saying why. Both produce a ledger that reads as
 * an account of what happened while being wrong about it — the single
 * failure mode this whole table exists to prevent.
 */

import {
  LADDER, EXITS, STATES, OWED,
  isState, isExit, isBackward, canMove, allowedFrom, reasonRequired,
  isCampaignMove, CAMPAIGN_MOVES, arcFor,
  type JourneyState,
} from '../states';

describe('the state set', () => {
  it('is the ladder plus the exits, with nothing duplicated', () => {
    expect(STATES).toHaveLength(LADDER.length + EXITS.length);
    expect(new Set(STATES).size).toBe(STATES.length);
  });

  it('gives every state a line saying what is owed', () => {
    // A state with no debt attached is a status, and a board of statuses
    // does not get worked.
    for (const s of STATES) {
      expect(OWED[s]).toBeTruthy();
    }
  });

  it('recognises its own states and rejects anything else', () => {
    expect(isState('qualified')).toBe(true);
    expect(isState('Qualified')).toBe(false);
    expect(isState('contacted')).toBe(false);   // the CRM stage machine's word
    expect(isExit('parked')).toBe(true);
    expect(isExit('waiting')).toBe(false);
  });
});

describe('backward moves', () => {
  it('is backward when it loses a rung', () => {
    expect(isBackward('answered', 'addressed')).toBe(true);
    expect(isBackward('qualified', 'researched')).toBe(true);
  });

  it('is not backward going up', () => {
    expect(isBackward('sourced', 'waiting')).toBe(false);
  });

  it('does not call an exit backward', () => {
    // Ruling a company out is not a regression, it is a conclusion. Treating
    // it as backward would be harmless here but wrong in reasonRequired's
    // sibling case, and the two must not disagree.
    expect(isBackward('qualified', 'ruled_out')).toBe(false);
    expect(isBackward('waiting', 'parked')).toBe(false);
  });
});

describe('legal moves', () => {
  it('allows forward skips', () => {
    // Somebody who emailed a company without walking it through the states
    // still moved that relationship. Refusing this would make the ledger lie.
    expect(canMove('sourced', 'waiting')).toBe(true);
    expect(canMove('qualified', 'waiting')).toBe(true);
  });

  it('allows the loop that makes it a cycle', () => {
    // answered → addressed is "another story is owed" and is the
    // most-travelled edge in a working journey.
    expect(canMove('answered', 'addressed')).toBe(true);
  });

  it('refuses to resurrect a ruled-out company straight into a send', () => {
    // It has to pass back through a state a human can see and object to.
    expect(canMove('ruled_out', 'waiting')).toBe(false);
    expect(canMove('ruled_out', 'qualified')).toBe(true);
  });

  it('lets a human undo a ruling', () => {
    // A decision nobody can reverse is a decision people avoid making.
    expect(canMove('ruled_out', 'researched')).toBe(true);
    expect(canMove('lost', 'parked')).toBe(true);
  });

  it('leads nowhere from won — arc 2 owns it', () => {
    expect(allowedFrom('won')).toHaveLength(0);
  });

  it('never lists a target that is not a real state', () => {
    for (const s of STATES) {
      for (const t of allowedFrom(s)) expect(isState(t)).toBe(true);
    }
  });

  it('never allows a journey to move to itself', () => {
    for (const s of STATES) {
      expect(allowedFrom(s)).not.toContain(s);
    }
  });
});

describe('R-J1 — when a reason is demanded', () => {
  it('demands one for every exit', () => {
    for (const exit of EXITS) {
      expect(reasonRequired('qualified', exit)).toBe(true);
    }
  });

  it('demands one for every backward move', () => {
    expect(reasonRequired('answered', 'addressed')).toBe(true);
    expect(reasonRequired('ready', 'addressed')).toBe(true);
  });

  it('does NOT demand one going forward', () => {
    // Asking for a reason on routine forward moves trains people to type
    // "n/a", which is worse than not asking — it fills the column the
    // Learning Graph reads with noise.
    expect(reasonRequired('sourced', 'researched')).toBe(false);
    expect(reasonRequired('qualified', 'addressed')).toBe(false);
    expect(reasonRequired('answered', 'won')).toBe(false);
  });

  it('demands one for every legal move out of an exit', () => {
    // Coming back from parked or ruled_out reverses a judgement somebody
    // made and recorded. "Why did this company come back" is a better
    // question than "why did it go away", and un-parking without a reason is
    // how a cohort quietly refills with companies rejected for good cause.
    for (const exit of EXITS) {
      for (const to of allowedFrom(exit)) {
        expect(reasonRequired(exit as JourneyState, to)).toBe(true);
      }
    }
  });
});

describe('R-J3 — what a campaign may do', () => {
  it('is exactly two moves', () => {
    expect(CAMPAIGN_MOVES).toHaveLength(2);
    expect(isCampaignMove('ready', 'waiting')).toBe(true);
    expect(isCampaignMove('waiting', 'answered')).toBe(true);
  });

  it('does not include ruling a company out, parking it, or advancing it', () => {
    // A delivery partner deciding a company is not a fit is the campaign
    // owning the relationship, which is the one thing it must never do.
    expect(isCampaignMove('qualified', 'ruled_out')).toBe(false);
    expect(isCampaignMove('answered', 'won')).toBe(false);
    expect(isCampaignMove('waiting', 'parked')).toBe(false);
  });

  it('only names moves the state machine allows anyway', () => {
    for (const [from, to] of CAMPAIGN_MOVES) expect(canMove(from, to)).toBe(true);
  });
});

describe('arcs', () => {
  it('sends won through the doorway and nothing else', () => {
    expect(arcFor('won')).toBe('lifetime');
    for (const s of STATES) {
      if (s !== 'won') expect(arcFor(s)).toBe('acquisition');
    }
  });
});
