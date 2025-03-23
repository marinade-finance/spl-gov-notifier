#!/usr/bin/env node

import { Command } from 'commander'
import { setCliContext } from './context'
import { configureLogger } from '@marinade.finance/cli-common'
import { ExecutionError } from '@marinade.finance/web3js-common'
import {
  addNotificationProgramOptions,
  parseNotificationOpts,
} from './notification-parser'
import { installCommands } from './commands'

const logger = configureLogger()
const program = new Command('')

program
  .version('2.0.0')
  .description(
    'Notify about Solana SPL Governance newly created proposals via webhook calls',
  )
  .allowExcessArguments(false)
  .option(
    '-u, --url <url-or-moniker>',
    'URL of Solana cluster or moniker ' +
      '(m/mainnet/mainnet-beta, d/devnet, t/testnet)',
    'mainnet-beta',
  )
  .option(
    '--commitment <commitment>',
    'Solana RPC client connection commitment',
    'confirmed',
  )
  .option('-d, --debug', 'Debug', false)
  .option('-v, --verbose', 'alias for --debug', false)
  .option(
    '-r, --redis <redis-url>',
    'Redis URL (e.g., redis://localhost:6379). If provided, the notifier uses Redis ' +
      'to store its last run, preventing the loss of any notifications.',
  )
addNotificationProgramOptions(program)

program.hook('preAction', async (command: Command, action: Command) => {
  if (command.opts().debug || command.opts().verbose) {
    logger.level = 'debug'
  } else {
    logger.level = 'info'
  }

  await setCliContext({
    url: command.opts().url as string,
    commitment: command.opts().commitment,
    logger,
    command: action.name(),
    notifications: parseNotificationOpts(command.opts(), logger),
    redisUrl: command.opts().redis,
  })
})

installCommands(program)

program.parseAsync(process.argv).then(
  () => {
    logger.debug({ resolution: 'Success', args: process.argv })
  },
  (err: Error) => {
    logger.error(
      err instanceof ExecutionError
        ? err.messageWithTransactionError()
        : err.message,
    )
    logger.debug({ resolution: 'Failure', err, args: process.argv })

    process.exitCode = 1
  },
)
