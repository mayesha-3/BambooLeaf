import { readFileSync, readdirSync } from 'node:fs'

export interface LoadedFile<T> { file: string; set: string; note?: string; cases: T[] }

/** A case file is either an array of cases or `{ note, cases }`. `set` is the file name ("base" for the original two files). */
export function loadCaseFile<T extends object>(dir: string, file: string): LoadedFile<T> {
  const raw = JSON.parse(readFileSync(`${dir}/${file}`, 'utf8')) as T[] | { note?: string; cases: T[] }
  const cases = Array.isArray(raw) ? raw : raw.cases
  const name = file.replace(/\.json$/, '')
  const set = name === 'legit' || name === 'adversarial' ? 'base' : name
  return { file, set, note: Array.isArray(raw) ? undefined : raw.note, cases: cases.map((c) => ({ ...c, set })) }
}

export function listCaseFiles(dir: string): string[] {
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
}
