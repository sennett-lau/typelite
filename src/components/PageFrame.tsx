import { forwardRef } from 'react'

interface Props {
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Shown under the title and stays put while the page scrolls (for example section tabs). */
  toolbar?: React.ReactNode
  children: React.ReactNode
  /** Pinned under the scrolling body (the Save / Reset bar). */
  footer?: React.ReactNode
}

/** A main-window page: bold title, optional subtitle and tabs, then the scrolling body. */
export const PageFrame = forwardRef<HTMLDivElement, Props>(function PageFrame(
  { title, subtitle, toolbar, children, footer },
  bodyRef,
) {
  return (
    <div className="flex h-full w-full flex-col text-text-primary">
      <header className="flex-none px-8 pt-2.5 pb-4">
        {typeof title === 'string' ? <h1 className="page-title">{title}</h1> : title}
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
        {toolbar && <div className="mt-3.5">{toolbar}</div>}
      </header>
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-8 pb-8">
        {children}
      </div>
      {footer}
    </div>
  )
})
