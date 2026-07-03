import { useEffect, useRef, useState } from 'react'

type Props = {
  min: number
  max: number
  valueMin: number
  valueMax: number
  onChange: (vMin: number, vMax: number) => void
  intervalMs?: number
}

export default function YearRangeSlider({
  min,
  max,
  valueMin,
  valueMax,
  onChange,
  intervalMs = 500
}: Props) {
  const [playing, setPlaying] = useState(false)
  const [localMin, setLocalMin] = useState(valueMin)
  const [localMax, setLocalMax] = useState(valueMax)
  const draggingRef = useRef(false)

  useEffect(() => {
    if (draggingRef.current) return
    setLocalMin(valueMin)
    setLocalMax(valueMax)
  }, [valueMin, valueMax])

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      if (valueMax >= max) {
        setPlaying(false)
        return
      }
      onChange(valueMin, valueMax + 1)
    }, intervalMs)
    return () => clearInterval(id)
  }, [playing, valueMax, valueMin, max, onChange, intervalMs])

  const togglePlay = () => {
    if (!playing && valueMax >= max) {
      onChange(valueMin, valueMin)
    }
    setPlaying(p => !p)
  }

  const reset = () => {
    setPlaying(false)
    draggingRef.current = false
    setLocalMin(min)
    setLocalMax(max)
    onChange(min, max)
  }

  const trackRange = max - min || 1
  const leftPct = ((localMin - min) / trackRange) * 100
  const rightPct = ((localMax - min) / trackRange) * 100

  const onPointerDown = () => {
    draggingRef.current = true
  }
  const commit = () => {
    if (!draggingRef.current) return
    draggingRef.current = false
    if (localMin !== valueMin || localMax !== valueMax) {
      onChange(localMin, localMax)
    }
  }

  const handleMinChange = (raw: number) => {
    const next = Math.min(raw, localMax)
    setLocalMin(next)
  }
  const handleMaxChange = (raw: number) => {
    const next = Math.max(raw, localMin)
    setLocalMax(next)
  }

  return (
    <div className="space-y-2">
      <div className="relative h-4 text-xs">
        {/* Bounds at the edges; selected labels anchor OUTWARD from their thumb
            (min ends at its thumb, max starts at its thumb) so they diverge
            instead of drifting/colliding as the thumbs move. Position clamps at
            the container edges; a bound hides when the selected label reaches it. */}
        {leftPct > 25 && <span className="absolute left-0 text-gray-400">{min}</span>}
        {rightPct < 75 && <span className="absolute right-0 text-gray-400">{max}</span>}
        {/* Outer min/max keep the pair from overlapping when both thumbs clamp
            against the same container edge (labels stack side by side instead). */}
        <span
          className="absolute w-9 pr-1 text-right font-semibold text-gray-900"
          style={{ left: `min(max(0%, calc(${leftPct}% - 2.25rem)), calc(100% - 4.5rem))` }}
        >
          {localMin}
        </span>
        <span
          className="absolute w-9 pl-1 text-left font-semibold text-gray-900"
          style={{ left: `max(min(calc(100% - 2.25rem), ${rightPct}%), 2.25rem)` }}
        >
          {localMax}
        </span>
      </div>

      <div className="relative h-6">
        <div className="absolute top-1/2 left-0 right-0 h-1 -translate-y-1/2 rounded bg-gray-200" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded bg-gray-900"
          style={{ left: `${leftPct}%`, right: `${100 - rightPct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={localMin}
          onChange={e => handleMinChange(Number.parseInt(e.target.value, 10))}
          onPointerDown={onPointerDown}
          onPointerUp={commit}
          onPointerCancel={commit}
          onBlur={commit}
          className="year-thumb absolute inset-0 w-full appearance-none bg-transparent pointer-events-none"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={localMax}
          onChange={e => handleMaxChange(Number.parseInt(e.target.value, 10))}
          onPointerDown={onPointerDown}
          onPointerUp={commit}
          onPointerCancel={commit}
          onBlur={commit}
          className="year-thumb absolute inset-0 w-full appearance-none bg-transparent pointer-events-none"
        />
      </div>

      <div className="flex gap-1.5">
        <button
          onClick={togglePlay}
          className="flex-1 rounded px-2 py-0.5 text-[11px] bg-gray-900 text-white hover:bg-gray-700"
        >
          {playing ? '⏸ Pausa' : '▶ Play'}
        </button>
        <button
          onClick={reset}
          className="rounded px-2 py-0.5 text-[11px] border border-gray-300 hover:bg-gray-100"
        >
          ↺ Reset
        </button>
      </div>
    </div>
  )
}
