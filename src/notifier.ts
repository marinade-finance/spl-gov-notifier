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
  const proposalId = proposalUrl.split('/').at(-1)
  logger.info(
    'notify proposal: %s, message: %s, url: %s, voting at: %s',
    proposalId,
    message,
    proposalUrl,
    proposalVotingAt?.toISOString()
  )

  let axiosResponse
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
          `\n<a href="${proposalUrl}">Proposal: ${proposalUrl
            .split('/')
            .at(-1)}</a>` +
          footer,
        disable_notification: true,
        parse_mode: 'HTML',
      }
      logger.debug(
        'sending telegram notification to "%s" with payload "%s"',
        url,
        JSON.stringify(payload)
      )
      axiosResponse = await axios.post(url, payload, { headers })
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
          'https://raw.githubusercontent.com/marinade-finance/spl-gov-notifier/62770e10c5310ec3fce2c4c8e134680edcdaf14d/img/bot.jpg',
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
      axiosResponse = await axios.post(notification.url, payload, { headers })
      break
    }
    case NotificationType.WEBHOOK: {
      const footer = proposalVotingAt
        ? ` : 📅 ${proposalVotingAt.toISOString()}`
        : ''
      message = message + ':' + proposalUrl + footer
      axiosResponse = await axios.post(notification.url, { message })
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
  if (axiosResponse.status !== 200) {
    logger.error(
      'failed to send notification %s; axios status: %s, data: %s',
      notification,
      axiosResponse.status,
      JSON.stringify(axiosResponse.data)
    )
  }
}
