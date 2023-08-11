import { NotificationType, useContext } from './context'
import axios from 'axios'

const TELEGRAM_BOT_URL = 'https://api.telegram.org/bot'

const headers = {
  'Content-Type': 'application/json',
}

export async function notify(message: string) {
  const { notification, logger, commandName } = useContext()
  logger.info('notify: %s', message)

  let axiosResponse
  switch (notification.type) {
    case NotificationType.TELEGRAM: {
      const url = `${TELEGRAM_BOT_URL}${notification.botToken}/sendMessage`
      const payload = {
        chat_id: notification.chatId,
        text: message,
        disable_notification: true,
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
      const payload = {
        "username": "SPL Governance Notifier : " + commandName,
        "avatar_url": "https://raw.githubusercontent.com/marinade-finance/spl-gov-notifier/62770e10c5310ec3fce2c4c8e134680edcdaf14d/img/bot.jpg",
        "embeds": [
            {
                "title": `${message}`,
                "color": "3093151" // blue
            }
        ]
      }
      logger.debug(
        'sending discord notification to "%s" with payload "%s"',
        notification.url,
        JSON.stringify(payload)
      )
      axiosResponse = await axios.post(notification.url, payload, { headers })
      break
    }
    case NotificationType.WEBHOOK: {
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
