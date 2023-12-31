#!/usr/bin/env node

/* eslint-disable no-process-exit */
import { Command, Option } from 'commander'
import { installCheckProposals } from './checkProposals'
import { NOTIFICATION_TYPE_NAMES, setCliContext } from './context'
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
  .option(
    '--commitment <commitment>',
    'Solana RPC client connection commitment',
    'confirmed'
  )
  .option('-d, --debug', 'Debug', false)
  .option(
    '-c, --notification-config <config...>',
    'Additional webhook configurations.' +
      'Every "notification-type" has got different variadic arguments to pass in.\n' +
      'webhook expects url [<url>], i.e., --notification-type webhook -c http://some/url\n' +
      "telegram expects token [<token> <chatId>], i.e., --notification-type telegram -c 'abcdef:123' '-123456789'\n" +
      "discord expects webhook url [<webhookUrl>], i.e., --notification-type discord -c 'https://discord.com/api/webhooks/123-channel-id/bot-idFsOSHkGHVM'"
  )
  .addOption(
    new Option(
      '-n, --notification-type <notification-type>',
      'Notification type'
    )
      .choices(NOTIFICATION_TYPE_NAMES)
      .default('none')
  )
  .option(
    '-r, --redis <redis-url>',
    'Redis URL (example: redis://localhost:6379). ' +
      'When provided then the notifier uses redis to store its last run to not loosing any notifications.'
  )
  .hook('preAction', async (command: Command, action: Command) => {
    if (command.opts().debug) {
      logger.level = 'debug'
    }

    await setCliContext({
      url: command.opts().url as string,
      commitment: command.opts().commitment,
      logger,
      command: action.name(),
      notificationType: command.opts().notificationType,
      notificationConfig: command.opts().notificationConfig,
      redisUrl: command.opts().redis,
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
