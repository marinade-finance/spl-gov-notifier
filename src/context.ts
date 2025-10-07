import { CLIContext, CliCommandError } from '@marinade.finance/cli-common'
import { getContext, setContext } from '@marinade.finance/ts-common'
import { parseClusterUrl, parseCommitment } from '@marinade.finance/web3js-1x'
import { Connection } from '@solana/web3.js'
import { createClient } from 'redis'

import type { Notifications } from './notification-parser'
import type { LoggerPlaceholder } from '@marinade.finance/ts-common'
import type { RedisClientType } from 'redis'

export class SplGovCliContext extends CLIContext {
  readonly connection: Connection
  readonly notifications: Notifications
  readonly redisClient: RedisClientType | undefined

  constructor({
    connection,
    logger,
    commandName,
    notifications,
    redisClient,
  }: {
    connection: Connection
    logger: LoggerPlaceholder
    commandName: string
    notifications: Notifications
    redisClient: RedisClientType | undefined
  }) {
    super({
      logger,
      commandName,
    })
    this.connection = connection
    this.notifications = notifications
    this.redisClient = redisClient
  }
}

export async function setSplGovCliContext({
  url,
  logger,
  commitment,
  command,
  notifications,
  redisUrl,
}: {
  url: string
  logger: LoggerPlaceholder
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
    new SplGovCliContext({
      connection,
      logger,
      commandName: command,
      notifications,
      redisClient,
    }),
  )
}

export function useContext(): SplGovCliContext {
  return getContext<SplGovCliContext>()
}
