import { useMemo } from 'react'
import { useSurveyRounds } from '@/hooks/use-survey-rounds'
import { useRoundStore } from '@/store/round-store'
import type { SurveyRoundOut } from '@/types'

// Round picker state shared between the Setups and Assignments pages: the
// selection lives in a sessionStorage-backed store so it survives navigating
// into a market detail and back, and both pages stay on the same round.
export function useRoundSelection() {
  const { data: rounds = [], isLoading } = useSurveyRounds()
  const selectedRoundIdOverride = useRoundStore((s) => s.selectedRoundIdOverride)
  const setSelectedRoundId = useRoundStore((s) => s.setSelectedRoundIdOverride)

  // The currently running round, used to flag whether the selected round is "current".
  const currentRound = useMemo<SurveyRoundOut | null>(
    () => rounds.find((r) => r.round_status === 'ACTIVE') ?? null,
    [rounds],
  )

  const defaultRound = useMemo<SurveyRoundOut | null>(() => {
    // Prefer the currently running round; otherwise the soonest upcoming draft;
    // otherwise fall back to the first round (e.g. when every round is closed).
    if (currentRound) return currentRound
    const nextDraft = rounds
      .filter((r) => r.round_status === 'DRAFT')
      .sort((a, b) => a.round_number - b.round_number)[0]
    return nextDraft ?? rounds[0] ?? null
  }, [currentRound, rounds])

  const selectedRoundId = useMemo(() => {
    if (!defaultRound) return ''

    const defaultId = String(defaultRound.round_id)

    if (!selectedRoundIdOverride) return defaultId

    const selectedRoundExists = rounds.some(
      (round) => String(round.round_id) === selectedRoundIdOverride,
    )
    return selectedRoundExists ? selectedRoundIdOverride : defaultId
  }, [defaultRound, rounds, selectedRoundIdOverride])

  const roundId = selectedRoundId ? Number(selectedRoundId) : null

  const selectedRound = useMemo(
    () => rounds.find((r) => String(r.round_id) === selectedRoundId) ?? null,
    [rounds, selectedRoundId],
  )

  return {
    rounds,
    isLoading,
    currentRound,
    defaultRound,
    selectedRoundId,
    roundId,
    selectedRound,
    setSelectedRoundId,
  }
}
