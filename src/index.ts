#!/usr/bin/env node

/* eslint-disable no-process-exit */
import { Command, Option } from 'commander'
import { installCheckProposals } from './checkProposals'
import { setCliContext } from './context'
import { configureLogger } from '@marinade.finance/cli-common'

const logger = configureLogger()
const program = new Command('')

program
  .version('1.0.0')
  .description(
    'Notify about stuff via webhook calls, implemented to notify on new SPL Gov proposals'
  )
  .allowExcessArguments(false)
  .option(
    '-u, --url <url-or-moniker>',
    'URL of Solana cluster or moniker ' +
      '(m/mainnet/mainnet-beta, d/devnet, t/testnet)',
    'm'
  )
  .option('--commitment <commitment>', 'Commitment', 'confirmed')
  .option(
    '-c, --notification-config <config...>',
    'Additional webhook configurations.' +
      'Every "notification-type" has got different variadic arguments to pass in.\n' +
      'webhook expects url [<url>], i.e., --notification-type webhook -c http://some/url\n' +
      "telegram expects token [<token> <chatId>], i.e., --notification-type telegram -c 'abcdef:123' '-123456789'"
  )
  .option('-d, --debug', 'Debug', false)
  .addOption(
    new Option(
      '-n, --notification-type <notification-type>',
      'Notification type'
    )
      .choices(['webhook', 'telegram', 'none'])
      .default('none')
  )
  .hook('preAction', async (command: Command, action: Command) => {
    if (command.opts().debug) {
      logger.level = 'debug'
    }

    setCliContext({
      url: command.opts().url as string,
      commitment: command.opts().commitment,
      logger,
      command: action.name(),
      notificationType: command.opts().notificationType,
      notificationConfig: command.opts().notificationConfig,
    })
  })

installCheckProposals(program)

program.parseAsync(process.argv).then(
  () => process.exit(),
  (err: unknown) => {
    logger.error(err)
    process.exit(1)
  }
)
