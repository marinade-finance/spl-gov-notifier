import { Connection } from '@solana/web3.js'
import {
  Context,
  getClusterUrl,
  parseCommitment,
  setContext,
  getContext,
} from '@marinade.finance/cli-common'
import { Logger } from 'pino'


// curl -X POST \
//      -H 'Content-Type: application/json' \
//      -d '{"chat_id": "123456789", "text": "This is a test from curl", "disable_notification": true}' \
//      https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage
export const TELEGRAM_BOT_URL: string = 'https://api.telegram.org/bot'

export enum NotificationType {
  WEBHOOK,
  TELEGRAM,
  NONE
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
    notification
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
  notificationConfig: string
}) {
  const connection = new Connection(
    getClusterUrl(url),
    parseCommitment(commitment)
  )
  const parsedType = parseNotificationType(notificationType)

  setContext(
    new CliContext({
      connection,
      logger,
      skipPreflight: false,
      simulate: false,
      printOnly: false,
      commandName: command,
      notification: {type: NotificationType.NONE} // TODO: :-)
    })
  )
}

export function useContext(): CliContext {
  return getContext() as CliContext
}
