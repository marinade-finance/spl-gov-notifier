import { useContext } from './context'
import axios from 'axios'
import {
  DiscordNotification,
  Notification,
  NotificationType,
  SlackNotification,
  TelegramNotification,
  WebhookNotification,
} from './notification-parser'
import { ExecutionError } from '@marinade.finance/web3js-common'
import { getContext } from '@marinade.finance/cli-common'

const TELEGRAM_BOT_URL = 'https://api.telegram.org/bot'
const SLACK_URL = 'https://slack.com/api/chat.postMessage'
const BOT_IMAGE_URL =
  'https://raw.githubusercontent.com/marinade-finance/spl-gov-notifier/master/img/bot.jpg'

const headers = {
  'Content-Type': 'application/json',
}

export type NotificationMessage = {
  message: string
  proposalUrl: string
  proposalVotingAt: Date | undefined
}
type NotificationMessageEnhanced = NotificationMessage & {
  proposalId: string
  proposalVotingAtText?: string
}

export async function sendNotifications(
  message: NotificationMessage,
): Promise<void> {
  const {
    notifications: { notifications },
    logger,
  } = useContext()

  const proposalUrlSplit = message.proposalUrl.split('/')
  const proposalId = proposalUrlSplit[proposalUrlSplit.length - 1]
  const proposalVotingAtText = message.proposalVotingAt
    ? `📅 ${message.proposalVotingAt.toISOString()}`
    : undefined
  logger.info(
    "Notifying proposal: '%s', message: '%s', url: '%s', voting at: '%s'",
    proposalId,
    message.message,
    message.proposalUrl,
    message.proposalVotingAt ?? 'N/A',
  )
  const messageWithProposalId: NotificationMessageEnhanced = {
    ...message,
    proposalId,
    proposalVotingAtText,
  }

  const results = await Promise.allSettled(
    notifications.map(notification =>
      sendNotification(notification, messageWithProposalId),
    ),
  )

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      logger.error(
        `Failed to send to notification channel ${index}: ` + result.reason,
      )
    }
  })

  if (results.some(result => result.status === 'rejected')) {
    throw new Error('Notification attempts failed')
  }
}

async function sendNotification(
  notification: Notification,
  message: NotificationMessageEnhanced,
): Promise<void> {
  switch (notification.type) {
    case NotificationType.WEBHOOK:
      return sendWebhookNotification(notification, message)

    case NotificationType.TELEGRAM:
      return sendTelegramNotification(notification, message)

    case NotificationType.DISCORD:
      return sendDiscordNotification(notification, message)

    case NotificationType.SLACK:
      return sendSlackNotification(notification, message)

    default:
      getContext().logger.warn('No notifications type configured for sending')
      return Promise.resolve()
  }
}

async function sendWebhookNotification(
  notification: WebhookNotification,
  { proposalVotingAtText, message, proposalUrl }: NotificationMessageEnhanced,
): Promise<void> {
  const footer = proposalVotingAtText ? ` : ${proposalVotingAtText}` : ''
  message = message + ' : ' + proposalUrl + footer

  await doAxiosPost({
    type: notification.type,
    url: notification.url,
    payload: { message },
    headers,
  })
}

async function sendTelegramNotification(
  notification: TelegramNotification,
  {
    proposalVotingAtText,
    message,
    proposalUrl,
    proposalId,
  }: NotificationMessageEnhanced,
): Promise<void> {
  const url = `${TELEGRAM_BOT_URL}${notification.botToken}/sendMessage`
  const footer = proposalVotingAtText ? `\n📅 ${proposalVotingAtText}` : ''
  const payload = {
    chat_id: notification.chatId,
    text:
      message +
      `\n<a href="${proposalUrl}">Proposal: ${proposalId}</a>` +
      footer,
    disable_notification: true,
    parse_mode: 'HTML',
  }

  await doAxiosPost({
    type: notification.type,
    url,
    payload,
    headers,
  })
}

async function sendDiscordNotification(
  notification: DiscordNotification,
  {
    proposalVotingAtText,
    message,
    proposalUrl,
    proposalId,
  }: NotificationMessageEnhanced,
): Promise<void> {
  const {
    notifications: { botName },
    commandName,
  } = useContext()
  const footer = proposalVotingAtText
    ? {
        text: proposalVotingAtText,
      }
    : undefined
  const payload = {
    username: botName + ' : ' + commandName,
    avatar_url: BOT_IMAGE_URL,
    embeds: [
      {
        title: `Proposal: ${proposalId}`,
        description: `${message}`,
        url: proposalUrl,
        color: notification.notificationColor,
      },
    ],
    footer,
  }

  await doAxiosPost({
    type: notification.type,
    url: notification.url,
    payload,
    headers,
  })
}

async function sendSlackNotification(
  notification: SlackNotification,
  {
    proposalVotingAtText,
    message,
    proposalUrl,
    proposalId,
  }: NotificationMessageEnhanced,
): Promise<void> {
  const {
    notifications: { botName },
    commandName,
  } = useContext()
  let footer = `<${proposalUrl}|Check at Realms DAO page`
  footer += proposalVotingAtText ? ` : ${proposalVotingAtText}>` : '>'
  const payload = {
    channel: notification.feed,
    attachments: [
      {
        author_name: botName,
        author_link: proposalUrl,
        author_icon: BOT_IMAGE_URL,
        title: `${botName} ${commandName} : ${proposalId}`,
        color: notification.notificationColor,
        title_link: proposalUrl,
        text: `${message}\nproposal: ${proposalId}`,
        footer,
      },
    ],
  }
  const headersWithAuthorization = {
    ...headers,
    Authorization: `Bearer ${notification.bearerToken}`,
  }

  await doAxiosPost({
    type: notification.type,
    url: SLACK_URL,
    payload,
    headers: headersWithAuthorization,
  })
}

async function doAxiosPost({
  type,
  url,
  payload,
  headers,
}: {
  type: NotificationType
  url: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any
  headers?: Record<string, string>
}) {
  const { logger } = useContext()
  logger.debug(
    'Sending %s notification to "%s" with payload "%s"',
    type,
    new URL(url).origin,
    JSON.stringify(payload),
  )

  try {
    const response = await axios.post(url, payload, { headers })

    if (!response.status || response.status < 200 || response.status >= 300) {
      throw new Error(
        `Failed with status ${response.status}: ${response.statusText} | ${response.data}`,
      )
    }
  } catch (error) {
    throw new ExecutionError({
      msg: `${type} notification error: ${error}`,
      cause: error as Error,
    })
  }
}
