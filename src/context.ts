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
import { createClient, RedisClientType } from 'redis'

export enum NotificationType {
  WEBHOOK,
  TELEGRAM,
  DISCORD,
  NONE,
}

export const NOTIFICATION_TYPE_NAMES = Object.values(NotificationType)
  .map(k => `${k}`.toLocaleLowerCase())
  .slice(0, Object.values(NotificationType).length / 2)

function parseNotificationType(notificationType: string): NotificationType {
  switch (notificationType) {
    case 'webhook':
      return NotificationType.WEBHOOK
    case 'telegram':
      return NotificationType.TELEGRAM
    case 'discord':
      return NotificationType.DISCORD
    case 'none':
      return NotificationType.NONE
    default:
      throw new Error('Invalid notification type: ' + notificationType)
  }
}

export type Notification =
  | { type: NotificationType.WEBHOOK; url: string }
  | { type: NotificationType.DISCORD; url: string }
  | { type: NotificationType.TELEGRAM; botToken: string; chatId: string }
  | { type: NotificationType.NONE }

export class CliContext extends Context {
  readonly connection: Connection
  readonly notification: Notification
  readonly redisClient: RedisClientType | undefined
  constructor({
    connection,
    logger,
    skipPreflight,
    simulate,
    printOnly,
    commandName,
    notification,
    redisClient,
  }: {
    connection: Connection
    logger: Logger
    skipPreflight: boolean
    simulate: boolean
    printOnly: boolean
    commandName: string
    notification: Notification
    redisClient: RedisClientType | undefined
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
    this.redisClient = redisClient
  }
}

function parseNotification(
  notificationType: NotificationType,
  notificationConfig: string[] | undefined,
  command: string
): Notification {
  let notification: Notification
  switch (notificationType) {
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
    case NotificationType.DISCORD:
      if (!notificationConfig || notificationConfig.length === 0) {
        throw new CliCommandError({
          commandName: command,
          valueName: '--notification-config',
          value: notificationConfig,
          msg: 'Invalid discord notification, expecting one param: botToken',
        })
      }
      notification = {
        type: NotificationType.DISCORD,
        url: notificationConfig[0],
      }
      break
    default:
      notification = { type: NotificationType.NONE }
  }
  return notification
}

export async function setCliContext({
  url,
  logger,
  commitment,
  command,
  notificationType,
  notificationConfig,
  redisUrl,
}: {
  url: string
  logger: Logger
  commitment: string
  command: string
  notificationType: string
  notificationConfig: string[] | undefined
  redisUrl: string | undefined
}) {
  const connection = new Connection(
    getClusterUrl(url),
    parseCommitment(commitment)
  )
  const parsedType = parseNotificationType(notificationType)
  const notification = parseNotification(
    parsedType,
    notificationConfig,
    command
  )

  let redisClient: RedisClientType | undefined = undefined
  if (redisUrl) {
    try {
      redisClient = createClient({ url: redisUrl })
      await redisClient.connect()
    } catch (e) {
      throw new CliCommandError({
        commandName: command,
        valueName: '--redis-url',
        value: redisUrl,
        msg: 'Cannot connect to redis with provided url',
        cause: e as Error,
      })
    }
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
      redisClient,
    })
  )
}

export function useContext(): CliContext {
  return getContext() as CliContext
}
