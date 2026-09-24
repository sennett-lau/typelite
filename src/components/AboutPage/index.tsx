import { AnimatePresence } from 'framer-motion'
import { DirtyBar } from '../Settings/shared/DirtyBar'
import { useDirtyConfig } from '../Settings/shared/useDirtyConfig'
import { AboutPane } from '../Settings/AboutPane'

/**
 * About, pinned to the bottom of the sidebar. The UI language picker lives here, so the
 * same Save / Reset bar as Settings appears when it is changed.
 */
export function AboutPage() {
  const isDirty = useDirtyConfig()
  return (
    <div className="flex h-full w-full flex-col text-text-primary">
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-8 pt-2.5 pb-8">
        <AboutPane />
      </div>
      <AnimatePresence>{isDirty && <DirtyBar />}</AnimatePresence>
    </div>
  )
}
