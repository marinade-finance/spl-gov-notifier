import { installCheckProposals } from './check-proposals'

import type { Command } from 'commander'

export function installCommands(program: Command) {
  installCheckProposals(program)
}
