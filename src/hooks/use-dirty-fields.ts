import { useRef, useCallback } from 'react'

/**
 * Track which fields were actually modified in an edit form.
 * Returns only the changed fields when saving — prevents overwriting
 * another user's concurrent edits to different fields.
 *
 * Usage:
 *   const { initOriginal, markDirty, getDirtyPayload } = useDirtyFields<CatalogItem>()
 *
 *   // When opening edit dialog:
 *   setEditForm({ ...item })
 *   initOriginal(item)
 *
 *   // When a field changes:
 *   setEditForm(prev => { const next = { ...prev, title: 'new' }; markDirty('title'); return next })
 *
 *   // When saving:
 *   const payload = getDirtyPayload(editForm)
 *   // payload = { title: 'new' }  ← only the changed field
 */
export function useDirtyFields<T extends Record<string, any>>() {
  const originalRef = useRef<T | null>(null)
  const dirtyKeys = useRef<Set<string>>(new Set())

  /** Store the original item when the edit form opens */
  const initOriginal = useCallback((item: T) => {
    originalRef.current = { ...item }
    dirtyKeys.current = new Set()
  }, [])

  /** Mark a field as dirty (call this when the user changes a field) */
  const markDirty = useCallback((key: keyof T & string) => {
    dirtyKeys.current.add(key)
  }, [])

  /** Mark multiple fields as dirty at once */
  const markDirtyMany = useCallback((keys: (keyof T & string)[]) => {
    keys.forEach(k => dirtyKeys.current.add(k))
  }, [])

  /**
   * Build a partial payload containing only fields the user actually changed.
   * Always includes `sr` and `id` if present (for identification).
   * Falls back to the full form if no original was set.
   */
  const getDirtyPayload = useCallback((currentForm: T): Partial<T> => {
    // If we never set the original (e.g. creating new item), send everything
    if (!originalRef.current) {
      return { ...currentForm }
    }

    // If no fields were explicitly marked dirty, compare values
    if (dirtyKeys.current.size === 0) {
      // Auto-detect changed fields by comparing with original
      for (const key of Object.keys(currentForm)) {
        if (JSON.stringify(currentForm[key]) !== JSON.stringify(originalRef.current[key])) {
          dirtyKeys.current.add(key)
        }
      }
    }

    // Build partial payload with only dirty fields
    const partial: Record<string, any> = {}

    // Always include identity fields
    if ('sr' in currentForm) partial.sr = currentForm.sr
    if ('id' in currentForm) partial.id = currentForm.id

    for (const key of dirtyKeys.current) {
      const val = currentForm[key]
      // Skip null/undefined to prevent accidental overwrites
      if (val === null || val === undefined) {
        console.warn(`[DirtyFields] Skipping null value for field "${key}"`)
        continue
      }
      partial[key] = val
    }

    return partial as Partial<T>
  }, [])

  /** Reset tracking state */
  const reset = useCallback(() => {
    originalRef.current = null
    dirtyKeys.current = new Set()
  }, [])

  return { initOriginal, markDirty, markDirtyMany, getDirtyPayload, reset }
}
