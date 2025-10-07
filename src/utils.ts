import type { ProgramAccount } from '@realms-today/spl-governance'

// adapted from https://github.com/solana-labs/governance-ui

/**
 * Maps the source array of account to a map keyed by pubkey of the accounts
 * @param accounts
 * @returns
 */
export function accountsToPubkeyMap<T>(accounts: ProgramAccount<T>[]) {
  return arrayToRecord(accounts, a => a.pubkey.toBase58())
}

// Converts array of items to a Map
export function arrayToMap<T, K>(source: readonly T[], getKey: (item: T) => K) {
  return new Map(source.map(item => [getKey(item), item] as [K, T]))
}

export function arrayToRecord<T>(
  source: readonly T[],
  getKey: (item: T) => string,
) {
  return source.reduce((all, a) => ({ ...all, [getKey(a)]: a }), {}) as Record<
    string,
    T
  >
}

export function getNameOf<T>() {
  return (name: keyof T) => name
}
