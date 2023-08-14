import { NotificationType, useContext } from './context'
import axios from 'axios'

const TELEGRAM_BOT_URL = 'https://api.telegram.org/bot'

const headers = {
  'Content-Type': 'application/json',
}

export async function notify(
  message: string,
  proposalUrl: string,
  proposalVotingAt: Date | undefined
) {
  const { notification, logger, commandName } = useContext()
  const proposalUrlSplit = proposalUrl.split('/')
  const proposalId = proposalUrlSplit[proposalUrlSplit.length - 1]
  logger.info(
    'notify proposal: %s, message: %s, url: %s, voting at: %s',
    proposalId,
    message,
    proposalUrl,
    proposalVotingAt?.toISOString()
  )

  switch (notification.type) {
    case NotificationType.TELEGRAM: {
      const url = `${TELEGRAM_BOT_URL}${notification.botToken}/sendMessage`
      const footer = proposalVotingAt
        ? `\n📅 ${proposalVotingAt.toISOString()}`
        : ''
      const payload = {
        chat_id: notification.chatId,
        text:
          message +
          `\n<a href="${proposalUrl}">Proposal: ${proposalId}</a>` +
          footer,
        disable_notification: true,
        parse_mode: 'HTML',
      }
      logger.debug(
        'sending telegram notification to "%s" with payload "%s"',
        url,
        JSON.stringify(payload)
      )
      await axios.post(url, payload, { headers })
      break
    }
    case NotificationType.DISCORD: {
      const footer = proposalVotingAt
        ? {
            text: `📅 ${proposalVotingAt.toISOString()}`,
          }
        : undefined
      const payload = {
        username: 'SPL Governance Notifier : ' + commandName,
        avatar_url:
          'https://raw.githubusercontent.com/marinade-finance/spl-gov-notifier/0ff4af8db726fd42de014b314c05a5abad152fd7/img/bot.jpg',
        embeds: [
          {
            title: `Proposal: ${proposalId}`,
            description: `${message}`,
            url: proposalUrl,
            color: '13238245', // aero blue
          },
        ],
        footer,
      }
      logger.debug(
        'sending discord notification to "%s/<secret>" with payload "%s, headers: %s"',
        new URL(notification.url).origin,
        JSON.stringify(payload),
        JSON.stringify(headers)
      )
      await axios.post(notification.url, payload, { headers })
      break
    }
    case NotificationType.WEBHOOK: {
      const footer = proposalVotingAt
        ? ` : 📅 ${proposalVotingAt.toISOString()}`
        : ''
      message = message + ':' + proposalUrl + footer
      await axios.post(notification.url, { message })
      logger.debug(
        'sending webhook notification to "%s" with message "%s"',
        notification.url,
        message
      )
      break
    }
    default:
      return
  }
}
