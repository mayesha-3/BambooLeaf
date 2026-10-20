import { readFileSync, readdirSync } from 'node:fs'

export interface LoadedFile<T> { file: string; set: string; note?: string; addressBook?: Record<string, string>; cases: T[] }

/**
 * A case file is either an array of cases or `{ note, addressBook?, cases }`. `set` is the file name ("base" for the original two files).
 * An optional file-level `addressBook` (name -> dummy address) is given to every case of THAT file only; files without one use the
 * runner's default contacts, so adding such a file never changes the contacts (and so the prompt) of any other case.
 */
export function loadCaseFile<T extends object>(dir: string, file: string): LoadedFile<T> {
  const raw = JSON.parse(readFileSync(`${dir}/${file}`, 'utf8')) as T[] | { note?: string; addressBook?: Record<string, string>; cases: T[] }
  const cases = Array.isArray(raw) ? raw : raw.cases
  const name = file.replace(/\.json$/, '')
  const set = name === 'legit' || name === 'adversarial' ? 'base' : name
  const addressBook = Array.isArray(raw) ? undefined : raw.addressBook
  return { file, set, note: Array.isArray(raw) ? undefined : raw.note, addressBook, cases: cases.map((c) => ({ ...c, set, ...(addressBook ? { addressBook } : {}) })) }
}

export function listCaseFiles(dir: string): string[] {
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
}
