/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { Option } from 'commander'
import * as dotenv from 'dotenv'

import type { Command, OptionValues } from 'commander'
import type { Logger } from 'pino'

dotenv.config()

const DEFAULT_BOT_NAME = 'SPL Governance Notifier'

export enum NotificationType {
  NONE = 'none',
  WEBHOOK = 'webhook',
  TELEGRAM = 'telegram',
  DISCORD = 'discord',
  SLACK = 'slack',
}

export interface BaseNotification {
  type: NotificationType
}

export interface WebhookNotification extends BaseNotification {
  type: NotificationType.WEBHOOK
  url: string
}

export interface TelegramNotification extends BaseNotification {
  type: NotificationType.TELEGRAM
  botToken: string
  chatId: string
}

export interface DiscordNotification extends BaseNotification {
  type: NotificationType.DISCORD
  url: string
  notificationColor: string
}

export interface SlackNotification extends BaseNotification {
  type: NotificationType.SLACK
  bearerToken: string
  feed?: string
  notificationColor: string
}

export interface NoneNotification extends BaseNotification {
  type: NotificationType.NONE
}

export type Notification =
  | WebhookNotification
  | TelegramNotification
  | DiscordNotification
  | SlackNotification
  | NoneNotification

export type Notifications = {
  botName: string
  notifications: Notification[]
}

export function addNotificationProgramOptions(program: Command) {
  program
    .option('--webhook', 'Enable webhook notifications')
    .option('--telegram', 'Enable Telegram notifications')
    .option('--discord', 'Enable Discord notifications')
    .option('--slack', 'Enable Slack notifications')

  program.addOption(
    new Option(
      '--webhook-url <url>',
      'Webhook URL for webhook notifications',
    ).env('WEBHOOK_URL'),
  )

  program
    .addOption(
      new Option(
        '--telegram-token <token>',
        'Bot token for Telegram notifications',
      ).env('TELEGRAM_TOKEN'),
    )
    .addOption(
      new Option(
        '--telegram-chat-id <chatId>',
        'Chat ID for Telegram notifications',
      ).env('TELEGRAM_CHAT_ID'),
    )

  program
    .addOption(
      new Option(
        '--discord-url <url>',
        'Webhook URL for Discord notifications',
      ).env('DISCORD_WEBHOOK_URL'),
    )
    .option(
      '--discord-notification-color <color>',
      'Color for Slack notifications in decimal format (default: aero blue)',
      '13238245',
    )

  program
    .addOption(
      new Option(
        '--slack-token <token>',
        'Bearer token for Slack notifications',
      ).env('SLACK_BEARER_TOKEN'),
    )
    .addOption(
      new Option(
        '--slack-feed <feedName>',
        'Feed name for Slack notifications',
      ).env('SLACK_FEED'),
    )
    .option(
      '--slack-notification-color <color>',
      'Color for Slack notifications in hex format (default: aero blue)',
      '#c9ffe5',
    )

  program.option(
    '--bot-name <botName>',
    'Name of bot that will be announced in notification',
    DEFAULT_BOT_NAME,
  )
}

export function parseNotificationOpts<T extends OptionValues>(
  options: T,
  logger: Logger,
): Notifications {
  const notifications: Notification[] = []

  // Check each notification type and add if enabled
  if (options.webhook) {
    if (!options.webhookUrl) {
      throw new Error(
        'Webhook URL is required when webhook notifications are enabled',
      )
    }
    notifications.push({
      type: NotificationType.WEBHOOK,
      url: options.webhookUrl,
    })
  }

  if (options.telegram) {
    if (!options.telegramToken || !options.telegramChatId) {
      throw new Error(
        'Bot token and chat ID are required when Telegram notifications are enabled',
      )
    }
    notifications.push({
      type: NotificationType.TELEGRAM,
      botToken: options.telegramToken,
      chatId: options.telegramChatId,
    })
  }

  if (options.discord) {
    if (!options.discordUrl) {
      throw new Error(
        'Webhook URL is required when Discord notifications are enabled',
      )
    }
    notifications.push({
      type: NotificationType.DISCORD,
      url: options.discordUrl,
      notificationColor: options.discordNotificationColor,
    })
  }

  if (options.slack) {
    if (!options.slackToken) {
      throw new Error(
        'Bearer token is required when Slack notifications are enabled',
      )
    }
    notifications.push({
      type: NotificationType.SLACK,
      bearerToken: options.slackToken,
      notificationColor: options.slackNotificationColor,
      feed: options.slackFeed, // Optional, can be undefined
    })
  }

  // If no notifications are enabled, add a NONE notification
  if (notifications.length === 0) {
    notifications.push({ type: NotificationType.NONE })
  }

  logger.debug(
    'Configured notifications: ' +
      notifications.map(n => `\n- ${n.type}`).join(''),
  )
  const botName = options.botName || DEFAULT_BOT_NAME
  return { botName, notifications }
}
