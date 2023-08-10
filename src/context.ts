import { Connection } from '@solana/web3.js'
import {
  Context,
  getClusterUrl,
  parseCommitment,
  setContext,
  getContext,
  CliCommandError,
} from '@marinade.finance/cli-common'
import { Logger } from 'pino'

export enum NotificationType {
  WEBHOOK,
  TELEGRAM,
  NONE,
}

function parseNotificationType(notificationType: string): NotificationType {
  switch (notificationType) {
    case 'webhook':
      return NotificationType.WEBHOOK
    case 'telegram':
      return NotificationType.TELEGRAM
    case 'none':
      return NotificationType.NONE
    default:
      throw new Error('Invalid notification type')
  }
}

export type Notification =
  | { type: NotificationType.WEBHOOK; url: string }
  | { type: NotificationType.TELEGRAM; botToken: string; chatId: string }
  | { type: NotificationType.NONE }

export class CliContext extends Context {
  readonly connection: Connection
  readonly notification: Notification
  constructor({
    connection,
    logger,
    skipPreflight,
    simulate,
    printOnly,
    commandName,
    notification,
  }: {
    connection: Connection
    logger: Logger
    skipPreflight: boolean
    simulate: boolean
    printOnly: boolean
    commandName: string
    notification: Notification
  }) {
    super({
      logger,
      skipPreflight,
      simulate,
      printOnly,
      commandName,
    })
    this.connection = connection
    this.notification = notification
  }
}

export function setCliContext({
  url,
  logger,
  commitment,
  command,
  notificationType,
  notificationConfig,
}: {
  url: string
  logger: Logger
  commitment: string
  command: string
  notificationType: string
  notificationConfig: string[]
}) {
  const connection = new Connection(
    getClusterUrl(url),
    parseCommitment(commitment)
  )
  const parsedType = parseNotificationType(notificationType)
  let notification: Notification
  switch (parsedType) {
    case NotificationType.WEBHOOK:
      if (!notificationConfig || notificationConfig.length === 0) {
        throw new CliCommandError({
          commandName: command,
          valueName: '--notification-config',
          value: notificationConfig,
          msg: 'Invalid webhook notification, expecting at least one param: url',
        })
      }
      notification = {
        type: NotificationType.WEBHOOK,
        url: notificationConfig[0],
      }
      break
    case NotificationType.TELEGRAM:
      if (!notificationConfig || notificationConfig.length < 2) {
        throw new CliCommandError({
          commandName: command,
          valueName: '--notification-config',
          value: notificationConfig,
          msg: 'Invalid telegram notification, expecting at least two params: botToken and chatId',
        })
      }
      notification = {
        type: NotificationType.TELEGRAM,
        botToken: notificationConfig[0],
        chatId: notificationConfig[1],
      }
      break
    default:
      notification = { type: NotificationType.NONE }
  }

  setContext(
    new CliContext({
      connection,
      logger,
      skipPreflight: false,
      simulate: false,
      printOnly: false,
      commandName: command,
      notification,
    })
  )
}

export function useContext(): CliContext {
  return getContext() as CliContext
}
