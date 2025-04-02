import { Connection } from '@solana/web3.js'
import {
  Context,
  parseClusterUrl,
  parseCommitment,
  setContext,
  getContext,
  CliCommandError,
} from '@marinade.finance/cli-common'
import { Logger } from 'pino'
import { createClient, RedisClientType } from 'redis'
import { Notifications } from './notification-parser'

export class CliContext extends Context {
  readonly connection: Connection
  readonly notifications: Notifications
  readonly redisClient: RedisClientType | undefined
  constructor({
    connection,
    logger,
    skipPreflight,
    simulate,
    printOnly,
    commandName,
    notifications,
    redisClient,
  }: {
    connection: Connection
    logger: Logger
    skipPreflight: boolean
    simulate: boolean
    printOnly: boolean
    commandName: string
    notifications: Notifications
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
    this.notifications = notifications
    this.redisClient = redisClient
  }
}

export async function setCliContext({
  url,
  logger,
  commitment,
  command,
  notifications,
  redisUrl,
}: {
  url: string
  logger: Logger
  commitment: string
  command: string
  notifications: Notifications
  redisUrl: string | undefined
}) {
  const connection = new Connection(
    parseClusterUrl(url),
    parseCommitment(commitment),
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
      notifications,
      redisClient,
    }),
  )
}

export function useContext(): CliContext {
  return getContext() as CliContext
}
