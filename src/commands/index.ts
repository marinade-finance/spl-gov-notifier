import { Command } from 'commander'
import { installCheckProposals } from './check-proposals'

export function installCommands(program: Command) {
  installCheckProposals(program)
}
