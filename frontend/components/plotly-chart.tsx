"use client"

// Thin wrapper: renders a backend-built Plotly figure JSON.
// plotly.js is heavy (~1MB gz) so it is loaded only on pages that chart.
import { useEffect, useRef } from "react"

interface Props {
  figure: { data: unknown[]; layout: Record<string, unknown> }
  className?: string
}

export default function PlotlyChart({ figure, className }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let disposed = false
    let node: HTMLDivElement | null = null
    import("plotly.js-dist-min").then((Plotly) => {
      if (disposed || !ref.current) return
      node = ref.current
      // Mouse-wheel zoom only for spatial charts (tile maps, geo, 3D) so it
      // doesn't hijack page scroll over ordinary bar/line charts.
      const layout = (figure.layout ?? {}) as Record<string, unknown>
      const spatial = !!(layout.mapbox || layout.geo || layout.scene)
      Plotly.react(node, figure.data as never, {
        ...figure.layout,
        autosize: true,
      } as never, {
        responsive: true,
        displaylogo: false,
        scrollZoom: spatial,
        modeBarButtonsToRemove: spatial ? [] : ["lasso2d", "select2d"],
      } as never)
    })
    return () => {
      disposed = true
      if (node) {
        import("plotly.js-dist-min").then((Plotly) => Plotly.purge(node!))
      }
    }
  }, [figure])

  return <div ref={ref} className={className ?? "w-full h-full"} />
}
